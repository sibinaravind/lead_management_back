const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration
const config = {
  ACCESS_TOKEN: process.env.META_ACCESS_TOKEN, // System User Token
  BUSINESS_ID: process.env.META_BUSINESS_ID,   // Your Business Manager ID
  API_VERSION: 'v18.0'
};

// Base URL for Meta Graph API
const GRAPH_API_BASE = `https://graph.facebook.com/${config.API_VERSION}`;

// === BUSINESS MANAGER & CAMPAIGN FUNCTIONS ===

// Get Business Manager Ad Accounts
async function getBusinessAdAccounts() {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${config.BUSINESS_ID}/client_ad_accounts`, {
      params: {
        access_token: config.ACCESS_TOKEN,
        fields: 'id,name,account_status,currency,timezone_name,created_time',
        limit: 100
      }
    });
    
    return response.data.data;
  } catch (error) {
    console.error('Error fetching ad accounts:', error.response?.data || error.message);
    throw error;
  }
}

// Get latest campaigns from an ad account
async function getLatestCampaigns(adAccountId, limit = 5) {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/act_${adAccountId}/campaigns`, {
      params: {
        access_token: config.ACCESS_TOKEN,
        fields: 'id,name,status,objective,created_time,updated_time,start_time,stop_time,daily_budget,lifetime_budget',
        sort: 'created_time_descending',
        limit: limit
      }
    });
    
    return response.data.data;
  } catch (error) {
    console.error(`Error fetching campaigns for account ${adAccountId}:`, error.response?.data || error.message);
    throw error;
  }
}

// Get all latest campaigns across all ad accounts
async function getAllLatestCampaigns(limit = 5) {
  try {
    const adAccounts = await getBusinessAdAccounts();
    let allCampaigns = [];
    
    for (const account of adAccounts) {
      try {
        const campaigns = await getLatestCampaigns(account.id.replace('act_', ''), limit);
        const campaignsWithAccount = campaigns.map(campaign => ({
          ...campaign,
          ad_account_id: account.id,
          ad_account_name: account.name
        }));
        allCampaigns = allCampaigns.concat(campaignsWithAccount);
      } catch (error) {
        console.error(`Error fetching campaigns for account ${account.name}:`, error.message);
      }
    }
    
    // Sort all campaigns by created_time and get top 5
    allCampaigns.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
    return allCampaigns.slice(0, limit);
  } catch (error) {
    console.error('Error fetching all latest campaigns:', error);
    throw error;
  }
}

// Get lead ads for a specific campaign
async function getCampaignLeadAds(campaignId) {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${campaignId}/ads`, {
      params: {
        access_token: config.ACCESS_TOKEN,
        fields: 'id,name,status,creative{object_type,object_id},adset_id,campaign_id,created_time',
        filtering: JSON.stringify([{
          field: 'ad.creative.object_type',
          operator: 'EQUAL',
          value: 'LEAD_FORM'
        }])
      }
    });
    
    return response.data.data;
  } catch (error) {
    console.error(`Error fetching lead ads for campaign ${campaignId}:`, error.response?.data || error.message);
    return [];
  }
}

// Get lead form ID from creative
async function getLeadFormFromCreative(creativeId) {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${creativeId}`, {
      params: {
        access_token: config.ACCESS_TOKEN,
        fields: 'object_id,object_type'
      }
    });
    
    if (response.data.object_type === 'LEAD_FORM') {
      return response.data.object_id;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching creative ${creativeId}:`, error.response?.data || error.message);
    return null;
  }
}

// Get leads for a specific form
async function getLeadsForForm(formId, limit = 50) {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${formId}/leads`, {
      params: {
        access_token: config.ACCESS_TOKEN,
        fields: 'id,created_time,ad_id,form_id,field_data,is_organic,campaign_id,adset_id',
        limit: limit,
        sort: 'created_time_descending'
      }
    });
    
    return response.data.data || [];
  } catch (error) {
    console.error(`Error fetching leads for form ${formId}:`, error.response?.data || error.message);
    return [];
  }
}

// Get lead form details
async function getLeadFormDetails(formId) {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${formId}`, {
      params: {
        access_token: config.ACCESS_TOKEN,
        fields: 'id,name,status,leads_count,created_time,page_id'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching form details for ${formId}:`, error.response?.data || error.message);
    return null;
  }
}

