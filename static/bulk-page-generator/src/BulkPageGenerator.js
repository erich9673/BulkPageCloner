import React, { useState, useEffect } from 'react';
import { invoke, router, view } from '@forge/bridge';

const BulkPageGenerator = () => {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Step management
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  
  // Page browser state (Step 1)
  const [confluencePageUrl, setConfluencePageUrl] = useState('');
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

  // Load all pages and check context on component mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!mounted) return;

      // Context detection removed as it's not used
      await loadAllPages();
    };

    load();
    return () => { mounted = false; };
  }, []);

  // Load all pages from all spaces - OPTIMIZED VERSION with timeout handling
  const loadAllPages = async () => {
    setLoadingPages(true);
    setError('');
    
    try {
      console.log('🚀 Loading pages with balanced approach...');
      
      // Use the optimized backend function with timeout handling
      const result = await invoke('getAllPagesOptimized');
      
      if (result.error) {
        // If we got an error but still have some pages, show them
        if (result.pages && result.pages.length > 0) {
          setSpaces(result.spaces || []);
          setAllPages(result.pages);
          setFilteredPages(result.pages);
          setError(`Partial load completed: ${result.error}. Showing ${result.pages.length} pages.`);
        } else {
          setError('Failed to load pages: ' + result.error);
        }
        return;
      }
      
      // Set spaces and pages from the optimized response
      setSpaces(result.spaces || []);
      setAllPages(result.pages || []);
      setFilteredPages(result.pages || []);
      
      console.log(`✅ Loaded ${result.totalCount} pages from ${result.loadedSpaces} spaces`);
      
    } catch (err) {
      // Check if it's a timeout error and provide better messaging
      if (err.message && err.message.includes('timed out')) {
        setError('Loading is taking longer than expected. Please try again or contact support if this persists.');
      } else {
        setError('Failed to load pages: ' + err.message);
      }
      console.error('❌ loadAllPages error:', err);
    } finally {
      setLoadingPages(false);
    }
  };

  // Handle URL-based page loading
  const handleUrlLoad = async () => {
    if (!confluencePageUrl.trim()) {
      setError('Please enter a Confluence page URL');
      return;
    }
    
    setLoadingPages(true);
    setError('');
    
    try {
      const result = await invoke('loadPagesFromUrl', { url: confluencePageUrl });
      
      if (result.success) {
        // For direct URL mode, skip page browsing and go straight to template upload
        if (result.directMode && result.targetPage) {
          console.log(`🎯 Direct mode: Auto-selecting page ${result.targetPage.title}`);
          
          // Check if page title is entered before proceeding
          if (!pageTitle.trim()) {
            setError('Please enter a page title then press 🔍 Load from URL');
            return;
          }
          
          // Load ALL spaces for Step 2 selection, not just the template space
          const allSpacesResult = await invoke('getAllSpaces');
          if (allSpacesResult.success) {
            setSpaces(allSpacesResult.spaces);
          } else {
            setSpaces(result.spaces || []); // Fallback to template space
          }
          
          // Don't auto-generate title, use what the user entered
          
          // Directly upload template and move to Step 2
          try {
            const uploadResult = await invoke('uploadTemplate', { 
              pageId: result.targetPage.id,
              name: `Template: ${result.targetPage.title}`
            });
            
            if (uploadResult.success) {
              setSelectedTemplate(uploadResult.template);
              setCurrentStep(2);
              console.log('✅ Direct selection successful, moved to Step 2');
            } else {
              setError('Failed to upload template: ' + (uploadResult.error || 'Unknown error'));
            }
          } catch (err) {
            setError('Failed to upload template: ' + err.message);
          }
        } else {
          // Original flow for browsing pages
          setSpaces(result.spaces || []);
          setAllPages(result.pages || []);
          setFilteredPages(result.pages || []);
          console.log(`✅ Loaded ${result.pages?.length || 0} pages from URL`);
        }
      } else {
        setError('Failed to load pages from URL: ' + result.error);
      }
    } catch (err) {
      setError('Failed to load pages from URL: ' + err.message);
    } finally {
      setLoadingPages(false);
    }
  };

  // Filter pages based on search and space selection (memoized for performance)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      let filtered = allPages;
      
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
    }, 300); // 300ms debounce for better performance
    
    return () => clearTimeout(timeoutId);
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
      // Use optimized parent page loader for Step 3 organization
      const pagesData = await invoke('getParentPageOptions', { spaceKey });
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

  const handleClose = async () => {
    try {
      await view.close();
    } catch (error) {
      console.error('Error closing view:', error);
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
      width: '100%',
      maxWidth: 'none',
      boxSizing: 'border-box',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* X Close Button - positioned in top-right corner */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '32px',
          height: '32px',
          backgroundColor: 'transparent',
          border: '1px solid #DFE1E6',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          color: '#6B778C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          transition: 'all 0.2s ease',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = '#F4F5F7';
          e.target.style.borderColor = '#B3B9C4';
          e.target.style.color = '#000000';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = 'transparent';
          e.target.style.borderColor = '#DFE1E6';
          e.target.style.color = '#6B778C';
        }}
        title="Close"
      >
        ✕
      </button>
      
      {/* Messages */}
      {error && (
        <div style={{
          backgroundColor: '#FFEBE6',
          border: '1px solid #FF8F73',
          color: '#BF2600',
          padding: '12px',
          borderRadius: '3px',
          marginBottom: '20px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
            color: '#000000', 
            fontWeight: 'bold',
            fontSize: '22px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
          }}>
            📄 Select Page as Template
          </h3>
        <p style={{ 
          marginBottom: '16px', 
          color: 'black',
          fontSize: '15px', 
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
        }}>
          Browse and select any Confluence page to use as your template for bulk generation.
        </p>
        
        {/* Page Title Section - MOVED TO TOP */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '6px', 
            fontWeight: '600', 
            color: '#000000', 
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
          }}>
            📝 Enter New Page Title
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
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
              boxSizing: 'border-box'
            }}
          />
        </div>
        
        {/* Helpful tip and URL input */}
        <p style={{ 
          color: '#6B778C', 
          fontSize: '13px', 
          marginBottom: '8px',
          fontStyle: 'italic'
        }}>
          💡 <strong>Can't find your page?</strong> Copy and paste the Confluence link into the URL field below (limited to 5000 pages for performance).
        </p>
        
        {/* Confluence Page URL Input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            marginBottom: '6px',
            color: 'black',
            fontWeight: 'bold',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
          }}>
            Confluence Page URL:
          </label>
          <input
            type="text"
            value={confluencePageUrl}
            onChange={(e) => setConfluencePageUrl(e.target.value)}
            placeholder="Paste URL here to load pages from specific space..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #DFE1E6',
              borderRadius: '3px',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
              backgroundColor: 'white',
              color: 'black',
              boxSizing: 'border-box'
            }}
          />
          {confluencePageUrl && (
            <button
              onClick={() => handleUrlLoad()}
              disabled={loadingPages}
              style={{
                marginTop: '8px',
                padding: '8px 16px',
                backgroundColor: loadingPages ? '#DFE1E6' : '#0052CC',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                cursor: loadingPages ? 'not-allowed' : 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}
            >
              {loadingPages ? '🔄 Loading...' : '🔍 Load from URL'}
            </button>
          )}
        </div>
       
        {/* Search Pages Section */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '6px', 
            fontWeight: '600', 
            color: '#000000', 
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
            }}
          />
        </div>
        
        {/* Filter by Space Section */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '6px', 
            fontWeight: '600', 
            color: '#000000', 
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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

        <div style={{ 
          marginBottom: '16px', 
          color: 'black',
          fontWeight: 'bold', 
          fontSize: '14px', 
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
          backgroundColor: '#FFFAE6',
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid #FFC400',
          display: 'inline-block'
        }}>
          📄 Found {filteredPages.length} pages
        </div>

        {/* Pages Table */}
        {loadingPages ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            color: '#6B778C', 
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
          }}>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>🔄 Loading pages...</div>
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
                  color: '#000000', 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
                  width: '35%',
                  wordWrap: 'break-word'
                }}>
                  Page Title
                </th>
                <th style={{ 
                  padding: '12px', 
                  textAlign: 'left', 
                  fontWeight: '600', 
                  color: '#000000', 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
                  width: '30%'
                }}>
                  Space
                </th>
                <th style={{ 
                  padding: '12px', 
                  textAlign: 'left', 
                  fontWeight: '600', 
                  color: '#000000', 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
                  width: '20%'
                }}>
                  Last Modified
                </th>
                <th style={{ 
                  padding: '12px', 
                  textAlign: 'center', 
                  fontWeight: '600', 
                  color: '#000000', 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word'
                    }}>
                      {page.title}
                    </td>
                    <td style={{ 
                      padding: '12px', 
                      color: 'black', 
                      fontSize: '14px', 
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word'
                    }}>
                      {page.spaceName} ({page.spaceKey})
                    </td>
                    <td style={{ 
                      padding: '12px', 
                      color: 'black', 
                      fontSize: '14px', 
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
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
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
            color: '#000000', 
            fontWeight: 'bold',
            fontSize: '22px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
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
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                color: '#000000',
                marginBottom: '4px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                📁 Select Confluence Space
              </label>
              <p style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                color: '#000000',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  color: '#000000',
                  marginBottom: '8px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                }}>
                  <span>📄</span> Page Organization
                </label>
                <p style={{ 
                  margin: '0 0 16px 0', 
                  fontSize: '14px', 
                  color: 'black',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                    <div style={{ fontWeight: '600', color: '#000000', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                      📁 Create child(s) page under an existing parent page
                    </div>
                    <div style={{ fontSize: '13px', color: 'black', marginTop: '4px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                    <div style={{ fontWeight: '600', color: '#000000', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                      📄 Create as a parent page under '{spaces.find(s => s.key === selectedSpace)?.name}'
                    </div>
                    <div style={{ fontSize: '13px', color: 'black', marginTop: '4px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                    <div style={{ fontWeight: '600', color: '#000000', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                      📁 Create new parent and child page
                    </div>
                    <div style={{ fontSize: '13px', color: 'black', marginTop: '4px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                color: '#000000',
                marginBottom: '8px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                <span>📄</span> Select Existing Parent Page
              </label>
              <p style={{ 
                margin: '0 0 12px 0', 
                fontSize: '13px', 
                color: '#000000',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
              }}>
                Choose the parent page under which your report child pages will be created. Showing top 30 pages sorted alphabetically.
              </p>
              {loadingSpacePages ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#6B778C', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                color: '#000000',
                marginBottom: '8px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                📁 New Parent Page Title
              </label>
              <p style={{ 
                margin: '0 0 12px 0', 
                fontSize: '13px', 
                color: '#000000',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
            color: '#000000', 
            fontWeight: 'bold',
            fontSize: '22px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
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
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                color: '#000000',
                marginBottom: '8px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                <span>📅</span> Date Format Selection
              </label>
              <p style={{ 
                margin: '0 0 16px 0', 
                fontSize: '14px', 
                color: 'black',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                color: '#000000',
                marginBottom: '12px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  <div style={{ color: '#000000', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                  <div style={{ color: '#000000', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                  <div style={{ color: '#000000', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                  <div style={{ color: '#172B4D', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                  <div style={{ color: '#172B4D', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                }}>
                  <span>🔢</span> Numbered Pages Configuration
                </label>
                <p style={{ 
                  margin: '0 0 16px 0', 
                  fontSize: '14px', 
                  color: 'black',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                  📝 Preview:
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                }}>
                  Start Month & Day
                </label>
                <p style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '13px', 
                  color: 'black',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                  📅 Date Preview:
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                  📅 Page Date Format Preview
                </div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                  Dates will be formatted as: "January 5, 2026"
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif', fontWeight: 'bold' }}>
                  📊 Page title format: "{pageTitle} - {monthlyTargetMonth} {monthlyTargetYear}"
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                }}>
                  Quarter Start Month
                </label>
                <p style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '13px', 
                  color: 'black',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                  📅 Page Date Format Preview
                </div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
                  Dates will be formatted as: "January 5, 2026"
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#006644', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif', fontWeight: 'bold' }}>
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                <span>📅</span> Date & Timestamp Configuration
              </label>
              <p style={{ 
                margin: '0', 
                fontSize: '14px', 
                color: 'black',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
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