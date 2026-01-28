import Resolver from '@forge/resolver';
import api, { route, storage } from '@forge/api';

const resolver = new Resolver();

// Production logging control
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const log = (message, data = null) => {
  if (!IS_PRODUCTION) {
    console.log(message, data ? data : '');
  }
};
const logError = (message, error) => {
  console.error(message, error?.message || error);
};

// Utility function to eliminate duplicate space lookup code
const getSpaceById = async (spaceKey) => {
  const spaceResp = await api.asUser().requestConfluence(
    route`/wiki/api/v2/spaces?keys=${spaceKey}&limit=1`
  );
  
  if (spaceResp.ok) {
    const spaceData = await spaceResp.json();
    return spaceData.results?.[0] || null;
  }
  return null;
};

// Utility function for consistent error handling
const handleApiError = async (response, operation) => {
  const errorText = await response.text();
  logError(`${operation} API error:`, `${response.status} - ${errorText}`);
  throw new Error(`${operation} failed: ${response.status}`);
};

log('🚀 BULK PAGE CLONER - RESOLVER LOADING...');

// ============================================================================
// SPACES MANAGEMENT (from original app)
// ============================================================================

// Get all available Confluence spaces
resolver.define('getSpaces', async (req) => {
  log('=== FETCHING SPACES ===');
  try {
    // Use standard API limit of 250 (max supported by Confluence API v2)
    const response = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=250`);
    
    if (!response.ok) {
      const errorText = await response.text();
      logError('Spaces API error:', `${response.status} - ${errorText}`);
      throw new Error(`Spaces API failed: ${response.status}`);
    }
    
    const data = await response.json();
    // Removed verbose logging for production security
    
    const spaces = (data.results || []).map(space => ({
      key: space.key,
      name: space.name,
      type: space.type,
      status: space.status
    }));
    
    log('✅ Total spaces fetched:', spaces.length);
    return { spaces };
  } catch (error) {
    logError('❌ getSpaces error:', error);
    return { spaces: [], error: error.message };
  }
});

// Get pages in a specific space - based on original BulkReportGenerator logic
resolver.define('getSpacePages', async (req) => {
  log('=== FETCHING SPACE PAGES ===');
  try {
    const { spaceKey, spaceId } = req.payload || {};
    
    if (!spaceKey && !spaceId) {
      throw new Error('spaceKey or spaceId is required');
    }
    
    // Follow original BulkReportGenerator pattern: 
    // 1. Use spaceKey to get space info (including numeric space ID)
    // 2. Use numeric space ID to fetch pages
    let numericSpaceId = spaceId;
    let actualSpaceKey = spaceKey;
    
    // If we only have spaceKey, get the space info first to get numeric ID
    if (!numericSpaceId && spaceKey) {
      log(`Looking up space ID for key: ${spaceKey}`);
      const space = await getSpaceById(spaceKey);
      if (space) {
        numericSpaceId = space.id;
        actualSpaceKey = space.key;
        log(`Found numeric space ID: ${numericSpaceId} for key: ${actualSpaceKey}`);
      }
    }
    
    if (!numericSpaceId) {
      throw new Error(`Could not resolve numeric space ID for space: ${spaceKey || spaceId}`);
    }
    
    log(`Fetching pages for space ID: ${numericSpaceId}`);
    
    // UNLIMITED pagination - fetch ALL pages in space
    let allPages = [];
    let start = 0;
    const limit = 100;
    let more = true;
    let fetchCount = 0;
    
    while (more) {
      log(`🔍 Fetching pages batch ${fetchCount + 1}, start: ${start}, limit: ${limit}`);
      const response = await api.asUser().requestConfluence(
        route`/wiki/api/v2/spaces/${numericSpaceId}/pages?limit=${limit}&start=${start}`
      );
      
      if (!response.ok) {
        await handleApiError(response, 'Pages');
      }
      
      const data = await response.json();
      const newPages = (data.results || [])
        .filter(page => page.title !== actualSpaceKey) // Filter out space names
        .map(page => ({
          id: page.id,
          title: page.title,
          spaceKey: spaceKey || identifier,
          lastModified: page.version?.when || page.createdAt || 'Unknown'
        }));
      
      allPages = allPages.concat(newPages);
      log(`✅ Successfully got ${newPages.length} pages in batch ${fetchCount + 1} (total: ${allPages.length})`);
      
      // Continue pagination until no more pages
      if (data._links && data._links.next && newPages.length > 0) {
        start += limit;
        fetchCount++;
        log(`➡️ More pages available, continuing to batch ${fetchCount + 1}...`);
      } else {
        more = false;
        log(`🏁 Reached end of pages, fetching complete`);
      }
      
      // Safety check: if we get an empty batch, stop
      if (newPages.length === 0) {
        log(`⚠️ Empty batch received, stopping pagination`);
        more = false;
      }
    }
    
    log('✅ Total pages fetched for space:', allPages.length);
    return { pages: allPages };
  } catch (error) {
    logError('❌ getSpacePages error:', error);
    return { pages: [], error: error.message };
  }
});

// ============================================================================
// OPTIMIZED ALL PAGES LOADER - NEW EFFICIENT APPROACH
// ============================================================================

// Get all pages from all spaces efficiently with unlimited pagination (BRG pattern)
resolver.define('getAllPagesOptimized', async (req) => {
  console.log('=== FETCHING ALL PAGES OPTIMIZED (BRG PATTERN) ===');
  try {
    // First get ALL spaces with unlimited pagination
    let spaces = [];
    let start = 0;
    const limit = 250; // Maximum batch size for efficiency
    let more = true;
    let fetchCount = 0;
    
    console.log('📡 Fetching all spaces...');
    while (more) {
      const spacesResponse = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=${limit}&start=${start}`);
      
      if (!spacesResponse.ok) {
        const errorText = await spacesResponse.text();
        console.error('Spaces API error:', spacesResponse.status, errorText);
        throw new Error(`Spaces API failed: ${spacesResponse.status}`);
      }
      
      const spacesData = await spacesResponse.json();
      const newSpaces = (spacesData.results || []).map(space => ({
        key: space.key,
        name: space.name,
        type: space.type,
        status: space.status,
        id: space.id
      }));
      
      spaces = spaces.concat(newSpaces);
      
      // Continue pagination until no more spaces
      if (spacesData._links && spacesData._links.next && newSpaces.length > 0) {
        start += limit;
        fetchCount++;
      } else {
        more = false;
      }
      
      // Safety check: if we get an empty batch, stop
      if (newSpaces.length === 0) {
        more = false;
      }
    }
    
    console.log(`📊 Found ${spaces.length} spaces, loading pages...`);
    
    // Now get pages from ALL spaces with unlimited pagination (up to 5000 pages)
    const allPages = [];
    const PAGE_LIMIT = 5000; // Limit to 5000 pages for performance
    
    console.log('📄 Fetching pages from all spaces...');
    for (const space of spaces) {
      // Stop if we've reached the page limit
      if (allPages.length >= PAGE_LIMIT) {
        console.log(`⚠️ Reached page limit of ${PAGE_LIMIT}, stopping`);
        break;
      }
      
      try {
        console.log(`📖 Fetching pages for space: ${space.name} (${space.key})`);
        
        let spacePages = [];
        let pageStart = 0;
        let pageMore = true;
        let pageFetchCount = 0;
        
        while (pageMore) {
          // Stop if we've reached the page limit
          if (allPages.length >= PAGE_LIMIT) {
            console.log(`⚠️ Reached page limit of ${PAGE_LIMIT}, stopping space pagination`);
            break;
          }
          
          console.log(`🔍 Fetching pages batch ${pageFetchCount + 1} for space ${space.key}, start: ${pageStart}`);
          
          const pagesResponse = await api.asUser().requestConfluence(
            route`/wiki/api/v2/spaces/${space.id}/pages?limit=${limit}&start=${pageStart}&sort=modified-date&order=desc`
          );
          
          if (!pagesResponse.ok) {
            console.log(`Pages API error for space ${space.key}:`, pagesResponse.status);
            break;
          }
          
          const pagesData = await pagesResponse.json();
          const newPages = (pagesData.results || [])
            .filter(page => page.title !== space.name && page.title !== space.key) // Filter out space names
            .map(page => ({
              id: page.id,
              title: page.title,
              spaceKey: space.key,
              spaceName: space.name,
              lastModified: page.version?.when || page.createdAt || 'Unknown'
            }));
          
          spacePages = spacePages.concat(newPages);
          console.log(`✅ Got ${newPages.length} pages in batch ${pageFetchCount + 1} for space ${space.key} (space total: ${spacePages.length})`);
          
          // Continue pagination until no more pages
          if (pagesData._links && pagesData._links.next && newPages.length > 0) {
            pageStart += limit;
            pageFetchCount++;
          } else {
            pageMore = false;
          }
          
          // Safety check: if we get an empty batch, stop
          if (newPages.length === 0) {
            pageMore = false;
          }
        }
        
        allPages.push(...spacePages);
        console.log(`✅ Completed space ${space.name}: ${spacePages.length} pages (running total: ${allPages.length})`);
        
      } catch (error) {
        console.error(`❌ Error loading pages for space ${space.key}:`, error);
        // Continue with next space
      }
    }
    
    console.log(`🎉 getAllPagesOptimized COMPLETE - ${allPages.length} pages from ${spaces.length} spaces`);
    return { 
      pages: allPages, 
      spaces: spaces,
      totalCount: allPages.length,
      loadedSpaces: spaces.length
    };
    
  } catch (error) {
    console.error('❌ getAllPagesOptimized error:', error);
    return { 
      pages: [], 
      spaces: [], 
      error: error.message,
      totalCount: 0,
      loadedSpaces: 0 
    };
  }
});