// Main function to get latest campaigns with their leads
async function getLatestCampaignsWithLeads(campaignLimit = 5) {
  try {
    console.log('Fetching latest campaigns...');
    const campaigns = await getAllLatestCampaigns(campaignLimit);
    
    const campaignsWithLeads = [];
    
    for (const campaign of campaigns) {
      console.log(`Processing campaign: ${campaign.name}`);
      
      const campaignData = {
        campaign: campaign,
        lead_ads: [],
        total_leads: 0,
        leads: []
      };
      
      // Get lead ads for this campaign
      const leadAds = await getCampaignLeadAds(campaign.id);
      campaignData.lead_ads = leadAds;
      
      // For each lead ad, get the form and leads
      for (const ad of leadAds) {
        if (ad.creative && ad.creative.object_id) {
          const formId = ad.creative.object_id;
          
          // Get form details
          const formDetails = await getLeadFormDetails(formId);
          if (formDetails) {
            // Get leads for this form
            const leads = await getLeadsForForm(formId, 20);
            
            // Format leads with additional info
            const formattedLeads = leads.map(lead => ({
              ...formatLeadData(lead),
              ad_id: ad.id,
              ad_name: ad.name,
              form_id: formId,
              form_name: formDetails.name,
              campaign_id: campaign.id,
              campaign_name: campaign.name
            }));
            
            campaignData.leads = campaignData.leads.concat(formattedLeads);
            campaignData.total_leads += formattedLeads.length;
          }
        }
      }
      
      // Sort leads by created_time (newest first)
      campaignData.leads.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
      
      campaignsWithLeads.push(campaignData);
    }
    
    return campaignsWithLeads;
  } catch (error) {
    console.error('Error getting campaigns with leads:', error);
    throw error;
  }
}

// Format lead data for better readability
function formatLeadData(lead) {
  const formatted = {
    id: lead.id,
    created_time: lead.created_time,
    ad_id: lead.ad_id,
    campaign_id: lead.campaign_id,
    adset_id: lead.adset_id,
    is_organic: lead.is_organic,
    fields: {}
  };
  
  // Parse field data
  if (lead.field_data) {
    lead.field_data.forEach(field => {
      formatted.fields[field.name] = field.values ? field.values.join(', ') : '';
    });
  }
  
  return formatted;
}

