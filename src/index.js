import Resolver from '@forge/resolver';
import api, { route, storage } from '@forge/api';

const resolver = new Resolver();

console.log('🚀 BULK PAGE GENERATOR - RESOLVER LOADING...');

// ============================================================================
// SPACES MANAGEMENT (from original app)
// ============================================================================

// Get all available Confluence spaces
resolver.define('getSpaces', async (req) => {
  console.log('=== FETCHING SPACES ===');
  try {
    // Use standard API limit of 250 (max supported by Confluence API v2)
    const response = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=250`);
    
    if (!response.ok) {
      console.log('Spaces API error:', response.status, await response.text());
      throw new Error(`Spaces API failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Raw spaces response:', JSON.stringify(data, null, 2));
    
    const spaces = (data.results || []).map(space => ({
      key: space.key,
      name: space.name,
      type: space.type,
      status: space.status
    }));
    
    console.log('✅ Total spaces fetched:', spaces.length);
    return { spaces };
  } catch (error) {
    console.error('❌ getSpaces error:', error);
    return { spaces: [], error: error.message };
  }
});

// Get pages in a specific space - based on original BulkReportGenerator logic
resolver.define('getSpacePages', async (req) => {
  console.log('=== FETCHING SPACE PAGES ===');
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
      console.log(`Looking up space ID for key: ${spaceKey}`);
      const spaceResp = await api.asUser().requestConfluence(
        route`/wiki/api/v2/spaces?keys=${spaceKey}&limit=1`
      );
      
      if (spaceResp.ok) {
        const spaceData = await spaceResp.json();
        if (spaceData.results && spaceData.results[0]) {
          numericSpaceId = spaceData.results[0].id;
          actualSpaceKey = spaceData.results[0].key;
          console.log(`Found numeric space ID: ${numericSpaceId} for key: ${actualSpaceKey}`);
        }
      }
    }
    
    if (!numericSpaceId) {
      throw new Error(`Could not resolve numeric space ID for space: ${spaceKey || spaceId}`);
    }
    
    console.log(`Fetching pages for space ID: ${numericSpaceId}`);
    
    // UNLIMITED pagination - fetch ALL pages in space
    let allPages = [];
    let start = 0;
    const limit = 100;
    let more = true;
    let fetchCount = 0;
    
    while (more) {
      console.log(`🔍 Fetching pages batch ${fetchCount + 1}, start: ${start}, limit: ${limit}`);
      const response = await api.asUser().requestConfluence(
        route`/wiki/api/v2/spaces/${numericSpaceId}/pages?limit=${limit}&start=${start}`
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Pages API error:', response.status, errorText);
        throw new Error(`Pages API failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      const newPages = (data.results || []).map(page => ({
        id: page.id,
        title: page.title,
        spaceKey: spaceKey || identifier,
        lastModified: page.version?.when || page.createdAt || 'Unknown'
      }));
      
      allPages = allPages.concat(newPages);
      console.log(`✅ Successfully got ${newPages.length} pages in batch ${fetchCount + 1} (total: ${allPages.length})`);
      
      // Continue pagination until no more pages
      if (data._links && data._links.next && newPages.length > 0) {
        start += limit;
        fetchCount++;
        console.log(`➡️ More pages available, continuing to batch ${fetchCount + 1}...`);
      } else {
        more = false;
        console.log(`🏁 Reached end of pages, fetching complete`);
      }
      
      // Safety check: if we get an empty batch, stop
      if (newPages.length === 0) {
        console.log(`⚠️ Empty batch received, stopping pagination`);
        more = false;
      }
    }
    
    console.log('✅ Total pages fetched for space:', allPages.length);
    return { pages: allPages };
  } catch (error) {
    console.error('❌ getSpacePages error:', error);
    return { pages: [], error: error.message };
  }
});

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
      generationMode,
      pageOrganization
    });
    
    if (!templateId || !spaceKey || !pageTitle) {
      throw new Error('templateId, spaceKey, and pageTitle are required');
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
      const spaceResp = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?keys=${spaceKey}&limit=1`);
      if (spaceResp.ok) {
        const spaceData = await spaceResp.json();
        numericSpaceId = spaceData.results?.[0]?.id;
      }
    }
    
    if (!numericSpaceId) {
      throw new Error(`Could not resolve numeric space ID for space: ${spaceKey}`);
    }
    
    // Handle creating a new parent page if needed
    let actualParentPageId = parentPageId;
    if (pageOrganization === 'create' && newParentTitle) {
      console.log('Creating new parent page:', newParentTitle);
      const parentPayload = {
        spaceId: numericSpaceId,
        status: 'current',
        title: newParentTitle.trim(),
        body: {
          representation: 'storage',
          value: `<h1>${newParentTitle}</h1><p>Parent page for bulk generated pages</p>`
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
    
    // Calculate how many pages to create based on generation mode
    let pageCount = 1;
    if (generationMode === 'numbered') {
      pageCount = numberedCount;
    } else if (generationMode === 'weekly') {
      pageCount = weeklyCount;
    } else if (generationMode === 'monthly') {
      pageCount = monthlyCount;
    } else if (generationMode === 'quarterly') {
      pageCount = quarterlyCount;
    }
    
    console.log(`🚀 Creating ${pageCount} pages in ${generationMode} mode`);
    
    const createdPages = [];
    const errors = [];
    
    // Helper to generate unique page title
    const generatePageTitle = (index) => {
      if (generationMode === 'single') {
        return pageTitle;
      } else if (generationMode === 'numbered') {
        return `${pageTitle} (${index + 1})`;
      } else if (generationMode === 'weekly') {
        // Calculate week date
        const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(weeklyStartMonth);
        const startDate = new Date(weeklyStartYear, monthIndex, parseInt(weeklyStartDay) || 16);
        const targetDate = new Date(startDate);
        targetDate.setDate(startDate.getDate() + (index * 7));
        const weekDate = targetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return `${pageTitle} - Week of ${weekDate}`;
      } else if (generationMode === 'monthly') {
        // Calculate month
        const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(monthlyTargetMonth);
        const targetMonth = (monthIndex + index) % 12;
        const targetYear = monthlyTargetYear + Math.floor((monthIndex + index) / 12);
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${pageTitle} - ${monthNames[targetMonth]} ${targetYear}`;
      } else if (generationMode === 'quarterly') {
        // Calculate quarter
        const quarterMap = { 'Q1': 0, 'Q2': 3, 'Q3': 6, 'Q4': 9 };
        const startQuarterMonth = quarterMap[quarterlyStartQuarter];
        const monthsOffset = index * 3;
        const targetMonth = (startQuarterMonth + monthsOffset) % 12;
        const yearsOffset = Math.floor((startQuarterMonth + monthsOffset) / 12);
        const targetYear = quarterlyTargetYear + yearsOffset;
        const quarterNum = Math.floor(targetMonth / 3) + 1;
        return `${pageTitle} - Q${quarterNum} ${targetYear}`;
      }
      return pageTitle;
    };
    
    // Create pages
    for (let i = 0; i < pageCount; i++) {
      try {
        const pageName = generatePageTitle(i);
        console.log(`📝 Creating page ${i + 1}/${pageCount}: ${pageName}`);
        
        // Prepare page payload
        const pagePayload = {
          spaceId: numericSpaceId,
          status: 'current',
          title: pageName,
          body: {
            representation: 'storage',
            value: templateData.content
          }
        };
        
        // Add parent if specified
        if (pageOrganization === 'create-child' && actualParentPageId) {
          pagePayload.parentId = actualParentPageId;
        } else if (pageOrganization === 'create' && actualParentPageId) {
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
          
          const pageUrl = `${req.context.siteUrl}/wiki/spaces/${spaceKey}/pages/${pageData.id}`;
          createdPages.push({
            success: true,
            pageId: pageData.id,
            title: pageName,
            url: pageUrl
          });
        } else {
          const errorText = await response.text();
          console.error('❌ Page creation failed:', errorText);
          errors.push(`${pageName}: ${errorText}`);
        }
        
      } catch (error) {
        console.error(`❌ Error creating page:`, error);
        errors.push(`Page ${i + 1}: ${error.message}`);
      }
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