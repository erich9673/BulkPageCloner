import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke, router, view } from '@forge/bridge';

// Production logging control
const IS_DEV = process.env.NODE_ENV === 'development';
const devLog = (message, data = null) => {
  if (IS_DEV) {
    console.log(message, data ? data : '');
  }
};
const devError = (message, error) => {
  if (IS_DEV) {
    console.error(message, error?.message || error);
  }
};

// Debounce utility for search optimization
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

const BulkPageCloner = () => {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Step management
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  
  // Tab selection for Step 1 - either 'url' or 'browse'
  const [selectedOption, setSelectedOption] = useState('browse');
  
  // Page browser state (Step 1)
  const [confluencePageUrl, setConfluencePageUrl] = useState('');
  const [allPages, setAllPages] = useState([]);
  const [filteredPages, setFilteredPages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpaceFilter, setSelectedSpaceFilter] = useState('all');
  const [loadingPages, setLoadingPages] = useState(false);
  
  // Step 3 state - Location Selection
  const [selectedSpace, setSelectedSpace] = useState('');
  const [pageOrganization, setPageOrganization] = useState('create-child');
  const [selectedParentPage, setSelectedParentPage] = useState('');
  const [newParentTitle, setNewParentTitle] = useState('');
  const [spacePages, setSpacePages] = useState([]);
  const [loadingSpacePages, setLoadingSpacePages] = useState(false);
  
  // Step 2 state - Bulk Generation
  const [pageCount, setPageCount] = useState(3);
  const [pageTitles, setPageTitles] = useState(['', '', '']);
  const [showAutofillSuggestion, setShowAutofillSuggestion] = useState(false);
  const [suggestedPattern, setSuggestedPattern] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState(null);

  // Progress tracking for bulk generation
  const [generationProgress, setGenerationProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
    currentBatch: 0,
    totalBatches: 0,
    status: 'idle' // 'idle', 'generating', 'completed', 'error'
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25); // Default 25 items per page
  const [totalPages, setTotalPages] = useState(0);

  // Track if app is opened via macro (for close functionality, but not modal styling)
  const [isMacro, setIsMacro] = useState(false);
  
  // Ref for click-outside detection
  const containerRef = useRef(null);

  // Handle close for macro entry point
  const handleClose = useCallback(async () => {
    try {
      await view.close();
    } catch (err) {
      devError('Error closing app:', err);
    }
  }, []);

  // ESC key handling for macro context
  useEffect(() => {
    if (!isMacro) return;
    
    const handleKeyPress = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    
    // Ensure the container gets focus immediately for macro context
    if (containerRef.current) {
      containerRef.current.focus();
    }
    
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handleClose, isMacro]);

  // Close when focus leaves the iframe (clicking outside in the editor UI)
  useEffect(() => {
    if (!isMacro) return;

    const handleWindowBlur = () => {
      // Only close when the page is still visible (avoid closing on tab switch)
      if (document.visibilityState === 'visible') {
        devLog('Window blur detected, closing macro');
        handleClose();
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [handleClose, isMacro]);

  // Load all pages and check context on component mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!mounted) return;

      // Detect if this is a macro entry point for close functionality
      try {
        // Use Forge view context to reliably detect macro context
        const context = await view.getContext();
        const isFromMacro = context?.extension?.type === 'macro' || 
                           context?.moduleKey?.includes('macro') ||
                           context?.type === 'macro';
        
        // Fallback to URL detection if context is unavailable
        if (!isFromMacro) {
          const currentUrl = window.location.href;
          const urlBasedDetection = currentUrl.includes('macro') || 
                                   currentUrl.includes('bulkpage') ||
                                   window.location.search.includes('macro');
          setIsMacro(urlBasedDetection);
          devLog('Macro context detected via URL:', urlBasedDetection);
        } else {
          setIsMacro(isFromMacro);
          devLog('Macro context detected via Forge context:', isFromMacro);
        }
      } catch (err) {
        devError('Error detecting entry point:', err);
        // Fallback to URL-based detection
        try {
          const currentUrl = window.location.href;
          const urlBasedDetection = currentUrl.includes('macro') || 
                                   currentUrl.includes('bulkpage') ||
                                   window.location.search.includes('macro');
          setIsMacro(urlBasedDetection);
          devLog('Macro context detected via fallback URL:', urlBasedDetection);
        } catch (fallbackErr) {
          devError('Fallback detection failed:', fallbackErr);
          setIsMacro(false);
        }
      }

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
      devLog('🚀 Loading pages with balanced approach...');
      
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
      
      devLog(`✅ Loaded ${result.totalCount} pages from ${result.loadedSpaces} spaces`);
      
    } catch (err) {
      // Check if it's a timeout error and provide better messaging
      if (err.message && err.message.includes('timed out')) {
        setError('Loading is taking longer than expected. Please try again or contact support if this persists.');
      } else {
        setError('Failed to load pages: ' + err.message);
      }
      devError('❌ loadAllPages error:', err);
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
          devLog(`🎯 Direct mode: Auto-selecting page ${result.targetPage.title}`);
          
          // Load ALL spaces for Step 2 selection, not just the template space
          const allSpacesResult = await invoke('getAllSpaces');
          if (allSpacesResult.success) {
            setSpaces(allSpacesResult.spaces);
          } else {
            setSpaces(result.spaces || []); // Fallback to template space
          }
          
          // Directly upload template and move to Step 2
          try {
            const uploadResult = await invoke('uploadTemplate', { 
              pageId: result.targetPage.id,
              name: `Template: ${result.targetPage.title}`
            });
            
            if (uploadResult.success) {
              setSelectedTemplate(uploadResult.template);
              setCurrentStep(2);
              devLog('✅ Direct selection successful, moved to Step 2 (Bulk Generation)');
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
          devLog(`✅ Loaded ${result.pages?.length || 0} pages from URL`);
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

  // Filter pages based on search and space selection (optimized with debounce utility)
  useEffect(() => {
    const debouncedFilter = debounce(() => {
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
      
      // Update pagination when filters change
      const newTotalPages = Math.ceil(filtered.length / pageSize);
      setTotalPages(newTotalPages);
      
      // Reset to first page if current page exceeds new total
      if (currentPage > newTotalPages && newTotalPages > 0) {
        setCurrentPage(1);
      }
    }, 250); // Optimized 250ms debounce
    
    debouncedFilter();
  }, [allPages, searchQuery, selectedSpaceFilter, pageSize, currentPage]);

  // Memoize paginated page rows for optimal performance
  const renderedPageRows = useMemo(() => {
    if (filteredPages.length === 0) {
      return (
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
      );
    }
    
    // Calculate pagination slice
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedPages = filteredPages.slice(startIndex, endIndex);
    
    return paginatedPages.map((page) => (
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
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
        }}>
          {page.lastModified ? new Date(page.lastModified).toLocaleDateString() : 'N/A'}
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
    ));
  }, [filteredPages, searchQuery, selectedSpaceFilter, loading, currentPage, pageSize]);

  // Handle page selection for template (Step 1)
  const handlePageSelect = async (page) => {
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
      devError('Error loading pages for space:', err);
      setSpacePages([]);
    } finally {
      setLoadingSpacePages(false);
    }
  };
  
  // Handle space selection in step 2
  useEffect(() => {
    if (currentStep === 3 && selectedSpace) {
      loadSpacePagesForSelection(selectedSpace);
    }
  }, [selectedSpace, currentStep]);
  
  // Generate pages function - calls the backend resolver
  const generatePages = async () => {
    devLog('generatePages called', {
      selectedSpace,
      pageOrganization,
      selectedParentPage,
      newParentTitle,
      selectedTemplate,
      pageTitles
    });
    
    // Validate
    if (!selectedSpace) {
      devLog('Validation failed: No space selected');
      setError('Please select a Confluence space');
      return;
    }
    
    if (!pageOrganization) {
      devLog('Validation failed: No page organization selected');
      setError('Please select a page organization option');
      return;
    }
    
    if (pageOrganization === 'create-child' && !selectedParentPage) {
      devLog('Validation failed: create-child mode but no parent page');
      setError('Please select a parent page');
      return;
    }
    
    if (pageOrganization === 'create-parent' && !newParentTitle.trim()) {
      devLog('Validation failed: create-parent mode but no parent title');
      setError('Please enter a title for the new parent page');
      return;
    }
    
    // Note: create-as-parent mode doesn't need newParentTitle since each report becomes its own parent page
    
    if (!selectedTemplate?.id) {
      setError('Please select a template page first');
      return;
    }
    
    // Validate all page titles are filled
    const nonEmptyTitles = pageTitles.filter(title => title.trim());
    if (nonEmptyTitles.length !== pageCount) {
      setError(`Please fill in all ${pageCount} page titles`);
      return;
    }
    
    // Handle duplicates by adding (1), (2), etc.
    const deduplicatedTitles = handleDuplicateNames(nonEmptyTitles);
    devLog('Original titles:', nonEmptyTitles);
    devLog('Deduplicated titles:', deduplicatedTitles);
    
    setError('');
    setGenerating(true);
    
    // Initialize progress tracking
    const totalPages = deduplicatedTitles.length;
    setGenerationProgress({
      current: 0,
      total: totalPages,
      percentage: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(totalPages / 5), // Assuming 5 pages per batch
      status: 'generating'
    });
    
    try {
      // Call the enhanced backend resolver with progress callback
      const result = await invoke('bulkGeneratePagesWithProgress', {
        templateId: selectedTemplate.id,
        spaceKey: selectedSpace,
        pageTitle: deduplicatedTitles[0], // First title as base title
        pageTitles: deduplicatedTitles, // Use deduplicated titles
        generationMode: 'bulk',
        numberedCount: deduplicatedTitles.length,
        pageOrganization: pageOrganization,
        parentPageId: selectedParentPage,
        newParentTitle: newParentTitle
      });
      
      devLog('Pages generated successfully:', result);
      setGenerationSuccess(result.data || result); // Handle both nested and direct data structures
      setGenerationProgress(prev => ({ ...prev, status: 'completed', percentage: 100 }));
      setCurrentStep(4);
      
    } catch (error) {
      devError('Failed to generate pages:', error);
      setError('Failed to create pages: ' + error.message);
      setGenerationProgress(prev => ({ ...prev, status: 'error' }));
    } finally {
      setGenerating(false);
    }
  };

  // Helper function to handle duplicates by adding (1), (2), etc.
  const handleDuplicateNames = (titles) => {
    const seen = {};
    const result = [];
    
    titles.forEach(title => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        result.push('');
        return;
      }
      
      if (!seen[trimmedTitle]) {
        seen[trimmedTitle] = 1;
        result.push(trimmedTitle);
      } else {
        const count = seen[trimmedTitle];
        seen[trimmedTitle] = count + 1;
        result.push(`${trimmedTitle} (${count})`);
      }
    });
    
    return result;
  };

  // Helper functions for new Step 2
  const updatePageCount = (newCount) => {
    setPageCount(newCount);
    setPageTitles(prev => {
      const newTitles = [...prev];
      // Add empty titles if increasing count
      while (newTitles.length < newCount) {
        newTitles.push('');
      }
      // Remove excess titles if decreasing count
      if (newTitles.length > newCount) {
        newTitles.splice(newCount);
      }
      return newTitles;
    });
  };

  const updatePageTitle = (index, value) => {
    const newTitles = [...pageTitles];
    newTitles[index] = value;
    setPageTitles(newTitles);
    
    // Check for patterns after user enters 2+ titles
    if (index >= 1 && value.trim() && newTitles[index-1]?.trim()) {
      detectAndSuggestPattern(newTitles, index + 1);
    }
  };

  const detectAndSuggestPattern = (titles, fromIndex) => {
    const filledTitles = titles.slice(0, fromIndex).filter(t => t.trim());
    if (filledTitles.length < 2) return;

    // Detect number pattern
    const numberPattern = detectNumberPattern(filledTitles);
    if (numberPattern) {
      setSuggestedPattern(numberPattern);
      setShowAutofillSuggestion(true);
      return;
    }

    // Detect date pattern  
    const datePattern = detectDatePattern(filledTitles);
    if (datePattern) {
      setSuggestedPattern(datePattern);
      setShowAutofillSuggestion(true);
      return;
    }
  };

  const detectNumberPattern = (titles) => {
    const numbers = titles.map(title => {
      const match = title.match(/(\d+)/);
      return match ? parseInt(match[1]) : null;
    }).filter(n => n !== null);

    if (numbers.length >= 2) {
      const diff = numbers[1] - numbers[0];
      if (diff > 0 && numbers.every((n, i) => i === 0 || n === numbers[0] + (diff * i))) {
        return `number sequence (+${diff})`;
      }
    }
    return null;
  };

  const detectDatePattern = (titles) => {
    // Enhanced date pattern detection for various formats
    const monthWithYearRegex = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i;
    const monthOnlyRegex = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i;
    const monthInTitleRegex = /(January|February|March|April|May|June|July|August|September|October|November|December)/i;
    const standardDateRegex = /(\d{1,2}\/\d{1,2}\/\d{4}|\w+ \d{1,2}, \d{4})/;
    
    // Check for monthly patterns with year (e.g., "January 2026", "February 2026")
    const monthWithYearMatches = titles.map(title => title.match(monthWithYearRegex)).filter(Boolean);
    if (monthWithYearMatches.length >= 2) {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const month1 = months.indexOf(monthWithYearMatches[0][1].toLowerCase());
      const month2 = months.indexOf(monthWithYearMatches[1][1].toLowerCase());
      if (month2 === month1 + 1) return 'monthly progression with year';
    }
    
    // Check for simple monthly patterns (e.g., "March", "April")
    const monthOnlyMatches = titles.map(title => title.match(monthOnlyRegex)).filter(Boolean);
    if (monthOnlyMatches.length >= 2) {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const month1 = months.indexOf(monthOnlyMatches[0][1].toLowerCase());
      const month2 = months.indexOf(monthOnlyMatches[1][1].toLowerCase());
      if (month2 === month1 + 1) return 'simple monthly progression';
    }
    
    // Check for months embedded in titles (e.g., "Hello January", "Hello February")
    const monthInTitleMatches = titles.map(title => title.match(monthInTitleRegex)).filter(Boolean);
    if (monthInTitleMatches.length >= 2) {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const month1 = months.indexOf(monthInTitleMatches[0][1].toLowerCase());
      const month2 = months.indexOf(monthInTitleMatches[1][1].toLowerCase());
      if (month2 === month1 + 1) return 'embedded monthly progression';
    }
    
    // Check for quarterly patterns (e.g., "Q1 2026", "Q2 2026" or just "Q2", "Q3")
    const quarterWithYearMatches = titles.map(title => title.match(/Q([1-4])\s+(\d{4})/i)).filter(Boolean);
    if (quarterWithYearMatches.length >= 2) {
      const q1 = parseInt(quarterWithYearMatches[0][1]);
      const q2 = parseInt(quarterWithYearMatches[1][1]);
      if (q2 === q1 + 1) return 'quarterly progression';
    }
    
    // Check for simple quarterly patterns (e.g., "Q2", "Q3")
    const quarterOnlyMatches = titles.map(title => title.match(/Q([1-4])(?!\s*\d)/i)).filter(Boolean);
    if (quarterOnlyMatches.length >= 2) {
      const q1 = parseInt(quarterOnlyMatches[0][1]);
      const q2 = parseInt(quarterOnlyMatches[1][1]);
      if (q2 === q1 + 1) return 'simple quarterly progression';
    }
    
    // Check for embedded quarterly patterns (e.g., "Report Q2", "Report Q3")
    const quarterInTitleMatches = titles.map(title => title.match(/Q([1-4])/i)).filter(Boolean);
    if (quarterInTitleMatches.length >= 2) {
      const q1 = parseInt(quarterInTitleMatches[0][1]);
      const q2 = parseInt(quarterInTitleMatches[1][1]);
      if (q2 === q1 + 1) return 'embedded quarterly progression';
    }
    
    // Check for standard date patterns with flexible formats
    const flexibleDateRegex = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
    
    // Try flexible date format first (handles 2-digit years)
    const flexDates = titles.map(title => {
      const dateMatch = title.match(flexibleDateRegex);
      if (dateMatch) {
        let [, month, day, year] = dateMatch;
        // Handle 2-digit years by assuming 20xx
        if (year.length === 2) {
          year = '20' + year;
        }
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      return null;
    }).filter(d => d && !isNaN(d));

    if (flexDates.length >= 2) {
      const diffDays = (flexDates[1] - flexDates[0]) / (1000 * 60 * 60 * 24);
      if (diffDays === 7) return 'weekly dates';
      if (diffDays >= 28 && diffDays <= 31) return 'monthly dates';
      if (diffDays > 0) return 'date progression';
    }
    
    // Check standard date patterns as fallback
    const dates = titles.map(title => {
      const dateMatch = title.match(standardDateRegex);
      return dateMatch ? new Date(dateMatch[1]) : null;
    }).filter(d => d && !isNaN(d));

    if (dates.length >= 2) {
      const diffDays = (dates[1] - dates[0]) / (1000 * 60 * 60 * 24);
      if (diffDays === 7) return 'weekly dates';
      if (diffDays >= 28 && diffDays <= 31) return 'monthly dates';
    }
    return null;
  };

  const applyAutofill = () => {
    const newTitles = [...pageTitles];
    const filledCount = newTitles.findIndex(t => !t.trim());
    const baseTitles = newTitles.slice(0, filledCount);
    
    if (suggestedPattern.includes('number sequence')) {
      applyNumberPattern(newTitles, baseTitles);
    } else if (suggestedPattern.includes('progression') || suggestedPattern.includes('dates')) {
      applyDatePattern(newTitles, baseTitles);
    }
    
    setPageTitles(newTitles);
    setShowAutofillSuggestion(false);
  };

  const copyFirstTitle = () => {
    if (pageTitles[0] && pageTitles[0].trim()) {
      const newTitles = [...pageTitles];
      for (let i = 1; i < newTitles.length; i++) {
        newTitles[i] = pageTitles[0];
      }
      setPageTitles(newTitles);
    }
  };

  const clearAllTitles = () => {
    setPageTitles(new Array(pageCount).fill(''));
    setShowAutofillSuggestion(false); // Also hide autofill suggestion when clearing
  };

  const applyNumberPattern = (newTitles, baseTitles) => {
    // Find the highest number in the existing titles to continue from there
    const numbersFound = [];
    baseTitles.forEach((title, index) => {
      const match = title.match(/^(.*?)(\d+)(.*)$/);
      if (match) {
        const [, prefix, num, suffix] = match;
        numbersFound.push({ 
          number: parseInt(num), 
          prefix, 
          suffix, 
          index 
        });
      }
    });

    if (numbersFound.length > 0) {
      // Use the pattern from the title with the highest number
      const latestNumberData = numbersFound.reduce((latest, current) => 
        current.number > latest.number ? current : latest
      );
      
      const { number: currentNum, prefix, suffix } = latestNumberData;
      
      // Continue the sequence from the highest number found
      for (let i = baseTitles.length; i < newTitles.length; i++) {
        const nextNum = currentNum + (i - baseTitles.length + 1);
        newTitles[i] = `${prefix}${nextNum}${suffix}`;
      }
    } else {
      // Fallback to the old logic if no numbers found
      const lastTitle = baseTitles[baseTitles.length - 1];
      const match = lastTitle.match(/^(.*?)(\d+)(.*)$/);
      if (match) {
        const [, prefix, num, suffix] = match;
        for (let i = baseTitles.length; i < newTitles.length; i++) {
          const nextNum = parseInt(num) + (i - baseTitles.length + 1);
          newTitles[i] = `${prefix}${nextNum}${suffix}`;
        }
      }
    }
  };

  const applyDatePattern = (newTitles, baseTitles) => {
    const lastTitle = baseTitles[baseTitles.length - 1];
    
    if (suggestedPattern.includes('monthly progression with year')) {
      // Handle "January 2026" -> "February 2026" patterns
      const monthRegex = /(.*?)(January|February|March|April|May|June|July|August|September|October|November|December)(.*?)(\d{4})(.*)/i;
      const match = lastTitle.match(monthRegex);
      if (match) {
        const [, prefix, monthName, middle, year, suffix] = match;
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonth = months.indexOf(monthName);
        
        for (let i = baseTitles.length; i < newTitles.length; i++) {
          const nextMonthIndex = (currentMonth + (i - baseTitles.length + 1)) % 12;
          let nextYear = parseInt(year);
          if (currentMonth + (i - baseTitles.length + 1) >= 12) {
            nextYear += Math.floor((currentMonth + (i - baseTitles.length + 1)) / 12);
          }
          newTitles[i] = `${prefix}${months[nextMonthIndex]}${middle}${nextYear}${suffix}`;
        }
      }
    } else if (suggestedPattern.includes('simple monthly progression')) {
      // Handle simple "March" -> "April" patterns
      const monthRegex = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i;
      const match = lastTitle.match(monthRegex);
      if (match) {
        const monthName = match[1];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonth = months.indexOf(monthName);
        
        for (let i = baseTitles.length; i < newTitles.length; i++) {
          const nextMonthIndex = (currentMonth + (i - baseTitles.length + 1)) % 12;
          newTitles[i] = months[nextMonthIndex];
        }
      }
    } else if (suggestedPattern.includes('embedded monthly progression')) {
      // Handle "marketing march" -> "marketing april" patterns
      // Find the chronologically latest month in the sequence, not just the last entered title
      const monthInTitleRegex = /(.*?)(January|February|March|April|May|June|July|August|September|October|November|December)(.*)/i;
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      
      // Find all months in the existing titles and their positions
      const monthsFound = [];
      baseTitles.forEach((title, index) => {
        const match = title.match(monthInTitleRegex);
        if (match) {
          const [, prefix, monthName, suffix] = match;
          const monthIndex = months.indexOf(monthName);
          monthsFound.push({ monthIndex, prefix, suffix, title, index });
        }
      });
      
      if (monthsFound.length > 0) {
        // Find the chronologically latest month (highest month index)
        const latestMonth = monthsFound.reduce((latest, current) => 
          current.monthIndex > latest.monthIndex ? current : latest
        );
        
        const { monthIndex: currentMonth, prefix, suffix } = latestMonth;
        
        for (let i = baseTitles.length; i < newTitles.length; i++) {
          const nextMonthIndex = (currentMonth + (i - baseTitles.length + 1)) % 12;
          newTitles[i] = `${prefix}${months[nextMonthIndex]}${suffix}`;
        }
      }
    } else if (suggestedPattern.includes('quarterly progression')) {
      // Handle "Q1 2026" -> "Q2 2026" patterns with proper cycling
      const quarterRegex = /(.*?)Q([1-4])(.*?)(\d{4})(.*)/i;
      const match = lastTitle.match(quarterRegex);
      if (match) {
        const [, prefix, quarter, middle, year, suffix] = match;
        const currentQuarter = parseInt(quarter);
        const currentYear = parseInt(year);
        
        for (let i = baseTitles.length; i < newTitles.length; i++) {
          const totalQuarters = currentQuarter + (i - baseTitles.length + 1);
          const nextQuarter = ((totalQuarters - 1) % 4) + 1;
          const nextYear = currentYear + Math.floor((totalQuarters - 1) / 4);
          newTitles[i] = `${prefix}Q${nextQuarter}${middle}${nextYear}${suffix}`;
        }
      }
    } else if (suggestedPattern.includes('simple quarterly progression')) {
      // Handle "Q2" -> "Q3" patterns
      const quarterRegex = /(.*?)Q([1-4])(.*)/i;
      const match = lastTitle.match(quarterRegex);
      if (match) {
        const [, prefix, quarter, suffix] = match;
        const currentQuarter = parseInt(quarter);
        
        for (let i = baseTitles.length; i < newTitles.length; i++) {
          const nextQuarter = ((currentQuarter + (i - baseTitles.length + 1) - 1) % 4) + 1;
          newTitles[i] = `${prefix}Q${nextQuarter}${suffix}`;
        }
      }
    } else if (suggestedPattern.includes('embedded quarterly progression')) {
      // Handle embedded quarter patterns like "Report Q2"
      const quarterRegex = /(.*?)Q([1-4])(.*)/i;
      const match = lastTitle.match(quarterRegex);
      if (match) {
        const [, prefix, quarter, suffix] = match;
        const currentQuarter = parseInt(quarter);
        
        for (let i = baseTitles.length; i < newTitles.length; i++) {
          const nextQuarter = ((currentQuarter + (i - baseTitles.length + 1) - 1) % 4) + 1;
          newTitles[i] = `${prefix}Q${nextQuarter}${suffix}`;
        }
      }
    } else if (suggestedPattern.includes('date progression')) {
      // Handle flexible date progression like "1/28/26" -> "2/4/26"
      const flexibleDateRegex = /(.*?)(\d{1,2})\/(\d{1,2})\/(\d{2,4})(.*)/;
      const match = lastTitle.match(flexibleDateRegex);
      if (match) {
        const [, prefix, month, day, year, suffix] = match;
        let baseDate = new Date(year.length === 2 ? '20' + year : year, parseInt(month) - 1, parseInt(day));
        
        // Detect the interval by looking at the difference between first two dates
        const firstTitleMatch = baseTitles[0].match(flexibleDateRegex);
        if (firstTitleMatch) {
          const [, , fMonth, fDay, fYear] = firstTitleMatch;
          const firstDate = new Date(fYear.length === 2 ? '20' + fYear : fYear, parseInt(fMonth) - 1, parseInt(fDay));
          const diffDays = (baseDate - firstDate) / (1000 * 60 * 60 * 24);
          
          for (let i = baseTitles.length; i < newTitles.length; i++) {
            const nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + diffDays * (i - baseTitles.length + 1));
            const nextMonth = nextDate.getMonth() + 1;
            const nextDay = nextDate.getDate();
            const nextYear = nextDate.getFullYear().toString().slice(-2);
            newTitles[i] = `${prefix}${nextMonth}/${nextDay}/${nextYear}${suffix}`;
          }
        }
      }
    } else {
      // Handle standard weekly/monthly date patterns
      const lastDate = new Date();
      for (let i = baseTitles.length; i < newTitles.length; i++) {
        if (suggestedPattern.includes('weekly')) {
          lastDate.setDate(lastDate.getDate() + 7);
        } else if (suggestedPattern.includes('monthly')) {
          lastDate.setMonth(lastDate.getMonth() + 1);
        }
        newTitles[i] = `Page - ${lastDate.toLocaleDateString()}`;
      }
    }
  };

  return (
    <div 
      style={{ 
        padding: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
        width: '100%',
        maxWidth: 'none',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        position: 'relative',
        minHeight: 'auto',
        backgroundColor: 'transparent',
        display: 'block'
      }}
    >
      {/* Invisible backdrop for macro context to catch outside clicks */}
      {isMacro && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
            backgroundColor: 'transparent',
            cursor: 'default'
          }}
          onClick={() => {
            devLog('Backdrop clicked, closing macro');
            handleClose();
          }}
        />
      )}
      <div 
        ref={containerRef}
        tabIndex={isMacro ? 0 : -1} // Make focusable for macro context
        style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '0',
          boxShadow: 'none',
          width: '100%',
          maxWidth: 'none',
          maxHeight: 'none',
          overflowY: 'visible',
          outline: 'none', // Remove focus outline to prevent blue highlighting
          position: 'relative',
          zIndex: isMacro ? 2 : 1 // Keep content above backdrop
        }}
      >
      
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
          backgroundColor: 'transparent', 
          padding: '20px', 
          borderRadius: '0', 
          boxShadow: 'none',
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
            📄 Select a Page as Template OR Paste URL
          </h3>
        
        {/* Two Clear Options - Now Clickable Tabs */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr auto 1fr', 
          gap: '20px', 
          alignItems: 'center', 
          marginBottom: '24px',
          border: '2px solid #F4F5F7',
          borderRadius: '8px',
          padding: '20px'
        }}>
          {/* Option 1: Browse & Search (Now Primary) */}
          <div 
            onClick={() => setSelectedOption('browse')}
            style={{ 
              textAlign: 'center',
              cursor: 'pointer',
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: selectedOption === 'browse' ? '#E3FCEF' : 'transparent',
              border: selectedOption === 'browse' ? '2px solid #00B8D9' : '2px solid transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <h4 style={{ 
              margin: '0 0 12px 0', 
              color: selectedOption === 'browse' ? '#00875A' : '#0052CC', 
              fontSize: '16px', 
              fontWeight: '600',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
            }}>
              🔍 Browse & Search
            </h4>
            <p style={{ 
              margin: '0', 
              color: selectedOption === 'browse' ? '#00875A' : '#6B778C', 
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
            }}>
              Explore available pages
            </p>
          </div>
          
          {/* OR Divider */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: '600',
            color: '#97A0AF',
            backgroundColor: '#F4F5F7',
            borderRadius: '20px',
            padding: '8px 16px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
          }}>
            OR
          </div>
          
          {/* Option 2: Paste URL (Now Secondary) */}
          <div 
            onClick={() => setSelectedOption('url')}
            style={{ 
              textAlign: 'center',
              cursor: 'pointer',
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: selectedOption === 'url' ? '#E3FCEF' : 'transparent',
              border: selectedOption === 'url' ? '2px solid #00B8D9' : '2px solid transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <h4 style={{ 
              margin: '0 0 12px 0', 
              color: selectedOption === 'url' ? '#00875A' : '#0052CC', 
              fontSize: '16px', 
              fontWeight: '600',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
            }}>
              🔗 Paste URL
            </h4>
            <p style={{ 
              margin: '0', 
              color: selectedOption === 'url' ? '#00875A' : '#6B778C', 
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
            }}>
              Have a specific page in mind?
            </p>
          </div>
        </div>

        {/* Show Browse & Search by default (now primary option) */}
        {selectedOption === 'browse' && (
        <>
        {/* Browse & Search Section */}
        <div style={{ 
          marginBottom: '20px',
          padding: '16px',
          backgroundColor: '#F8F9FA',
          border: '1px solid #DFE1E6',
          borderRadius: '6px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '8px'
          }}>
            <label style={{ 
              display: 'block', 
              fontWeight: '600', 
              color: '#0052CC', 
              fontSize: '15px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
            }}>
              🔍 Search Pages
            </label>
            <span style={{
              color: '#DE350B',
              fontSize: '12px',
              fontWeight: '600',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
            }}>
              If you can't find a page, please use 🔗 Paste URL
            </span>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search page titles"
            style={{
              width: '100%',
              boxSizing: 'border-box',
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
            marginBottom: '8px', 
            fontWeight: '600', 
            color: '#42526E', 
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' 
          }}>
            📁 Filter by Space
          </label>
          <select
            value={selectedSpaceFilter}
            onChange={(e) => setSelectedSpaceFilter(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '350px',
              padding: '10px 12px',
              border: '1px solid #DFE1E6',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: 'white',
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
              {renderedPageRows}
            </tbody>
          </table>
        )}
        </>
        )}

        {/* Show URL input only when URL option is selected */}
        {selectedOption === 'url' && (
        <div style={{ 
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#F8F9FA',
          border: '1px solid #DFE1E6',
          borderRadius: '6px'
        }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: '#0052CC',
            fontWeight: '600',
            fontSize: '15px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
          }}>
            🔗 Paste Confluence URL
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
        )}
        </div>
      )}
      
      {/* Step 3: Location Selection */}
      {currentStep === 3 && (
        <div style={{ 
          backgroundColor: 'transparent', 
          padding: '20px', 
          borderRadius: '0', 
          boxShadow: 'none',
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
            <span>📍</span> Location
          </h3>
          
          
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
                      📁 Create child(s) page under an existing page
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
                    value="create-as-parent"
                    checked={pageOrganization === 'create-as-parent'}
                    onChange={(e) => {
                      devLog('Radio changed to:', e.target.value);
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
                    value="create-parent"
                    checked={pageOrganization === 'create-parent'}
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
          
          {/* New Parent Page Title (only for create-parent mode where we create a single parent with children) */}
          {selectedSpace && pageOrganization === 'create-parent' && (
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
                  maxWidth: '100%',
                  boxSizing: 'border-box',
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
              ← Back to Bulk Cloning
            </button>
            <button
              onClick={() => {
                devLog('Create Pages button clicked!');
                generatePages();
              }}
              disabled={generating || !selectedSpace || 
                !pageOrganization ||
                (pageOrganization === 'create-child' && !selectedParentPage) ||
                (pageOrganization === 'create-parent' && !newParentTitle.trim()) ||
                !selectedTemplate?.id ||
                !pageTitles.some(title => title.trim())
              }
              style={{
                padding: '10px 20px',
                backgroundColor: (generating || !selectedSpace || 
                  !pageOrganization ||
                  (pageOrganization === 'create-child' && !selectedParentPage) ||
                  (pageOrganization === 'create-parent' && !newParentTitle.trim()) ||
                  !selectedTemplate?.id ||
                  !pageTitles.some(title => title.trim())) 
                  ? '#DFE1E6' : '#0052CC',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (generating || !selectedSpace || 
                  !pageOrganization ||
                  (pageOrganization === 'create-child' && !selectedParentPage) ||
                  (pageOrganization === 'create-parent' && !newParentTitle.trim()) ||
                  !selectedTemplate?.id ||
                  !pageTitles.some(title => title.trim())) 
                  ? 'not-allowed' : 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}
            >
              {generating ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span>Creating Pages...</span>
                  {generationProgress.total > 0 && (
                    <span>({generationProgress.current}/{generationProgress.total})</span>
                  )}
                </div>
              ) : 'Create Pages'}
            </button>

            {/* Enhanced Progress Display for Bulk Operations */}
            {generating && generationProgress.total > 1 && (
              <div style={{
                marginTop: '20px',
                padding: '16px',
                backgroundColor: '#F8F9FA',
                border: '1px solid #DFE1E6',
                borderRadius: '6px'
              }}>
                <div style={{
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#0052CC',
                  fontSize: '14px'
                }}>
                  🚀 Creating {generationProgress.total} pages in optimized batches
                </div>
                
                {/* Progress Bar */}
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#DFE1E6',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    height: '100%',
                    backgroundColor: '#00B8D9',
                    width: `${generationProgress.percentage}%`,
                    transition: 'width 0.3s ease-in-out'
                  }} />
                </div>
                
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#6B778C'
                }}>
                  <span>Pages: {generationProgress.current}/{generationProgress.total}</span>
                  <span>{Math.round(generationProgress.percentage)}% Complete</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Step 2: Bulk Generation */}
      {currentStep === 2 && (
        <div style={{ 
          backgroundColor: 'transparent', 
          padding: '20px', 
          borderRadius: '0', 
          boxShadow: 'none',
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
            📋 Bulk Cloning
          </h3>
          

          

          
          {/* Page Count Selector */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              color: '#42526E',
              fontSize: '15px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
            }}>
              📊 How many pages do you want to create?
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="range"
                min="1"
                max="25"
                value={pageCount}
                onChange={(e) => updatePageCount(parseInt(e.target.value))}
                style={{
                  width: '200px',
                  height: '6px',
                  borderRadius: '3px',
                  background: '#DFE1E6',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
              <span style={{
                minWidth: '40px',
                padding: '6px 12px',
                backgroundColor: '#0052CC',
                color: 'white',
                borderRadius: '3px',
                fontWeight: '600',
                fontSize: '14px',
                textAlign: 'center'
              }}>
                {pageCount}
              </span>
            </div>
            <p style={{
              margin: '8px 0 0 0',
              color: '#6B778C',
              fontSize: '13px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
            }}>
              Choose between 1-25 pages
            </p>
          </div>

          {/* Page Titles */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <label style={{
                fontWeight: '600',
                color: '#42526E',
                fontSize: '15px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                ✏️ Name your pages
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Clear All Titles Button */}
                <button
                  onClick={clearAllTitles}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'transparent',
                    color: '#DE350B',
                    border: '1px solid #DE350B',
                    borderRadius: '3px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                  }}
                  disabled={!pageTitles.some(title => title.trim())}
                >
                  🗑️ Clear All
                </button>
                {/* Copy First Title Button - Hidden when autofill suggestion is shown */}
                {!showAutofillSuggestion && (
                  <button
                    onClick={copyFirstTitle}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#0052CC',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                    }}
                    disabled={!pageTitles[0] || !pageTitles[0].trim()}
                  >
                    📋 Copy First Title to All
                  </button>
                )}
              </div>
            </div>
            
            {/* Autofill Suggestion */}
            {showAutofillSuggestion && (
              <div style={{
                backgroundColor: '#FFF0B3',
                border: '1px solid #FFAB00',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ color: '#974F00', fontSize: '14px' }}>
                  🤖 Pattern detected: <strong>{suggestedPattern}</strong>. Continue this pattern?
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={applyAutofill}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#36B37E',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    ✓ Apply
                  </button>
                  <button
                    onClick={() => setShowAutofillSuggestion(false)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'transparent',
                      color: '#974F00',
                      border: '1px solid #FFAB00',
                      borderRadius: '3px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕ Ignore
                  </button>
                </div>
              </div>
            )}

            {/* Dynamic Title Inputs */}
            <div style={{ display: 'grid', gap: '8px' }}>
              {pageTitles.map((title, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    minWidth: '30px',
                    color: '#6B778C',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}>
                    {index + 1}.
                  </span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => updatePageTitle(index, e.target.value)}
                    placeholder={`Page ${index + 1} title...`}
                    style={{
                      flex: '1',
                      padding: '8px 12px',
                      border: '1px solid #DFE1E6',
                      borderRadius: '3px',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
            <button
              onClick={() => setCurrentStep(1)}
              style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                color: '#0052CC',
                border: '1px solid #DFE1E6',
                borderRadius: '3px',
                fontSize: '14px',
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}
            >
              ← Back to Template
            </button>
            
            <button
              onClick={() => {
                // Validate all titles are filled before proceeding
                const allTitlesFilled = pageTitles.filter(title => title.trim()).length === pageCount;
                if (allTitlesFilled) {
                  setCurrentStep(3);
                } else {
                  setError(`Please fill in all ${pageCount} page titles before continuing`);
                }
              }}
              disabled={pageTitles.filter(title => title.trim()).length !== pageCount}
              style={{
                padding: '10px 20px',
                backgroundColor: (pageTitles.filter(title => title.trim()).length === pageCount) ? '#0052CC' : '#DFE1E6',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                fontSize: '14px',
                cursor: (pageTitles.filter(title => title.trim()).length === pageCount) ? 'pointer' : 'not-allowed',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}
            >
              Continue to Location →
            </button>
          </div>
        </div>
      )}

      {/* Success Page - Step 4 */}
      {currentStep === 4 && (
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '3px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Success Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#E3FCEF',
            borderRadius: '3px',
            border: '1px solid #36B37E'
          }}>
            <span style={{ 
              fontSize: '24px',
              color: '#36B37E'
            }}>✅</span>
            <div>
              <h3 style={{
                margin: '0 0 4px 0',
                color: '#36B37E',
                fontWeight: 'bold',
                fontSize: '16px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                Success!
              </h3>
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: '#006644',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                {generationSuccess && generationSuccess.pages && generationSuccess.pages.length > 0 
                  ? `${generationSuccess.pages.length} pages have been created successfully`
                  : (generationSuccess && generationSuccess.createdCount ? `${generationSuccess.createdCount} pages have been created successfully` : 'Your pages have been created successfully')
                }
              </p>
            </div>
          </div>
          
          {/* Errors Summary */}
          {generationSuccess && generationSuccess.errors && generationSuccess.errors.length > 0 && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: '#FFEBE6',
              borderRadius: '3px',
              border: '1px solid #FF8F73'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px'
              }}>
                <span style={{ fontSize: '18px', color: '#BF2600' }}>⚠️</span>
                <strong style={{
                  color: '#BF2600',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                }}>
                  {generationSuccess.errors.length} pages failed to create
                </strong>
              </div>
              <ul style={{
                margin: 0,
                paddingLeft: '18px',
                color: '#BF2600',
                fontSize: '13px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                {generationSuccess.errors.map((err, idx) => (
                  <li key={idx} style={{ marginBottom: '6px' }}>
                    <strong>"{err.title}"</strong> — {err.error || 'Unknown error'}{err.status ? ` (Status ${err.status})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Created Pages List */}
          {generationSuccess && generationSuccess.pages && generationSuccess.pages.length > 0 ? (
            <div style={{
              marginBottom: '24px'
            }}>
              <h4 style={{
                margin: '0 0 12px 0',
                color: '#172B4D',
                fontSize: '14px',
                fontWeight: 'bold',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                Created Pages:
              </h4>
              <div style={{
                backgroundColor: '#F4F5F7',
                borderRadius: '3px',
                padding: '16px'
              }}>
                {generationSuccess.pages.map((page, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 0',
                    borderBottom: index < generationSuccess.pages.length - 1 ? '1px solid #DFE1E6' : 'none'
                  }}>
                    <span style={{ fontSize: '16px' }}>📄</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{
                        color: '#172B4D',
                        fontSize: '14px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                      }}>
                        "{page.title}"
                      </strong>
                      <span style={{
                        color: '#6B778C',
                        fontSize: '14px',
                        marginLeft: '8px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                      }}>
                        has been created successfully! Click to{' '}
                      </span>
                      <a 
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          router.open(page.url);
                        }}
                        style={{
                          color: '#0052CC',
                          textDecoration: 'none',
                          fontWeight: '500',
                          fontSize: '14px',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
                        }}
                        onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                        onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                      >
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#F4F5F7',
              borderRadius: '3px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              <p style={{
                margin: 0,
                color: '#6B778C',
                fontSize: '14px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif'
              }}>
                Your pages have been created successfully!
              </p>
            </div>
          )}

          {/* Create Another Button */}
          <button
            onClick={() => {
              // Reset all state
              setGenerationSuccess(null);
              setCurrentStep(1);
              setSelectedTemplate(null);
              setSelectedSpace('');
              setSelectedParentPage('');
              setNewParentTitle('');
              setPageOrganization('create-child');
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
    </div>
  );
};

export default BulkPageCloner;