// Check token validity
async function checkTokenStatus() {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/me`, {
      params: {
        access_token: config.ACCESS_TOKEN
      }
    });
    
    return {
      valid: true,
      user: response.data
    };
  } catch (error) {
    return {
      valid: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

// === API ENDPOINTS ===

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const tokenStatus = await checkTokenStatus();
    res.json({
      success: tokenStatus.valid,
      message: tokenStatus.valid ? 'Token is valid' : 'Token is invalid',
      data: tokenStatus.valid ? tokenStatus.user : tokenStatus.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get business ad accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await getBusinessAdAccounts();
    res.json({
      success: true,
      count: accounts.length,
      accounts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Get latest campaigns
app.get('/api/campaigns/latest', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const campaigns = await getAllLatestCampaigns(parseInt(limit));
    
    res.json({
      success: true,
      count: campaigns.length,
      campaigns
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Get latest campaigns with their leads - MAIN ENDPOINT
app.get('/api/campaigns/with-leads', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    console.log(`Fetching latest ${limit} campaigns with leads...`);
    
    const campaignsWithLeads = await getLatestCampaignsWithLeads(parseInt(limit));
    
    // Summary statistics
    const summary = {
      total_campaigns: campaignsWithLeads.length,
      total_leads: campaignsWithLeads.reduce((sum, campaign) => sum + campaign.total_leads, 0),
      campaigns_with_leads: campaignsWithLeads.filter(c => c.total_leads > 0).length
    };
    
    res.json({
      success: true,
      summary,
      data: campaignsWithLeads
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Get leads for a specific campaign
app.get('/api/campaign/:campaignId/leads', async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Get lead ads for this campaign
    const leadAds = await getCampaignLeadAds(campaignId);
    let allLeads = [];
    
    for (const ad of leadAds) {
      if (ad.creative && ad.creative.object_id) {
        const leads = await getLeadsForForm(ad.creative.object_id, 50);
        const formattedLeads = leads.map(lead => ({
          ...formatLeadData(lead),
          ad_id: ad.id,
          ad_name: ad.name
        }));
        allLeads = allLeads.concat(formattedLeads);
      }
    }
    
    res.json({
      success: true,
      campaign_id: campaignId,
      count: allLeads.length,
      leads: allLeads
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Export all data as CSV-like format
app.get('/api/export/leads', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const campaignsWithLeads = await getLatestCampaignsWithLeads(parseInt(limit));
    
    // Flatten all leads into a single array
    const allLeads = [];
    campaignsWithLeads.forEach(campaign => {
      campaign.leads.forEach(lead => {
        allLeads.push({
          lead_id: lead.id,
          created_time: lead.created_time,
          campaign_name: lead.campaign_name,
          ad_name: lead.ad_name,
          form_name: lead.form_name,
          ...lead.fields
        });
      });
    });
    
    res.json({
      success: true,
      total_leads: allLeads.length,
      leads: allLeads
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    api_version: config.API_VERSION
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Meta Business Manager Lead API running on port ${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`- GET /api/test - Test access token`);
  console.log(`- GET /api/accounts - Get business ad accounts`);
  console.log(`- GET /api/campaigns/latest?limit=5 - Get latest campaigns`);
  console.log(`- GET /api/campaigns/with-leads?limit=5 - Get latest campaigns with leads (MAIN)`);
  console.log(`- GET /api/campaign/:campaignId/leads - Get leads for specific campaign`);
  console.log(`- GET /api/export/leads?limit=5 - Export all leads as flat data`);
  console.log(`- GET /health - Health check`);
  console.log(`\nMake sure to set these environment variables:`);
  console.log(`- META_ACCESS_TOKEN=your_system_user_token`);
  console.log(`- META_BUSINESS_ID=your_business_manager_id`);
});


// const express = require("express");
// const session = require('express-session');
// const bodyParser = require('body-parser');
// const cookieParser = require('cookie-parser');
// const path = require('path');
// const hbs = require('express-handlebars');
// const db = require('./config/connection');
// const fileUpload = require('express-fileupload');
// const fs = require('fs');
// const cron = require('node-cron');
// const http = require('http');
// const cors = require('cors');
// const PORT = process.env.PORT || 3000;

// const compression = require('compression');

// const { createWriteStream } = require('fs');
// const app = express();
// const server = http.createServer(app);

// // Database connections
// db.connect(err => {
//   if (err) console.log("Mongo connection error: " + err);
//   else console.log("Mongo connected");
// });
// // Middleware setup
// app.use(cors());
// app.use(express.static(path.join(__dirname, 'assets')));
// app.use(bodyParser.json({ limit: '25mb' }));
// app.use(bodyParser.urlencoded({ limit: '25mb', extended: true }));


// // app.use(bodyParser.urlencoded({ extended: false }));
// app.use(cookieParser());
// app.use(session({
//   secret: "Aikara",
//   resave: false,
//   saveUninitialized: true,
//   cookie: { maxAge: 90000 }
// }));
// app.use(compression());
// app.use(fileUpload({ safeFileNames: true, preserveExtension: true, }));
// app.use(express.json());
// app.use("/uploads", express.static("uploads"));

// // Handlebars setup
// app.engine('hbs', hbs.engine({
//   extname: 'hbs',
//   defaultLayout: 'layout',
//   layoutsDir: path.join(__dirname, 'views/layout/'),
//   partialsDir: [
//     path.join(__dirname, 'views/partials'),
//     path.join(__dirname, 'views/website/partials')
//   ],
// }));

// app.set('views', path.join(__dirname, 'views'));
// app.set('view engine', 'hbs');

// // Route imports
// const routes = [
//   { path: '/officersAuth', route: require("./routes/officers/user_auth") },
//   { path: '/officer', route: require("./routes/officers/officers_router") },
//   { path: '/config', route: require("./routes/officers/configs_router") },
//   { path: '/project', route: require("./routes/officers/project_router") },
//   { path: '/customers', route: require("./routes/officers/customer_router") },
//   { path: '/lead', route: require("./routes/officers/lead_router") },
//   { path: '/', route: require("./routes/webiste/website") }
// ];

// // Use routes
// routes.forEach(({ path, route }) => app.use(path, route));

// // Handle unmatched routes (404)
// app.use((req, res, next) => {
//   res.status(404).json({ msg: "url not found error" });
// });

// // Terms and Conditions route
// app.route("/termsAndConditions").get((req, res) => res.render("terms"));

// // Error handling
// app.use((req, res, next) => {
//   res.status(404).render("error");
// });


// // Start the server
// server.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));

// // Cron job for token refresh
// cron.schedule('0 0 */8 * *', async () => {
//   const TOKEN_FILE_PATH = path.join(__dirname, '.env');
//   try {
//     const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         "email": "sibinjames.sibin@gmail.com",
//         "password": "Unni@001"
//       })
//     });

//     if (!response.ok) throw new Error('Failed to refresh token');

//     const data = await response.json();
//     const newToken = data.token;

//     fs.writeFileSync(TOKEN_FILE_PATH, `
//       API_KEY=${process.env.API_KEY}
//       SHIPROCKETAPI=${newToken}`);
//     process.env.SHIPROCKETAPI = newToken;
//   } catch (error) {
//     console.error('Error refreshing token:', error);
//   }
// });



// // // active ,inactive,deleted,blocked,unassigned