// Parse Confluence URL and load pages from specific space
resolver.define('loadPagesFromUrl', async (req) => {
  console.log('=== LOADING PAGES FROM URL ===');
  try {
    const { url } = req.payload;
    
    if (!url) {
      return { success: false, error: 'URL is required' };
    }
    
    // Parse the URL to extract space key and optionally page ID
    // Support multiple formats:
    // 1. Regular page: https://domain.atlassian.net/wiki/spaces/SPACEKEY/pages/PAGEID/PageTitle
    // 2. Space overview: https://domain.atlassian.net/wiki/spaces/SPACEKEY/overview
    let urlMatch = url.match(/\/wiki\/spaces\/([^\/]+)\/pages\/([^\/]+)/);
    let spaceKey, pageId;
    
    if (urlMatch) {
      // Regular page format
      spaceKey = urlMatch[1];
      pageId = urlMatch[2];
      console.log(`📍 Extracted space key: ${spaceKey}, page ID: ${pageId} (regular page)`);
    } else {
      // Try space overview format
      const spaceMatch = url.match(/\/wiki\/spaces\/([^\/]+)(?:\/overview)?(?:\/|$)/);
      if (spaceMatch) {
        spaceKey = spaceMatch[1];
        pageId = null; // No specific page, will load all pages from space
        console.log(`📍 Extracted space key: ${spaceKey} (space overview - will show all pages)`);
      } else {
        return { success: false, error: 'Invalid Confluence URL format. Expected: .../wiki/spaces/SPACEKEY/pages/PAGEID/... or .../wiki/spaces/SPACEKEY/overview' };
      }
    }
    
    // Find the space by key - try multiple approaches
    let space = null;
    let spacesResponse;
    
    // First try: Get space by key directly
    try {
      spacesResponse = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces/${spaceKey}`);
      if (spacesResponse.ok) {
        const spaceData = await spacesResponse.json();
        space = {
          id: spaceData.id,
          key: spaceData.key,
          name: spaceData.name
        };
      }
    } catch (err) {
      console.log(`Direct space lookup failed: ${err.message}`);
    }
    
    // Second try: Search all spaces and find by key
    if (!space) {
      spacesResponse = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=250`);
      if (spacesResponse.ok) {
        const spacesData = await spacesResponse.json();
        const foundSpace = (spacesData.results || []).find(s => s.key === spaceKey);
        if (foundSpace) {
          space = {
            id: foundSpace.id,
            key: foundSpace.key,
            name: foundSpace.name
          };
        }
      }
    }
    
    if (!space) {
      return { success: false, error: `Space '${spaceKey}' not found or not accessible. Make sure you have permission to view this space.` };
    }
    
    // Load all pages from this specific space
    let spacePages = [];
    let pageStart = 0;
    const limit = 250;
    let pageMore = true;
    let pageFetchCount = 0;
    
    console.log(`📄 Loading pages from space: ${space.name} (${space.key})`);
    
    while (pageMore) {
      console.log(`🔍 Fetching pages batch ${pageFetchCount + 1}, start: ${pageStart}`);
      
      const pagesResponse = await api.asUser().requestConfluence(
        route`/wiki/api/v2/spaces/${space.id}/pages?limit=${limit}&start=${pageStart}&sort=modified-date&order=desc`
      );
      
      if (!pagesResponse.ok) {
        console.log(`Pages API error:`, pagesResponse.status);
        break;
      }
      
      const pagesData = await pagesResponse.json();
      const newPages = (pagesData.results || [])
        .filter(page => page.title !== space.name && page.title !== space.key) // Filter out space names
        .map(page => ({
          id: page.id,
          title: page.title,
          spaceKey: space.key,
          spaceName: space.name,
          lastModified: page.version?.when || page.createdAt || 'Unknown'
        }));
      
      spacePages = spacePages.concat(newPages);
      console.log(`✅ Got ${newPages.length} pages in batch ${pageFetchCount + 1} (total: ${spacePages.length})`);
      
      // Continue pagination until no more pages
      if (pagesData._links && pagesData._links.next && newPages.length > 0) {
        pageStart += limit;
        pageFetchCount++;
      } else {
        pageMore = false;
      }
      
      // Safety check: if we get an empty batch, stop
      if (newPages.length === 0) {
        pageMore = false;
      }
    }
    
    console.log(`✅ Loaded ${spacePages.length} pages from space ${space.name}`);
    
    // If no specific page ID was provided (space overview URL), return all pages for browsing
    if (!pageId) {
      console.log(`🎯 Space overview mode: Returning all ${spacePages.length} pages for browsing`);
      return {
        success: true,
        pages: spacePages, // Return all pages for browsing
        spaces: [space],
        autoSelect: false, // Don't auto-select, let user browse
        directMode: false, // Allow normal browsing flow
        message: `Loaded ${spacePages.length} pages from space "${space.name}" for browsing`
      };
    }
    
    // Find the specific page from the URL (regular page format)
    const targetPage = spacePages.find(page => page.id === pageId);
    
    if (!targetPage) {
      return { success: false, error: `Page with ID ${pageId} not found in space ${space.name}. Make sure the URL is correct and you have access to this page.` };
    }
    
    console.log(`🎯 Found target page: ${targetPage.title}`);
    
    return {
      success: true,
      targetPage: targetPage, // Return only the specific page
      spaces: [space],
      autoSelect: true, // Flag for immediate progression
      directMode: true // Skip page browsing entirely
    };
    
  } catch (error) {
    console.error('❌ loadPagesFromUrl error:', error);
    return {
      success: false,
      error: error.message,
      pages: [],
      spaces: []
    };
  }
});

