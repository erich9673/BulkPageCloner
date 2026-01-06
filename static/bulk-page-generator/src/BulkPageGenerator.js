import React, { useState, useEffect } from 'react';
import { invoke, router } from '@forge/bridge';

const BulkPageGenerator = () => {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Step management
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  
  // Page browser state (Step 1)
  const [allPages, setAllPages] = useState([]);
  const [filteredPages, setFilteredPages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpaceFilter, setSelectedSpaceFilter] = useState('all');
  const [loadingPages, setLoadingPages] = useState(false);
  const [pageTitle, setPageTitle] = useState('');
  
  // Step 2 state - Space & Page Selection
  const [selectedSpace, setSelectedSpace] = useState('');
  const [pageOrganization, setPageOrganization] = useState('create-child');
  const [selectedParentPage, setSelectedParentPage] = useState('');
  const [newParentTitle, setNewParentTitle] = useState('');
  const [spacePages, setSpacePages] = useState([]);
  const [loadingSpacePages, setLoadingSpacePages] = useState(false);
  
  // Step 3 state - Bulk Generation
  const [generationMode, setGenerationMode] = useState('single');
  const [generating, setGenerating] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState(null);
  
  // Numbered configuration
  const [numberedCount, setNumberedCount] = useState(6);
  
  // Weekly configuration
  const [weeklyStartMonth, setWeeklyStartMonth] = useState('October');
  const [weeklyStartDay, setWeeklyStartDay] = useState(16);
  const [weeklyStartYear, setWeeklyStartYear] = useState(2025);
  const [weeklyCount, setWeeklyCount] = useState(4);
  
  // Monthly configuration
  const [monthlyTargetMonth, setMonthlyTargetMonth] = useState('January');
  const [monthlyTargetYear, setMonthlyTargetYear] = useState(2025);
  const [monthlyCount, setMonthlyCount] = useState(3);
  
  // Quarterly configuration
  const [quarterlyStartMonth, setQuarterlyStartMonth] = useState('January');
  const [quarterlyStartQuarter, setQuarterlyStartQuarter] = useState('Q1');
  const [quarterlyTargetYear, setQuarterlyTargetYear] = useState(2025);
  const [quarterlyCount, setQuarterlyCount] = useState(2);

  // Load all pages on component mount
  useEffect(() => {
    loadAllPages();
  }, []);

  // Load all pages from all spaces
  const loadAllPages = async () => {
    setLoadingPages(true);
    setError('');
    
    try {
      // First get all spaces
      const spaceData = await invoke('getSpaces');
      if (spaceData.error) {
        setError(spaceData.error);
        return;
      }
      
      const spacesResult = spaceData.spaces || [];
      setSpaces(spacesResult);
      
      // Then get pages from each space using space key
      const allPagesResult = [];
      for (const space of spacesResult) {
        try {
          // Use space key for API calls (follows original BulkReportGenerator pattern)
          const pagesData = await invoke('getSpacePages', { spaceKey: space.key });
          if (pagesData.pages) {
            const pagesWithSpace = pagesData.pages.map(page => ({
              ...page,
              spaceName: space.name,
              spaceKey: space.key
            }));
            allPagesResult.push(...pagesWithSpace);
          }
        } catch (err) {
          console.error(`Error loading pages for space ${space.key}:`, err);
        }
      }
      
      setAllPages(allPagesResult);
      setFilteredPages(allPagesResult);
    } catch (err) {
      setError('Failed to load pages: ' + err.message);
    } finally {
      setLoadingPages(false);
    }
  };

  // Filter pages based on search and space selection
  useEffect(() => {
    let filtered = [...allPages];
    
    // Filter by space
    if (selectedSpaceFilter !== 'all') {
      filtered = filtered.filter(page => page.spaceKey === selectedSpaceFilter);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(page => 
        page.title.toLowerCase().includes(query) ||
        page.spaceKey.toLowerCase().includes(query) ||
        page.spaceName.toLowerCase().includes(query)
      );
    }
    
    setFilteredPages(filtered);
  }, [allPages, searchQuery, selectedSpaceFilter]);

  // Handle page selection for template (Step 1)
  const handlePageSelect = async (page) => {
    // Validate page title is entered
    if (!pageTitle.trim()) {
      setError('Please enter a page title before selecting a template');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const result = await invoke('uploadTemplate', { 
        pageId: page.id,
        name: `Template: ${page.title}`
      });
      
      if (result.success) {
        // Store the template object with the ID returned from the backend
        setSelectedTemplate(result.template);
        // Progress to step 2
        setCurrentStep(2);
      } else {
        setError(result.error || 'Failed to upload template');
      }
    } catch (err) {
      setError('Failed to upload template: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Load pages for selected space (Step 2)
  const loadSpacePagesForSelection = async (spaceKey) => {
    setLoadingSpacePages(true);
    try {
      const pagesData = await invoke('getSpacePages', { spaceKey });
      if (pagesData.pages) {
        setSpacePages(pagesData.pages);
      }
    } catch (err) {
      console.error('Error loading pages for space:', err);
      setSpacePages([]);
    } finally {
      setLoadingSpacePages(false);
    }
  };
  
  // Handle space selection in step 2
  useEffect(() => {
    if (currentStep === 2 && selectedSpace) {
      loadSpacePagesForSelection(selectedSpace);
    }
  }, [selectedSpace, currentStep]);
  
  // Handle next button in step 2
  const handleNextStep = () => {
    console.log('handleNextStep called', {
      selectedSpace,
      pageOrganization,
      selectedParentPage,
      newParentTitle
    });
    
    // Validate
    if (!selectedSpace) {
      console.log('Validation failed: No space selected');
      setError('Please select a Confluence space');
      return;
    }
    
    if (!pageOrganization) {
      console.log('Validation failed: No page organization selected');
      setError('Please select a page organization option');
      return;
    }
    
    if (pageOrganization === 'create-child' && !selectedParentPage) {
      console.log('Validation failed: create-child mode but no parent page');
      setError('Please select a parent page');
      return;
    }
    
    if (pageOrganization === 'create' && !newParentTitle.trim()) {
      console.log('Validation failed: create mode but no parent title');
      setError('Please enter a title for the new parent page');
      return;
    }
    
    console.log('Validation passed, moving to step 3');
    setError('');
    // Progress to step 3 (bulk generation)
    setCurrentStep(3);
  };

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'inherit',
      width: '100%',
      maxWidth: 'none',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>
      {/* Messages */}
      {error && (
        <div style={{
          backgroundColor: '#FFEBE6',
          border: '1px solid #FF8F73',
          color: '#BF2600',
          padding: '12px',
          borderRadius: '3px',
          marginBottom: '20px',
          fontFamily: 'inherit'
        }}>
          {error}
        </div>
      )}

      {/* Step 1: Select Page as Template */}
      {currentStep === 1 && (
        <div style={{ 
          backgroundColor: 'white', 
          padding: '20px', 
          borderRadius: '3px', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          width: '100%',
          boxSizing: 'border-box',
          overflowX: 'auto'
        }}>
          <h3 style={{ 
            marginBottom: '16px', 
            color: '#172B4D', 
            fontWeight: 'bold',
            fontSize: '22px',
            fontFamily: 'inherit' 
          }}>
            📄 Select Page as Template
          </h3>
        <p style={{ 
          marginBottom: '16px', 
          color: 'black',
          fontSize: '15px', 
          fontFamily: 'inherit' 
        }}>
          Browse and select any Confluence page to use as your template for bulk generation.
        </p>
       
        {/* Search Pages Section */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '6px', 
            fontWeight: '600', 
            color: '#172B4D', 
            fontFamily: 'inherit' 
          }}>
            🔍 Search Pages
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search page titles, spaces, or URLs..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #DFE1E6',
              borderRadius: '3px',
              fontSize: '14px',
              fontFamily: 'inherit'
            }}
          />
        </div>
        
        {/* Filter by Space Section */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '6px', 
            fontWeight: '600', 
            color: '#172B4D', 
            fontFamily: 'inherit' 
          }}>
            📁 Filter by Space
          </label>
          <select
            value={selectedSpaceFilter}
            onChange={(e) => setSelectedSpaceFilter(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '300px',
              padding: '8px 12px',
              border: '1px solid #DFE1E6',
              borderRadius: '3px',
              fontSize: '14px',
              fontFamily: 'inherit'
            }}
          >
            <option value="all">All Spaces</option>
            {spaces.map((space) => (
              <option key={space.key} value={space.key}>
                {space.name} ({space.key})
              </option>
            ))}
          </select>
        </div>

        {/* Page Title Section */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '6px', 
            fontWeight: '600', 
            color: '#172B4D', 
            fontFamily: 'inherit' 
          }}>
            📝 Page Title
          </label>
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => setPageTitle(e.target.value)}
            placeholder="Enter the title for your page..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #DFE1E6',
              borderRadius: '3px',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ 
          marginBottom: '16px', 
          color: 'black',
          fontWeight: 'bold', 
          fontSize: '14px', 
          fontFamily: 'inherit' 
        }}>
          📄 Found {filteredPages.length} pages
        </div>

        {/* Pages Table */}
        {loadingPages ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            color: '#6B778C', 
            fontFamily: 'inherit' 
          }}>
            Loading pages...
          </div>
        ) : (
          <table style={{ 
            border: '1px solid #DFE1E6', 
            borderRadius: '3px', 
            borderCollapse: 'collapse', 
            width: '100%',
            tableLayout: 'fixed'
          }}>
            <thead>
              <tr style={{ 
                backgroundColor: '#F4F5F7', 
                borderBottom: '1px solid #DFE1E6' 
              }}>
                <th style={{ 
                  padding: '12px', 
                  textAlign: 'left', 
                  fontWeight: '600', 
                  color: '#172B4D', 
                  fontFamily: 'inherit',
                  width: '35%',
                  wordWrap: 'break-word'
                }}>
                  Page Title
                </th>
                <th style={{ 
                  padding: '12px', 
                  textAlign: 'left', 
                  fontWeight: '600', 
                  color: '#172B4D', 
                  fontFamily: 'inherit',
                  width: '30%'
                }}>
                  Space
                </th>
                <th style={{ 
                  padding: '12px', 
                  textAlign: 'left', 
                  fontWeight: '600', 
                  color: '#172B4D', 
                  fontFamily: 'inherit',
                  width: '20%'
                }}>
                  Last Modified
                </th>
                <th style={{ 
                  padding: '12px', 
                  textAlign: 'center', 
                  fontWeight: '600', 
                  color: '#172B4D', 
                  fontFamily: 'inherit',
                  width: '15%'
                }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPages.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ 
                    padding: '20px', 
                    textAlign: 'center', 
                    color: 'black', 
                    fontFamily: 'inherit' 
                  }}>
                    {searchQuery || selectedSpaceFilter !== 'all' 
                      ? 'No pages found matching your search criteria.'
                      : 'No pages available.'
                    }
                  </td>
                </tr>
              ) : (
                filteredPages.slice(0, 50).map((page) => (
                  <tr key={page.id} style={{ borderBottom: '1px solid #F4F5F7' }}>
                    <td style={{ 
                      padding: '12px', 
                      color: 'black', 
                      fontFamily: 'inherit',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word'
                    }}>
                      {page.title}
                    </td>
                    <td style={{ 
                      padding: '12px', 
                      color: 'black', 
                      fontSize: '14px', 
                      fontFamily: 'inherit',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word'
                    }}>
                      {page.spaceName} ({page.spaceKey})
                    </td>
                    <td style={{ 
                      padding: '12px', 
                      color: 'black', 
                      fontSize: '14px', 
                      fontFamily: 'inherit',
                      wordWrap: 'break-word'
                    }}>
                      {page.lastModified || 'Unknown'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handlePageSelect(page)}
                        disabled={loading}
                        style={{
                          backgroundColor: loading ? '#DFE1E6' : '#0052CC',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '3px',
                          fontSize: '14px',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit'
                        }}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
        </div>
      )}
      
      {/* Step 2: Space & Page Selection */}
      {currentStep === 2 && (
        <div style={{ 
          backgroundColor: 'white', 
          padding: '20px', 
          borderRadius: '3px', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          width: '100%',
          boxSizing: 'border-box',
          overflowX: 'auto'
        }}>
          <h3 style={{ 
            marginBottom: '8px', 
            color: '#172B4D', 
            fontWeight: 'bold',
            fontSize: '22px',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>📁</span> Space & Page Selection
          </h3>
          
          {/* Selected Template Info */}
          {selectedTemplate && (
            <div style={{
              backgroundColor: '#E3FCEF',
              padding: '12px',
              borderRadius: '3px',
              marginBottom: '20px',
              fontSize: '14px',
              color: '#006644',
              fontFamily: 'inherit'
            }}>
              ✅ Template: <strong>{selectedTemplate.name || selectedTemplate.sourcePageTitle}</strong> | NEW Page Title: <strong>{pageTitle || '(not entered)'}</strong>
            </div>
          )}
          
          {/* Select Confluence Space */}
          <div style={{
            backgroundColor: '#DEEBFF',
            padding: '20px',
            borderRadius: '3px',
            marginBottom: '20px'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ 
                display: 'block', 
                fontWeight: 'bold',
                color: '#172B4D',
                marginBottom: '4px',
                fontFamily: 'inherit'
              }}>
                📁 Select Confluence Space
              </label>
              <p style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                color: '#172B4D',
                fontFamily: 'inherit' 
              }}>
                Choose the Confluence space where your reports will be created.
              </p>
              <select
                value={selectedSpace}
                onChange={(e) => {
                  setSelectedSpace(e.target.value);
                  setSelectedParentPage('');
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #0052CC',
                  borderRadius: '3px',
                  fontSize: '14px',
                  fontFamily: 'inherit'
                }}
              >
                <option value="">Select a space...</option>
                {spaces.map((space) => (
                  <option key={space.key} value={space.key}>
                    {space.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Page Organization */}
          {selectedSpace && (
            <div style={{
              backgroundColor: '#F4F5F7',
              padding: '20px',
              borderRadius: '3px',
              marginBottom: '20px'
            }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 'bold',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  <span>📄</span> Page Organization
                </label>
                <p style={{ 
                  margin: '0 0 16px 0', 
                  fontSize: '14px', 
                  color: 'black',
                  fontFamily: 'inherit' 
                }}>
                  Choose how you want to organize your reports in the selected space.
                </p>
              </div>
              
              {/* Radio option 1: Create child under existing parent */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="pageOrganization"
                    value="create-child"
                    checked={pageOrganization === 'create-child'}
                    onChange={(e) => setPageOrganization(e.target.value)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', color: '#172B4D', fontFamily: 'inherit' }}>
                      📁 Create child(s) page under an existing parent page
                    </div>
                    <div style={{ fontSize: '13px', color: 'black', marginTop: '4px', fontFamily: 'inherit' }}>
                      Select an existing page to organize your reports underneath it
                    </div>
                  </div>
                </label>
              </div>
              
              {/* Radio option 2: Create as parent page */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="pageOrganization"
                    value="create-parent"
                    checked={pageOrganization === 'create-parent'}
                    onChange={(e) => {
                      console.log('Radio changed to:', e.target.value);
                      setPageOrganization(e.target.value);
                    }}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', color: '#172B4D', fontFamily: 'inherit' }}>
                      📄 Create as a parent page under '{spaces.find(s => s.key === selectedSpace)?.name}'
                    </div>
                    <div style={{ fontSize: '13px', color: 'black', marginTop: '4px', fontFamily: 'inherit' }}>
                      Reports will be created directly in the space as top-level pages
                    </div>
                  </div>
                </label>
              </div>
              
              {/* Radio option 3: Create new parent and child */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="pageOrganization"
                    value="create"
                    checked={pageOrganization === 'create'}
                    onChange={(e) => setPageOrganization(e.target.value)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', color: '#172B4D', fontFamily: 'inherit' }}>
                      📁 Create new parent and child page
                    </div>
                    <div style={{ fontSize: '13px', color: 'black', marginTop: '4px', fontFamily: 'inherit' }}>
                      Create a new parent page, then generate reports as child pages under it
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}
          
          {/* Select Existing Parent Page (only for create-child mode) */}
          {selectedSpace && pageOrganization === 'create-child' && (
            <div style={{
              backgroundColor: '#FFFAE6',
              padding: '20px',
              borderRadius: '3px',
              marginBottom: '20px',
              border: '1px solid #FFC400'
            }}>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 'bold',
                color: '#172B4D',
                marginBottom: '8px',
                fontFamily: 'inherit'
              }}>
                <span>📄</span> Select Existing Parent Page
              </label>
              <p style={{ 
                margin: '0 0 12px 0', 
                fontSize: '13px', 
                color: '#172B4D',
                fontFamily: 'inherit' 
              }}>
                Choose the parent page under which your report child pages will be created. We list only the pages that are direct children of the space homepage.
              </p>
              {loadingSpacePages ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#6B778C', fontFamily: 'inherit' }}>
                  Loading pages...
                </div>
              ) : (
                <select
                  value={selectedParentPage}
                  onChange={(e) => setSelectedParentPage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #FFC400',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  <option value="">Select a parent page...</option>
                  {spacePages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          
          {/* New Parent Page Title (only for create mode) */}
          {selectedSpace && pageOrganization === 'create' && (
            <div style={{
              backgroundColor: '#E6FCFF',
              padding: '20px',
              borderRadius: '3px',
              marginBottom: '20px',
              border: '1px solid #00B8D9'
            }}>
              <label style={{ 
                display: 'block',
                fontWeight: 'bold',
                color: '#172B4D',
                marginBottom: '8px',
                fontFamily: 'inherit'
              }}>
                📁 New Parent Page Title
              </label>
              <p style={{ 
                margin: '0 0 12px 0', 
                fontSize: '13px', 
                color: '#172B4D',
                fontFamily: 'inherit' 
              }}>
                Enter the title for the new parent page that will contain your report pages.
              </p>
              <input
                type="text"
                value={newParentTitle}
                onChange={(e) => setNewParentTitle(e.target.value)}
                placeholder="e.g., Q3 2025 Reports"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #00B8D9',
                  borderRadius: '3px',
                  fontSize: '14px',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          )}
          
          {/* Navigation Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
            <button
              onClick={() => {
                setCurrentStep(1);
                setError('');
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#0052CC',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline'
              }}
            >
              ← Select Page as Template
            </button>
            <button
              onClick={() => {
                console.log('Button clicked!');
                handleNextStep();
              }}
              disabled={!selectedSpace || 
                !pageOrganization ||
                (pageOrganization === 'create-child' && !selectedParentPage) ||
                (pageOrganization === 'create' && !newParentTitle.trim())
              }
              style={{
                padding: '10px 20px',
                backgroundColor: (!selectedSpace || 
                  !pageOrganization ||
                  (pageOrganization === 'create-child' && !selectedParentPage) ||
                  (pageOrganization === 'create' && !newParentTitle.trim())) 
                  ? '#DFE1E6' : '#0052CC',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (!selectedSpace || 
                  !pageOrganization ||
                  (pageOrganization === 'create-child' && !selectedParentPage) ||
                  (pageOrganization === 'create' && !newParentTitle.trim())) 
                  ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit'
              }}
            >
              Bulk Generate
            </button>
          </div>
        </div>
      )}
      
      {/* Step 3: Bulk Generation */}
      {currentStep === 3 && (
        <div style={{ 
          backgroundColor: 'white', 
          padding: '20px', 
          borderRadius: '3px', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          width: '100%',
          boxSizing: 'border-box',
          overflowX: 'auto'
        }}>
          <h3 style={{ 
            marginBottom: '8px', 
            color: '#172B4D', 
            fontWeight: 'bold',
            fontSize: '22px',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>📅</span> Bulk Page Generator for Confluence
          </h3>
          
          <p style={{ 
            marginBottom: '20px', 
            color: 'black',
            fontSize: '14px', 
            fontFamily: 'inherit' 
          }}>
            Bulk page generation allows you to create multiple pages with various date formats (weekly, monthly, quarterly) or numbered sequences within a specific timeframe, perfect for comprehensive content organization and analysis.
          </p>
          
          {/* Selected Template & Page Info */}
          {selectedTemplate && (
            <div style={{
              backgroundColor: '#E3FCEF',
              padding: '12px',
              borderRadius: '3px',
              marginBottom: '20px',
              fontSize: '14px',
              color: '#006644',
              fontFamily: 'inherit'
            }}>
              ✅ Template: <strong>{selectedTemplate.name || selectedTemplate.sourcePageTitle}</strong> | Page Title: <strong>{pageTitle}</strong> | Space: <strong>{spaces.find(s => s.key === selectedSpace)?.name}</strong>
            </div>
          )}
          
          {/* Date Format Selection */}
          <div style={{
            backgroundColor: '#F4F5F7',
            padding: '20px',
            borderRadius: '3px',
            marginBottom: '20px'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 'bold',
                color: '#172B4D',
                marginBottom: '8px',
                fontFamily: 'inherit'
              }}>
                <span>📅</span> Date Format Selection
              </label>
              <p style={{ 
                margin: '0 0 16px 0', 
                fontSize: '14px', 
                color: 'black',
                fontFamily: 'inherit' 
              }}>
                Choose your page generation mode: create a single page, generate multiple numbered pages, or create date-based pages (weekly, monthly, quarterly). Numbered pages are perfect for creating template sets or multiple versions without date constraints.
              </p>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 'bold',
                color: '#172B4D',
                marginBottom: '12px',
                fontFamily: 'inherit'
              }}>
                <span>📅</span> Page Generation Mode
              </label>
            </div>
            
            {/* Radio option 1: Single Page */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="generationMode"
                  value="single"
                  checked={generationMode === 'single'}
                  onChange={(e) => setGenerationMode(e.target.value)}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <div style={{ color: '#172B4D', fontFamily: 'inherit' }}>
                    📄 Single Page (No Date)
                  </div>
                </div>
              </label>
            </div>
            
            {/* Radio option 2: Bulk Numbered */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="generationMode"
                  value="numbered"
                  checked={generationMode === 'numbered'}
                  onChange={(e) => setGenerationMode(e.target.value)}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <div style={{ color: '#172B4D', fontFamily: 'inherit' }}>
                    🔢 Bulk Numbered Pages (e.g., Marketing Page (1), Marketing Page (2))
                  </div>
                </div>
              </label>
            </div>
            
            {/* Radio option 3: Weekly */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="generationMode"
                  value="weekly"
                  checked={generationMode === 'weekly'}
                  onChange={(e) => setGenerationMode(e.target.value)}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <div style={{ color: '#172B4D', fontFamily: 'inherit' }}>
                    📅 Weekly Date Format (e.g., 'August 9, 2025')
                  </div>
                </div>
              </label>
            </div>
            
            {/* Radio option 4: Monthly */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="generationMode"
                  value="monthly"
                  checked={generationMode === 'monthly'}
                  onChange={(e) => setGenerationMode(e.target.value)}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <div style={{ color: '#172B4D', fontFamily: 'inherit' }}>
                    📆 Monthly Date Format (e.g., 'August 2025')
                  </div>
                </div>
              </label>
            </div>
            
            {/* Radio option 5: Quarterly */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="generationMode"
                  value="quarterly"
                  checked={generationMode === 'quarterly'}
                  onChange={(e) => setGenerationMode(e.target.value)}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <div style={{ color: '#172B4D', fontFamily: 'inherit' }}>
                    📆 Quarterly Date Format (e.g., 'Q1 2025')
                  </div>
                </div>
              </label>
            </div>
          </div>
          
          {/* Numbered Pages Configuration */}
          {generationMode === 'numbered' && (
            <div style={{
              backgroundColor: '#F0E6FF',
              padding: '20px',
              borderRadius: '3px',
              marginBottom: '20px'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 'bold',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  <span>🔢</span> Numbered Pages Configuration
                </label>
                <p style={{ 
                  margin: '0 0 16px 0', 
                  fontSize: '14px', 
                  color: 'black',
                  fontFamily: 'inherit' 
                }}>
                  Generate multiple pages with numbered titles to prevent duplicates. Perfect for creating template sets or multiple versions.
                </p>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Number of Pages to Generate
                </label>
                <select
                  value={numberedCount}
                  onChange={(e) => setNumberedCount(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {[...Array(20)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} pages</option>
                  ))}
                </select>
                <p style={{ 
                  margin: '8px 0 0 0', 
                  fontSize: '13px', 
                  color: '#6B778C',
                  fontFamily: 'inherit' 
                }}>
                  Pages will be named: "{pageTitle} (1)", "{pageTitle} (2)", etc.
                </p>
              </div>
              
              <div style={{
                backgroundColor: '#E3FCEF',
                padding: '12px',
                borderRadius: '3px',
                marginTop: '12px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#006644', fontFamily: 'inherit' }}>
                  📝 Preview:
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#006644', fontFamily: 'inherit' }}>
                  • {pageTitle} (1) • {pageTitle} (2) • {pageTitle} (3) ... and {numberedCount - 3} more
                </p>
              </div>
            </div>
          )}
          
          {/* Weekly Configuration */}
          {generationMode === 'weekly' && (
            <div style={{
              backgroundColor: '#FFF4E6',
              padding: '20px',
              borderRadius: '3px',
              marginBottom: '20px'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 'bold',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  <span>📅</span> Weekly Page Configuration
                </label>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Start Month & Day
                </label>
                <p style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '13px', 
                  color: 'black',
                  fontFamily: 'inherit' 
                }}>
                  Choose the starting month and day for your first weekly page.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <select
                    value={weeklyStartMonth}
                    onChange={(e) => setWeeklyStartMonth(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: '1px solid #DFE1E6',
                      borderRadius: '3px',
                      fontSize: '14px',
                      fontFamily: 'inherit'
                    }}
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                  <select
                    value={weeklyStartDay}
                    onChange={(e) => setWeeklyStartDay(parseInt(e.target.value))}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: '1px solid #DFE1E6',
                      borderRadius: '3px',
                      fontSize: '14px',
                      fontFamily: 'inherit'
                    }}
                  >
                    {[...Array(31)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Start Year
                </label>
                <select
                  value={weeklyStartYear}
                  onChange={(e) => setWeeklyStartYear(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Number of Pages to Generate
                </label>
                <select
                  value={weeklyCount}
                  onChange={(e) => setWeeklyCount(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {[...Array(52)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} pages</option>
                  ))}
                </select>
                <p style={{ 
                  margin: '8px 0 0 0', 
                  fontSize: '13px', 
                  color: '#6B778C',
                  fontFamily: 'inherit' 
                }}>
                  Number of weekly pages to generate (e.g., {weeklyCount} pages = {weeklyCount} consecutive weeks)
                </p>
              </div>
              
              <div style={{
                backgroundColor: '#E3FCEF',
                padding: '12px',
                borderRadius: '3px',
                marginTop: '12px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#006644', fontFamily: 'inherit' }}>
                  📅 Date Preview:
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#006644', fontFamily: 'inherit' }}>
                  • Week of {weeklyStartMonth} {weeklyStartDay}, {weeklyStartYear} • Week of {weeklyStartMonth} {weeklyStartDay + 7}, {weeklyStartYear} ... and {weeklyCount - 2} more weeks
                </p>
              </div>
            </div>
          )}
          
          {/* Monthly Configuration */}
          {generationMode === 'monthly' && (
            <div style={{
              backgroundColor: '#E6F7FF',
              padding: '20px',
              borderRadius: '3px',
              marginBottom: '20px'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 'bold',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  <span>📆</span> Monthly Page Configuration
                </label>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Target Month
                </label>
                <select
                  value={monthlyTargetMonth}
                  onChange={(e) => setMonthlyTargetMonth(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                    <option key={month} value={month}>{month}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Target Year
                </label>
                <select
                  value={monthlyTargetYear}
                  onChange={(e) => setMonthlyTargetYear(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Number of Pages to Generate
                </label>
                <select
                  value={monthlyCount}
                  onChange={(e) => setMonthlyCount(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {[...Array(24)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} pages</option>
                  ))}
                </select>
                <p style={{ 
                  margin: '8px 0 0 0', 
                  fontSize: '13px', 
                  color: '#6B778C',
                  fontFamily: 'inherit' 
                }}>
                  Number of monthly pages to generate (e.g., {monthlyCount} pages = next {monthlyCount} months)
                </p>
              </div>
              
              <div style={{
                backgroundColor: '#E3FCEF',
                padding: '12px',
                borderRadius: '3px',
                marginTop: '12px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#006644', fontFamily: 'inherit' }}>
                  📅 Page Date Format Preview
                </div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#006644', fontFamily: 'inherit' }}>
                  Dates will be formatted as: "January 5, 2026"
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#006644', fontFamily: 'inherit', fontWeight: 'bold' }}>
                  📊 Page title format: "{pageTitle} - {monthlyTargetMonth} {monthlyTargetYear}"
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#006644', fontFamily: 'inherit' }}>
                  📊 Will generate {monthlyCount} monthly pages
                </p>
              </div>
            </div>
          )}
          
          {/* Quarterly Configuration */}
          {generationMode === 'quarterly' && (
            <div style={{
              backgroundColor: '#FFF0F6',
              padding: '20px',
              borderRadius: '3px',
              marginBottom: '20px'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 'bold',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  <span>📆</span> Quarterly Page Configuration
                </label>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Quarter Start Month
                </label>
                <p style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '13px', 
                  color: 'black',
                  fontFamily: 'inherit' 
                }}>
                  Fiscal Year: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
                </p>
                <select
                  value={quarterlyStartMonth}
                  onChange={(e) => setQuarterlyStartMonth(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                    <option key={month} value={month}>{month}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Select Quarter To Start On
                </label>
                <select
                  value={quarterlyStartQuarter}
                  onChange={(e) => setQuarterlyStartQuarter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {['Q1', 'Q2', 'Q3', 'Q4'].map(quarter => (
                    <option key={quarter} value={quarter}>{quarter}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Target Year
                </label>
                <select
                  value={quarterlyTargetYear}
                  onChange={(e) => setQuarterlyTargetYear(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block',
                  fontWeight: '600',
                  color: '#172B4D',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}>
                  Number of Pages to Generate
                </label>
                <select
                  value={quarterlyCount}
                  onChange={(e) => setQuarterlyCount(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                >
                  {[...Array(12)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} pages</option>
                  ))}
                </select>
                <p style={{ 
                  margin: '8px 0 0 0', 
                  fontSize: '13px', 
                  color: '#6B778C',
                  fontFamily: 'inherit' 
                }}>
                  Number of quarterly pages to generate (e.g., {quarterlyCount} pages = next {quarterlyCount} quarters)
                </p>
              </div>
              
              <div style={{
                backgroundColor: '#E3FCEF',
                padding: '12px',
                borderRadius: '3px',
                marginTop: '12px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#006644', fontFamily: 'inherit' }}>
                  📅 Page Date Format Preview
                </div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#006644', fontFamily: 'inherit' }}>
                  Dates will be formatted as: "January 5, 2026"
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#006644', fontFamily: 'inherit', fontWeight: 'bold' }}>
                  📊 Page title format: "{pageTitle} - {quarterlyStartQuarter} {quarterlyTargetYear}"
                </p>
              </div>
            </div>
          )}
          
          {/* Date & Timestamp Configuration */}
          <div style={{
            backgroundColor: '#DEEBFF',
            padding: '20px',
            borderRadius: '3px',
            marginBottom: '20px'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 'bold',
                color: '#172B4D',
                marginBottom: '8px',
                fontFamily: 'inherit'
              }}>
                <span>📅</span> Date & Timestamp Configuration
              </label>
              <p style={{ 
                margin: '0', 
                fontSize: '14px', 
                color: 'black',
                fontFamily: 'inherit' 
              }}>
                <strong>Page Dates</strong> and <strong>Show Last Updated</strong> will automatically be included in your pages
              </p>
            </div>
          </div>
          
          {/* Navigation Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
            <button
              onClick={() => {
                setCurrentStep(2);
                setError('');
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#0052CC',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline'
              }}
            >
              ← Space & Page Selection
            </button>
            <button
              onClick={async () => {
                try {
                  console.log('Generate Pages button clicked');
                  setGenerating(true);
                  setError('');
                  
                  // Call the bulk generation resolver
                  const result = await invoke('bulkGeneratePages', {
                    templateId: selectedTemplate.id,
                    spaceKey: selectedSpace,
                    parentPageId: selectedParentPage,
                    pageTitle: pageTitle,
                    generationMode: generationMode,
                    numberedCount: numberedCount,
                    weeklyStartMonth: weeklyStartMonth,
                    weeklyStartDay: weeklyStartDay,
                    weeklyStartYear: weeklyStartYear,
                    weeklyCount: weeklyCount,
                    monthlyTargetMonth: monthlyTargetMonth,
                    monthlyTargetYear: monthlyTargetYear,
                    monthlyCount: monthlyCount,
                    quarterlyStartMonth: quarterlyStartMonth,
                    quarterlyStartQuarter: quarterlyStartQuarter,
                    quarterlyTargetYear: quarterlyTargetYear,
                    quarterlyCount: quarterlyCount,
                    pageOrganization: pageOrganization,
                    newParentTitle: newParentTitle
                  });
                  
                  console.log('Generate result:', result);
                  
                  if (result.success) {
                    // Show success state instead of alert
                    setGenerationSuccess({
                      reportCount: result.reportCount,
                      pages: result.pages,
                      firstPageUrl: result.firstPageUrl,
                      message: result.message
                    });
                    setCurrentStep(4); // Move to success page
                  } else {
                    setError(result.error || 'Failed to generate pages');
                  }
                } catch (err) {
                  console.error('Error generating pages:', err);
                  setError(`Error: ${err.message}`);
                } finally {
                  setGenerating(false);
                }
              }}
              disabled={generating}
              style={{
                padding: '10px 20px',
                backgroundColor: generating ? '#DFE1E6' : '#0052CC',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: generating ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit'
              }}
            >
              {generating ? 'Creating Pages...' : 'Create Pages'}
            </button>
          </div>
        </div>
      )}

      {/* Success Page - Step 4 */}
      {currentStep === 4 && generationSuccess && (
        <div style={{
          padding: '20px',
          backgroundColor: '#DFF0D8',
          minHeight: '200px'
        }}>
          {/* Success Message */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            marginBottom: '20px'
          }}>
            <span style={{ 
              fontSize: '18px',
              color: '#3C763D',
              flexShrink: 0
            }}>✅</span>
            <div style={{
              fontSize: '14px', 
              color: '#3C763D',
              lineHeight: '1.8'
            }}>
              {generationSuccess.pages && generationSuccess.pages.length > 0 ? (
                generationSuccess.pages.map((page, index) => (
                  <div key={index}>
                    <strong>"{page.title}"</strong> has been created successfully! Click here to{' '}
                    <a 
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        router.open(page.url);
                      }}
                      style={{
                        color: '#337AB7',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      Open
                    </a>
                  </div>
                ))
              ) : (
                <div>
                  <strong>Page</strong> has been created successfully! Click here to{' '}
                  <a 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      router.open(generationSuccess.firstPageUrl);
                    }}
                    style={{
                      color: '#337AB7',
                      textDecoration: 'underline',
                      cursor: 'pointer'
                    }}
                  >
                    Open
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Create Another Button */}
          <button
            onClick={() => {
              // Reset all state
              setGenerationSuccess(null);
              setCurrentStep(1);
              setSelectedTemplate(null);
              setPageTitle('');
              setSelectedSpace('');
              setSelectedParentPage('');
              setNewParentTitle('');
              setPageOrganization('create-child');
              setGenerationMode('single');
              setNumberedCount(6);
              setWeeklyStartMonth('October');
              setWeeklyStartDay(16);
              setWeeklyStartYear(2025);
              setWeeklyCount(4);
              setMonthlyTargetMonth('January');
              setMonthlyTargetYear(2025);
              setMonthlyCount(3);
              setQuarterlyStartMonth('January');
              setQuarterlyStartQuarter('Q1');
              setQuarterlyTargetYear(2025);
              setQuarterlyCount(2);
              setError('');
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0052CC',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            Create Another Page
          </button>
        </div>
      )}
    </div>
  );
};

export default BulkPageGenerator;