// Get all spaces only (no pages)
resolver.define('getAllSpaces', async (req) => {
  console.log('=== LOADING SPACES ONLY ===');
  try {
    let spaces = [];
    let start = 0;
    const limit = 250;
    let more = true;
    
    while (more) {
      const spacesResponse = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=${limit}&start=${start}`);
      
      if (!spacesResponse.ok) {
        throw new Error(`Spaces API failed: ${spacesResponse.status}`);
      }
      
      const spacesData = await spacesResponse.json();
      const newSpaces = (spacesData.results || []).map(space => ({
        id: space.id,
        key: space.key,
        name: space.name
      }));
      
      spaces = spaces.concat(newSpaces);
      
      if (spacesData._links && spacesData._links.next && newSpaces.length > 0) {
        start += limit;
      } else {
        more = false;
      }
      
      if (newSpaces.length === 0) {
        more = false;
      }
    }
    
    console.log(`✅ Loaded ${spaces.length} spaces`);
    return { success: true, spaces };
    
  } catch (error) {
    console.error('❌ getAllSpaces error:', error);
    return { success: false, error: error.message, spaces: [] };
  }
});

// Get top-level pages for parent selection (optimized for performance)
resolver.define('getParentPageOptions', async (req) => {
  console.log('=== LOADING PARENT PAGE OPTIONS ===');
  try {
    const { spaceKey, spaceId } = req.payload || {};
    
    if (!spaceKey && !spaceId) {
      throw new Error('spaceKey or spaceId is required');
    }
    
    // Get numeric space ID and space name if needed
    let numericSpaceId = spaceId;
    let spaceName = null;
    if (!numericSpaceId && spaceKey) {
      const space = await getSpaceById(spaceKey);
      if (space) {
        numericSpaceId = space.id;
        spaceName = space.name;
      }
    }
    
    if (!numericSpaceId) {
      throw new Error(`Could not resolve numeric space ID for space: ${spaceKey || spaceId}`);
    }
    
    console.log(`📄 Fetching parent page options for space ID: ${numericSpaceId}, name: ${spaceName}`);
    
    // Load only top-level pages with limited results for parent selection
    const response = await api.asUser().requestConfluence(
      route`/wiki/api/v2/spaces/${numericSpaceId}/pages?limit=50&sort=title&order=asc`
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Parent pages API error:', response.status, errorText);
      throw new Error(`Parent pages API failed: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const parentPages = (data.results || [])
      .filter(page => {
        // Filter out space names and space keys
        return page.title !== spaceKey && page.title !== spaceName;
      })
      .map(page => ({
        id: page.id,
        title: page.title,
        spaceKey: spaceKey,
        lastModified: page.version?.when || page.createdAt || 'Unknown'
      }))
      .slice(0, 30); // Limit to top 30 pages for performance
    
    console.log(`✅ Loaded ${parentPages.length} parent page options`);
    return { success: true, pages: parentPages };
    
  } catch (error) {
    console.error('❌ getParentPageOptions error:', error);
    return { success: false, error: error.message, pages: [] };
  }
});

// ============================================================================
// VERIFICATION FUNCTION
// ============================================================================
// UPLOAD TEMPLATE (from original app step 3b)
// ============================================================================

// Upload Template: fetch an existing Confluence page and store as a reusable template
resolver.define('uploadTemplate', async (req) => {
  try {
    const { url, pageId, name } = req.payload || {};
    console.log('📤 uploadTemplate called with URL:', url, 'pageId:', pageId, 'name:', name);

    let finalPageId = pageId;
    
    // If pageId is provided directly, use it
    if (pageId) {
      finalPageId = pageId;
    }
    // Otherwise, extract from URL if provided
    else if (url && typeof url === 'string' && url.trim()) {
      // Extract pageId from common Confluence URL forms: /pages/{id} or /pages/edit-v2/{id}
      const patterns = [
        /\/pages\/(\d+)/,                    // Regular page: /pages/123456
        /\/pages\/edit-v2\/(\d+)/,           // Editor: /pages/edit-v2/123456
        /\/pages\/viewpage\.action\?pageId=(\d+)/, // Legacy: /pages/viewpage.action?pageId=123456
        /[?&]pageId=(\d+)/                   // Query param: ?pageId=123456
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          finalPageId = match[1];
          break;
        }
      }
    }

    if (!finalPageId) {
      return { 
        success: false, 
        error: url ? 'Could not extract page ID from URL. Please use a direct Confluence page URL.' : 'Page ID or URL is required'
      };
    }

    console.log('📏 Extracted page ID:', finalPageId);

    // Fetch the page content using Confluence API v2
    const response = await api.asUser().requestConfluence(
      route`/wiki/api/v2/pages/${finalPageId}?body-format=storage`
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch page content: ${response.status} - ${errorText}`);
    }
    
    const pageData = await response.json();
    console.log('✅ Page data fetched for cloning:', pageData.title);
    console.log('📄 Original content length:', pageData.body.storage.value.length);
    
    // Use custom template name if provided, otherwise auto-generate from page title
    const finalTemplateName = name && name.trim() 
      ? name.trim() 
      : pageData.title || 'Cloned Page';
    console.log('📝 Final template name:', finalTemplateName);
    
    // Create template object - store raw content for direct cloning
    const templateId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const template = {
      id: templateId,
      name: finalTemplateName,
      sourcePageId: finalPageId,
      sourcePageTitle: pageData.title,
      sourceSpaceKey: pageData.spaceId,
      content: pageData.body.storage.value,
      createdAt: new Date().toISOString(),
      type: 'user_uploaded'
    };
    
    // Store template in Forge storage
    await storage.set(`template_${templateId}`, template);
    
    console.log('✅ Template created and stored:', templateId);
    return {
      success: true,
      template: {
        id: template.id,
        name: template.name,
        sourcePageTitle: template.sourcePageTitle,
        createdAt: template.createdAt
      }
    };
    
  } catch (error) {
    console.error('❌ uploadTemplate error:', error);
    return { success: false, error: error.message };
  }
});

// Get all user uploaded templates
resolver.define('getUserTemplates', async (req) => {
  try {
    console.log('📋 Getting user templates...');
    
    // Get all storage keys
    const keys = await storage.query().where('key', 'startsWith', 'template_').getMany();
    
    const templates = keys.results.map(item => {
      const template = item.value;
      return {
        id: template.id,
        name: template.name,
        sourcePageTitle: template.sourcePageTitle,
        createdAt: template.createdAt
      };
    });
    
    console.log('✅ Found templates:', templates.length);
    return { templates };
  } catch (error) {
    console.error('❌ getUserTemplates error:', error);
    return { templates: [], error: error.message };
  }
});

// ============================================================================
// BULK GENERATE - Full implementation matching BRG functionality
// ============================================================================

// Create multiple pages from a template with support for single, numbered, weekly, monthly, quarterly modes
resolver.define('bulkGeneratePages', async (req) => {
  try {
    const { 
      templateId, 
      spaceKey,
      spaceId,
      parentPageId,
      pageTitle,
      pageTitles, // NEW: array of individual page titles
      generationMode = 'single',
      numberedCount = 6,
      weeklyStartMonth,
      weeklyStartDay,
      weeklyStartYear,
      weeklyCount,
      monthlyTargetMonth,
      monthlyTargetYear,
      monthlyCount,
      quarterlyStartMonth,
      quarterlyStartQuarter,
      quarterlyTargetYear,
      quarterlyCount,
      pageOrganization = 'create-child',
      newParentTitle
    } = req.payload || {};
    
    console.log('🏭 bulkGeneratePages called with:', {
      templateId,
      spaceKey,
      pageTitle,
      pageTitles,
      generationMode,
      pageOrganization
    });
    
    if (!templateId || !spaceKey) {
      throw new Error('templateId and spaceKey are required');
    }
    
    // Determine what titles to use
    let titlesToCreate = [];
    if (pageTitles && Array.isArray(pageTitles) && pageTitles.length > 0) {
      // Use the provided individual titles (new approach)
      titlesToCreate = pageTitles.filter(title => title && title.trim());
      console.log('📝 Using individual page titles:', titlesToCreate);
    } else if (pageTitle) {
      // Fall back to legacy generation mode
      titlesToCreate = [pageTitle];
      console.log('📝 Using single page title:', pageTitle);
    } else {
      throw new Error('Either pageTitle or pageTitles array is required');
    }
    
    if (titlesToCreate.length === 0) {
      throw new Error('No valid page titles provided');
    }
    
    // Get the template content
    const templateData = await storage.get(`template_${templateId}`);
    if (!templateData) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    console.log('📄 Using template:', templateData.name);
    
    // Get numeric space ID if not provided
    let numericSpaceId = spaceId;
    if (!numericSpaceId) {
      const space = await getSpaceById(spaceKey);
      numericSpaceId = space?.id;
    }
    
    if (!numericSpaceId) {
      throw new Error(`Could not resolve numeric space ID for space: ${spaceKey}`);
    }
    
    // Handle creating a new parent page if needed
    let actualParentPageId = parentPageId;
    if ((pageOrganization === 'create' || pageOrganization === 'create-parent') && newParentTitle) {
      console.log('Creating new parent page:', newParentTitle);
      const parentPayload = {
        spaceId: numericSpaceId,
        status: 'current',
        title: newParentTitle.trim(),
        body: {
          representation: 'storage',
          value: ''
        }
      };
      
      const parentResponse = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(parentPayload)
      });
      
      if (parentResponse.ok) {
        const parentData = await parentResponse.json();
        actualParentPageId = parentData.id;
        console.log('✅ Parent page created:', actualParentPageId);
      } else {
        throw new Error('Failed to create parent page');
      }
    }
    
    // Calculate how many pages to create
    const pageCount = titlesToCreate.length;
    
    console.log(`🚀 Creating ${pageCount} pages`);
    
    const createdPages = [];
    const errors = [];
    
    // Create pages in parallel batches for better performance
    const BATCH_SIZE = 10; // Process 10 pages at a time
    const batches = [];
    
    // Split pages into batches
    for (let i = 0; i < pageCount; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, pageCount);
      const batch = [];
      
      for (let j = i; j < batchEnd; j++) {
        batch.push({
          index: j,
          title: titlesToCreate[j]
        });
      }
      batches.push(batch);
    }
    
    console.log(`📦 Split ${pageCount} pages into ${batches.length} batches of ${BATCH_SIZE}`);
    
    // Process each batch sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} pages`);
      
      // Create pages sequentially to maintain order
      const batchResults = [];
      for (let i = 0; i < batch.length; i++) {
        const pageInfo = batch[i];
        try {
          console.log(`📝 Creating page ${pageInfo.index + 1}/${pageCount}: ${pageInfo.title}`);
          
          // Prepare page payload
          const pagePayload = {
            spaceId: numericSpaceId,
            status: 'current',
            title: pageInfo.title,
            body: {
              representation: 'storage',
              value: templateData.content
            }
          };
          
          // Add parent if specified
          if (pageOrganization === 'create-child' && actualParentPageId) {
            pagePayload.parentId = actualParentPageId;
          } else if ((pageOrganization === 'create' || pageOrganization === 'create-parent') && actualParentPageId) {
            pagePayload.parentId = actualParentPageId;
          }
          
          // Create the page
          const response = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(pagePayload)
          });
          
          if (response.ok) {
            const pageData = await response.json();
            console.log('✅ Page created successfully:', pageData.id);
            
            // Add small delay to ensure proper creation order
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const pageUrl = `${req.context.siteUrl}/wiki/spaces/${spaceKey}/pages/${pageData.id}`;
            batchResults.push({
              success: true,
              pageId: pageData.id,
              title: pageInfo.title,
              url: pageUrl
            });
          } else {
            const errorText = await response.text();
            console.error('❌ Page creation failed:', errorText);
            batchResults.push({
              success: false,
              error: `${pageInfo.title}: ${errorText}`
            });
          }
          
        } catch (error) {
          console.error(`❌ Error creating page:`, error);
          batchResults.push({
            success: false,
            error: `Page ${pageInfo.index + 1}: ${error.message}`
          });
        }
      }
      
      // Process results
      batchResults.forEach(result => {
        if (result.success) {
          createdPages.push(result);
        } else {
          errors.push(result.error);
        }
      });
      
      console.log(`✅ Batch ${batchIndex + 1} complete: ${batchResults.filter(r => r.success).length} successful, ${batchResults.filter(r => !r.success).length} errors`);
    }
    
    console.log(`🏁 Bulk generation complete: ${createdPages.length} successful, ${errors.length} errors`);
    
    return {
      success: true,
      pages: createdPages,
      errors,
      reportCount: createdPages.length,
      message: `Successfully created ${createdPages.length} page(s)`,
      firstPageUrl: createdPages[0]?.url,
      multipleReports: createdPages.length > 1
    };
    
  } catch (error) {
    console.error('❌ bulkGeneratePages error:', error);
    return { success: false, error: error.message };
  }
});

// Close modal function for Custom UI
resolver.define('closeModal', async (req) => {
  console.log('=== CLOSING MODAL ===');
  try {
    // For Custom UI modals, we'll return success and let the frontend handle the closing
    return { success: true, action: 'close' };
  } catch (error) {
    console.error('❌ closeModal error:', error);
    return { success: false, error: error.message };
  }
});

export const handler = resolver.getDefinitions();