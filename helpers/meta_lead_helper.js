
const axios = require('axios');
var db = require('../config/connection');
require('dotenv').config();
let COLLECTION = require('../config/collections')

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';
const SYSTEM_USER_TOKEN = process.env.USER_ACCSS_TOKEN; // system user token
const PAGE_ID = process.env.PAGE_ID;

function parseMetaError(error) {
  if (error.response && error.response.data && error.response.data.error) {
    const e = error.response.data.error;
    return `Meta API Error - ${e.message} (Type: ${e.type}, Code: ${e.code}, Trace: ${e.fbtrace_id})`;
  }
  return error.message || 'Unknown error';
}

async function getPageAccessToken() {
  try {
    const response = await axios.get(`${GRAPH_API_BASE}/${PAGE_ID}`, {
      params: {
        fields: 'access_token',
        access_token: SYSTEM_USER_TOKEN,
      },
    });

    return response.data.access_token;
  } catch (err) {
    throw new Error('Failed to get Page Access Token: ' + parseMetaError(err));
  }
}

module.exports = {
  fetchFormsAndLeadsInsert: async () => {
    // console.log('Starting fetchFormsAndLeadsInsert process...');
    const collection = db.get().collection(COLLECTION.LEADS);
    // await collection.createIndex({ leadId: 1 }, { unique: true }); //req

    const summary = [];

    let PAGE_ACCESS_TOKEN;

    try {
      PAGE_ACCESS_TOKEN = await getPageAccessToken();
      console.log(`✅ Page Access Token fetched`);
    } catch (err) {
      console.error(err.message);
      return [{ error: err.message }];
    }

    try {
      console.log(`📄 Fetching leadgen forms for page ID: ${PAGE_ID}`);
      const formRes = await axios.get(`${GRAPH_API_BASE}/${PAGE_ID}/leadgen_forms`, {
        params: { access_token: PAGE_ACCESS_TOKEN },
      });

      const forms = formRes.data.data;

      for (const form of forms) {
        const formId = form.id;
        const formName = form.name;

        let leads = [];

        try {
          const leadRes = await axios.get(`${GRAPH_API_BASE}/${formId}/leads`, {
            params: { access_token: PAGE_ACCESS_TOKEN },
          });

          leads = leadRes.data.data || [];
        } catch (leadError) {
          const errMsg = parseMetaError(leadError);
          console.error(`❌ Error fetching leads for form ${formId} (${formName}):`, errMsg);
          summary.push({
            formId,
            formName,
            error: errMsg,
          });
          continue;
        }

        let inserted = 0;
        let skipped = 0;

        for (const lead of leads) {
          try {
            const exists = await collection.findOne({ leadId: lead.id });
            if (exists) {
              skipped++;
              continue;
            }

            const formattedLead = {
              leadId: lead.id,
              formId,
              createdAt: new Date(lead.created_time),
              fields: Object.fromEntries(
                lead.field_data.map(f => [f.name, f.values[0]])
              ),
            };

            await collection.insertOne(formattedLead);
            inserted++;
          } catch (insertError) {
            console.error(`❌ Error inserting lead ${lead.id}:`, insertError.message);
            skipped++;
          }
        }

        summary.push({
          formId,
          formName,
          totalFetched: leads.length,
          inserted,
          skipped,
        });
      }
    } catch (formError) {
      const errMsg = parseMetaError(formError);
      console.error('❌ Error fetching forms:', errMsg);
      return [{ error: errMsg }];
    }
    return summary;
  },
}


//   createLead: async (details) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.LEADS);

//                 // // Ensure unique index on client_id (run once in your setup/migration scripts)
//                 // await collection.createIndex({ client_id: 1 }, { unique: true });

//                 // Check for duplicate client (by email or phone)
//                 const existingClient = await collection.findOne({
//                     $or: [
//                         { email: details.email },
//                         { phone: details.phone }
//                     ]
//                 });
//                 if (existingClient) return reject("Client already exists with this email or phone");

//                 // Get next client number atomically
//                 const newNumber = await getNextSequence('lead_id');
//                 const lead_id = `AELD${String(newNumber).padStart(5, '0')}`;


//                 const result = await collection.insertOne({
//                     lead_id: lead_id,
//                     name: details.name,
//                     email: details.email,
//                     phone: details.phone,
//                     alternate_phone: details.alternate_phone,
//                     date_of_birth: details.date_of_birth,
//                     counsilor: details.counsilor,  //need to check the coming officer is cousilor , then only add the cousilor
//                     counsilor_id: details.counsilor_id,
//                     assign_to: details.assign_to,
//                     qualification: details.qualification,
//                     job_start_date: details.job_start_date,
//                     experience: details.experience,
//                     preferred_country: details.preferred_country,
//                     job_role: details.job_role,
//                     expected_salary: details.expected_salary,
//                     address: details.address,
//                     city: details.city,
//                     state: details.state,
//                     country: details.country,
//                     status: 'NEW',
//                     created_at: new Date(),
//                     lead_source: details.lead_source || 'Unknown',
//                     events:details.events || [],
//                 });
//                 if (result.acknowledged) {
//                     return resolve(result.insertedId);
//                 } else {
//                     reject("Insert failed");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error processing request");
//             }
//         });
    
// },
// }

//sucessful
// module.exports = {
//  fetchFormsAndLeadsInsert :async () => {
//   const collection = db.get().collection(COLLECTION.LEADS);
//   await collection.createIndex({ leadId: 1 }, { unique: true });
//   const summary = [];
//   // Fetch forms
//   console.log(`Fetching leadgen forms for page ID: ${PAGE_ID}`);
//   const formRes = await axios.get(`${GRAPH_API_BASE}/${PAGE_ID}/leadgen_forms`, {
//     params: { access_token: ACCESS_TOKEN },
//   });

//   const forms = formRes.data.data;

//   for (const form of forms) {
//     const formId = form.id;
//     const formName = form.name;

//     // Fetch leads for the form
//     const leadRes = await axios.get(`${GRAPH_API_BASE}/${formId}/leads`, {
//       params: { access_token: ACCESS_TOKEN },
//     });

//     const leads = leadRes.data.data;

//     let inserted = 0;
//     let skipped = 0;

//     for (const lead of leads) {
//       const exists = await collection.findOne({ leadId: lead.id });
//       if (exists) {
//         skipped++;
//         continue;
//       }

//       const formattedLead = {
//         leadId: lead.id,
//         formId,
//         createdAt: new Date(lead.created_time),
//         fields: Object.fromEntries(
//           lead.field_data.map(f => [f.name, f.values[0]])
//         ),
//       };

//       await collection.insertOne(formattedLead);
//       inserted++;
//     }

//     summary.push({
//       formId,
//       formName,
//       totalFetched: leads.length,
//       inserted,
//       skipped,
//     });
//   }

//   return summary;
//   },






// const axios = require('axios');
//  require('dotenv').config();
// // Replace with your actual credentials
//  const { ACCESS_TOKEN,AD_ACCOUNT_ID } = process.env;

// const CAMPAIGN_ID = '120225881007390451';

// // async function getAllCampaigns(adAccountId, accessToken) {
// //   try {
// //     const campaigns = [];

// //     let url = `https://graph.facebook.com/v19.0/${adAccountId}/campaigns`;
// //     let params = {
// //       access_token: accessToken,
// //       fields: 'id,name,status',
// //       limit: 100 // optional, default is 25
// //     };

// //     // Handle pagination if there are more than 100 campaigns
// //     while (url) {
// //       const response = await axios.get(url, { params });
// //       const data = response.data;

// //       if (data.data && data.data.length > 0) {
// //         campaigns.push(...data.data);
// //       }

// //       // Check if there's a next page
// //       url = data.paging?.next || null;

// //       // Clear params for the next page (URL already includes them)
// //       params = {};
// //     }

// //     return campaigns;
// //   } catch (error) {
// //     console.error('Error fetching campaigns:', error.response?.data || error.message);
// //     throw error;
// //   }
// // }

// // // Example usage
// // getAllCampaigns(AD_ACCOUNT_ID, ACCESS_TOKEN)
// //   .then(campaigns => {
// //     console.log('Fetched campaigns:');
// //     campaigns.forEach(c => console.log(`ID: ${c.id}, Name: ${c.name}, Status: ${c.status}`));
// //   })
// //   .catch(console.error);

// getLeadsFromCampaign(CAMPAIGN_ID, ACCESS_TOKEN)
//   .then(leads => {
//     console.log('Fetched leads:', leads);
//   })
//   .catch(console.error);

// async function getLeadsFromCampaign(campaignId, accessToken) {
//   try {
//     // Step 1: Get Ad Sets in the campaign
//     const adSetsRes = await axios.get(
//       `https://graph.facebook.com/v19.0/${campaignId}/adsets`,
//       {
//         params: { access_token: accessToken }
//       }
//     );
//     const adSets = adSetsRes.data.data;

//     let allLeads = [];

//     for (const adSet of adSets) {
//       // Step 2: Get ads under each ad set
//       const adsRes = await axios.get(
//         `https://graph.facebook.com/v19.0/${adSet.id}/ads`,
//         {
//           params: { access_token: accessToken }
//         }
//       );
// console.log(adsRes.data);
//       const ads = adsRes.data.data;

//       for (const ad of ads) {
//         // Step 3: Get ad creative to find form ID
//         const creativeRes = await axios.get(
//           `https://graph.facebook.com/v19.0/${ad.id}?fields=creative`,
//           {
//             params: { access_token: accessToken }
//           }
//         );console.log(creativeRes.data.creative.id);

//         const creativeId = creativeRes.data.creative.id;

//         const creativeDetailsRes = await axios.get(
//           `https://graph.facebook.com/v19.0/${creativeId}?fields=object_story_spec`,
//           {
//             params: { access_token: accessToken }
//           }
//         );
// console.log(creativeDetailsRes.data);

//         const formId =
//           creativeDetailsRes.data?.object_story_spec?.lead_gen_form_id;
//         if (formId) {
//           // Step 4: Get leads from the form
//           const leadsRes = await axios.get(
//             `https://graph.facebook.com/v19.0/${formId}/leads`,
//             {
//               params: { access_token: accessToken }
//             }
//           );

//           allLeads.push(...leadsRes.data.data);
//         }
//       }
//     }

//     return allLeads;
//   } catch (error) {
//     console.error('Error fetching Meta leads:', error.response?.data || error.message);
//     throw error;
//   }
// }

// // Usage example




// // require('dotenv').config();
// // const axios = require('axios');
// // const express = require('express');
// // const router = express.Router();

// // const { ACCESS_TOKEN, AD_ACCOUNT_ID } = process.env;

// // // Enhanced request helper with error handling
// // async function makeFacebookRequest(url, params) {
// //   try {
// //     const response = await axios.get(url, {
// //       params: { ...params, access_token: ACCESS_TOKEN }
// //     });
// //     return response.data.data || [];
// //   } catch (error) {
// //     console.error(`Facebook API request failed for ${url}:`, error.response?.data?.error?.message || error.message);
// //     return [];
// //   }
// // }

// // // Helper to get all campaigns
// // async function getCampaigns() {
// //   const url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/campaigns`;
// //   return makeFacebookRequest(url, {
// //     fields: 'id,name,status,objective,created_time,start_time,stop_time'
// //   });
// // }

// // // Helper to get all adsets for a campaign
// // async function getAdSets(campaignId) {
// //   const url = `https://graph.facebook.com/v19.0/${campaignId}/adsets`;
// //   return makeFacebookRequest(url, {
// //     fields: 'id,name,status,daily_budget,lifetime_budget,start_time,end_time,targeting'
// //   });
// // }

// // // Helper to get all ads for an adset
// // async function getAds(adSetId) {
// //   const url = `https://graph.facebook.com/v19.0/${adSetId}/ads`;
// //   return makeFacebookRequest(url, {
// //     fields: 'id,name,status,created_time,adset_id,ad_review_feedback'
// //   });
// // }

// // // Helper to get ad creatives for an ad
// // async function getAdCreatives(adId) {
// //   const url = `https://graph.facebook.com/v19.0/${adId}/adcreatives`;
// //   return makeFacebookRequest(url, {
// //     fields: 'id,name,object_story_spec,effective_object_story_id'
// //   });
// // }

// // // Helper to get leads for a form with pagination support
// // async function getLeads(formId) {
// //   const url = `https://graph.facebook.com/v19.0/${formId}/leads`;
// //   return makeFacebookRequest(url, {
// //     fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name',
// //     limit: 100
// //   });
// // }

// // // Main function to fetch all leads for all campaigns
// // async function fetchFacebookLeads() {
// //   try {
// //     console.log('Starting Facebook leads fetch process...');
// //     const campaigns = await getCampaigns();
// //     console.log(`Found ${campaigns.length} campaigns.`);

// //     const allLeads = [];
// //     const processedForms = new Set(); // To avoid duplicate form processing

// //     for (const campaign of campaigns) {
// //       if (campaign.status !== 'ACTIVE') {
// //         console.log(`Skipping inactive campaign ${campaign.id} (${campaign.name})`);
// //         continue;
// //       }

// //       const adSets = await getAdSets(campaign.id);
// //       console.log(`Found ${adSets.length} adsets for campaign ${campaign.id}.`);

// //       for (const adSet of adSets) {
// //         const ads = await getAds(adSet.id);
// //         console.log(`Found ${ads.length} ads for adset ${adSet.id}.`);

// //         for (const ad of ads) {
// //           const creatives = await getAdCreatives(ad.id);
// //           console.log(`Found ${creatives.length} creatives for ad ${ad.id}.`);

// //           for (const creative of creatives) {
// //             const formId = extractFormId(creative);
// //             if (!formId) continue;
            
// //             if (processedForms.has(formId)) {
// //               console.log(`Already processed leads for form ${formId}`);
// //               continue;
// //             }
// //             processedForms.add(formId);

// //             try {
// //               const leads = await getLeads(formId);
// //               console.log(`Found ${leads.length} leads for form ${formId}`);

// //               leads.forEach(lead => {
// //                 const leadData = {
// //                   campaign: {
// //                     id: campaign.id,
// //                     name: campaign.name,
// //                     status: campaign.status,
// //                     objective: campaign.objective
// //                   },
// //                   adset: {
// //                     id: adSet.id,
// //                     name: adSet.name,
// //                     budget: adSet.daily_budget || adSet.lifetime_budget
// //                   },
// //                   ad: {
// //                     id: ad.id,
// //                     name: ad.name,
// //                     status: ad.status
// //                   },
// //                   lead: {
// //                     id: lead.id,
// //                     created_time: lead.created_time,
// //                     form_id: formId,
// //                     fields: extractLeadFields(lead.field_data)
// //                   }
// //                 };
// //                 allLeads.push(leadData);
// //               });
// //             } catch (err) {
// //               console.error(`Error processing form ${formId}:`, err.message);
// //             }
// //           }
// //         }
// //       }
// //     }

// //     console.log('Facebook leads fetch completed. Total leads:', allLeads.length);
// //     return {
// //       success: true,
// //       count: allLeads.length,
// //       campaigns_processed: campaigns.length,
// //       leads: allLeads,
// //       timestamp: new Date().toISOString()
// //     };
// //   } catch (err) {
// //     console.error('Critical error in fetchFacebookLeads:', err);
// //     return {
// //       success: false,
// //       error: err.message,
// //       leads: []
// //     };
// //   }
// // }

// // // Helper to extract form ID from creative
// // function extractFormId(creative) {
// //   if (!creative.object_story_spec) return null;
  
// //   // Check for lead gen form ID in different possible locations
// //   return creative.object_story_spec.lead_gen_form_id || 
// //          creative.object_story_spec?.page_id || // Sometimes form ID is the page ID
// //          creative.object_story_spec?.lead_gen_appointment_settings?.form_id ||
// //          creative.effective_object_story_id; // Fallback
// // }

// // // Helper to transform lead fields into a more usable format
// // function extractLeadFields(fieldData) {
// //   if (!fieldData) return {};
  
// //   const fields = {};
// //   fieldData.forEach(field => {
// //     fields[field.name] = field.values.length > 1 ? field.values : field.values[0];
// //   });
// //   return fields;
// // }

// // // Express route to get leads
// // router.get('/facebook-leads', async (req, res) => {
// //   try {
// //     console.log('Received request for Facebook leads');
// //     const result = await fetchFacebookLeads();
    
// //     if (!result.success) {
// //       return res.status(500).json(result);
// //     }
    
// //     res.json({
// //       status: 'success',
// //       data: result
// //     });
// //   } catch (error) {
// //     console.error('Route handler error:', error);
// //     res.status(500).json({
// //       status: 'error',
// //       message: 'Failed to fetch Facebook leads',
// //       error: error.message
// //     });
// //   }
// // });

// // // Express setup


// // const app = express();
// // const PORT = process.env.PORT || 3000;

// // app.use(express.json());
// // app.use('/api', router);

// // // Error handling middleware
// // app.use((err, req, res, next) => {
// //   console.error('Application error:', err);
// //   res.status(500).json({ error: 'Internal server error' });
// // });

// // app.listen(PORT, () => {
// //   console.log(`Server is running on port ${PORT}`);
// // });

// // module.exports = {
// //   fetchFacebookLeads,
// //   facebookLeadsRouter: router,
// //   extractFormId,
// //   extractLeadFields
// // };





// // Example usage:
// // (async () => {
// //   const leads = await fetchFacebookLeads();
// //   console.log(JSON.stringify(leads, null, 2));
// // })();



// // const express = require('express');
// // const axios = require('axios');
// // require('dotenv').config();

// // const app = express();
// // const PORT = 3000;

// // const ACCESS_TOKEN ="EAADnxq3QNZAwBO5uOWsAsr7WYv3ZAZB4fh210fJiYslS802i3Aa7GoM4eXKLxKdXYeC6IQVMFOVZCn2xq098a2amilO1rrFUXx1Fwjs93inCIZAZC5PqIJRg9IVNDbgT3Xi8yx513ESLZBBZAIdIJCjUMFV1FTqJ2QPMBqbM8ZAX1W3ZB4zCF8yuxOOYIZCfNkNwPLY4gP4M1ZCihkwZD";
// // const AD_ACCOUNT_ID = "act_465563180749409";

// // // Get all campaigns
// // app.get('/campaigns-with-leads', async (req, res) => {
// //   try {
// //     // Step 1: Get campaigns
// //     const campaignRes = await axios.get(`https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/campaigns`, {
// //       params: {
// //         access_token: ACCESS_TOKEN,
// //         fields: 'id,name,status',
// //       },
// //     });
// //     console.log(campaignRes.data);
// //     const campaigns = campaignRes.data.data;

// //     const result = [];

// //     // Step 2: For each campaign, get attached lead forms and leads
// //     for (const campaign of campaigns) {
// //       const campaignData = {
// //         id: campaign.id,
// //         name: campaign.name,
// //         status: campaign.status,
// //         leads: [],
// //       };

// //       try {
// //         // Step 2a: Get ad sets
// //         const adSetsRes = await axios.get(`https://graph.facebook.com/v19.0/${campaign.id}/adsets`, {
// //           params: { access_token: ACCESS_TOKEN, fields: 'id,name' },
// //         });

// //         const adSets = adSetsRes.data.data;

// //         for (const adSet of adSets) {
// //           // Step 2b: Get ads in adset
// //           const adsRes = await axios.get(`https://graph.facebook.com/v19.0/${adSet.id}/ads`, {
// //             params: { access_token: ACCESS_TOKEN, fields: 'id,name' },
// //           });

// //           const ads = adsRes.data.data;

// //           for (const ad of ads) {
// //             // Step 2c: Get creative to extract form_id (if it's a lead ad)
// //             const creativeRes = await axios.get(`https://graph.facebook.com/v19.0/${ad.id}/adcreatives`, {
// //               params: { access_token: ACCESS_TOKEN, fields: 'object_story_spec' },
// //             });

// //             const creatives = creativeRes.data.data;

// //             for (const creative of creatives) {
// //               const formId =
// //                 creative?.object_story_spec?.lead_gen_appointment_settings?.form_id ||
// //                 creative?.object_story_spec?.lead_gen_form_id;

// //               if (!formId) continue;

// //               // Step 3: Get leads for this form
// //               const leadsRes = await axios.get(`https://graph.facebook.com/v19.0/${formId}/leads`, {
// //                 params: { access_token: ACCESS_TOKEN },
// //               });

// //               const leads = leadsRes.data.data;

// //               for (const lead of leads) {
// //                 const leadDetails = {
// //                   id: lead.id,
// //                   created_time: lead.created_time,
// //                 };

// //                 lead.field_data.forEach((field) => {
// //                   leadDetails[field.name] = field.values[0];
// //                 });

// //                 campaignData.leads.push(leadDetails);
// //               }
// //             }
// //           }
// //         }
// //       } catch (innerError) {
// //         console.error(`Error getting leads for campaign ${campaign.id}:`, innerError.response?.data || innerError.message);
// //       }

// //       result.push(campaignData);
// //     }

// //     res.json(result);
// //   } catch (error) {
// //     console.error('Error fetching campaigns:', error.response?.data || error.message);
// //     res.status(500).json({ error: 'Failed to fetch campaign data' });
// //   }
// // });

// // app.listen(PORT, () => {
// //   console.log(`Server running at http://localhost:${PORT}`);
// // });








// // const axios = require('axios');
// // const fs = require('fs');

// // class MetaAdReports {
// //     constructor(accessToken, apiVersion = 'v18.0') {
// //         this.accessToken = accessToken;
// //         this.apiVersion = apiVersion;
// //         this.baseUrl = `https://graph.facebook.com/${apiVersion}`;
// //     }

// //     // Get all ad accounts
// //     async getAdAccounts() {
// //         try {
// //             const response = await axios.get(`${this.baseUrl}/me/adaccounts`, {
// //                 params: {
// //                     access_token: this.accessToken,
// //                     fields: 'id,name,account_status,currency,timezone_name'
// //                 }
// //             });
// //             return response.data;
// //         } catch (error) {
// //             throw new Error(`Error fetching ad accounts: ${error.response?.data?.error?.message || error.message}`);
// //         }
// //     }

// //     // Get campaigns for an ad account
// //     async getCampaigns(adAccountId, options = {}) {
// //         try {
// //             const params = {
// //                 access_token: this.accessToken,
// //                 fields: options.fields || 'id,name,status,objective,created_time,updated_time',
// //                 limit: options.limit || 25
// //             };

// //             if (options.status) {
// //                 params.filtering = JSON.stringify([{
// //                     field: 'delivery_info.delivery_status',
// //                     operator: 'IN',
// //                     value: Array.isArray(options.status) ? options.status : [options.status]
// //                 }]);
// //             }

// //             const response = await axios.get(`${this.baseUrl}/${adAccountId}/campaigns`, {
// //                 params
// //             });
// //             return response.data;
// //         } catch (error) {
// //             throw new Error(`Error fetching campaigns: ${error.response?.data?.error?.message || error.message}`);
// //         }
// //     }

// //     // Get insights/reports for campaigns
// //     async getCampaignInsights(adAccountId, options = {}) {
// //         try {
// //             const {
// //                 dateRange = { since: '2024-01-01', until: '2024-12-31' },
// //                 metrics = ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpp', 'reach'],
// //                 breakdown = null,
// //                 level = 'campaign'
// //             } = options;

// //             const params = {
// //                 access_token: this.accessToken,
// //                 level,
// //                 fields: metrics.join(','),
// //                 time_range: JSON.stringify(dateRange),
// //                 limit: 100
// //             };

// //             if (breakdown) {
// //                 params.breakdowns = Array.isArray(breakdown) ? breakdown.join(',') : breakdown;
// //             }

// //             const response = await axios.get(`${this.baseUrl}/${adAccountId}/insights`, {
// //                 params
// //             });
// //             return response.data;
// //         } catch (error) {
// //             throw new Error(`Error fetching insights: ${error.response?.data?.error?.message || error.message}`);
// //         }
// //     }

// //     // Get ad set insights
// //     async getAdSetInsights(adAccountId, options = {}) {
// //         const adSetOptions = { ...options, level: 'adset' };
// //         return this.getCampaignInsights(adAccountId, adSetOptions);
// //     }

// //     // Get ad level insights
// //     async getAdInsights(adAccountId, options = {}) {
// //         const adOptions = { ...options, level: 'ad' };
// //         return this.getCampaignInsights(adAccountId, adOptions);
// //     }

// //     // Get detailed report with multiple metrics
// //     async getDetailedReport(adAccountId, options = {}) {
// //         try {
// //             const {
// //                 dateRange = { since: '2024-01-01', until: '2024-12-31' },
// //                 level = 'campaign'
// //             } = options;

// //             const comprehensiveMetrics = [
// //                 'impressions',
// //                 'clicks',
// //                 'spend',
// //                 'reach',
// //                 'frequency',
// //                 'ctr',
// //                 'cpc',
// //                 'cpp',
// //                 'cost_per_inline_link_click',
// //                 'inline_link_clicks',
// //                 'inline_link_click_ctr',
// //                 'actions',
// //                 'conversions',
// //                 'conversion_values',
// //                 'cost_per_action_type',
// //                 'video_views',
// //                 'video_view_rate',
// //                 'quality_ranking',
// //                 'engagement_rate_ranking',
// //                 'conversion_rate_ranking'
// //             ];

// //             const params = {
// //                 access_token: this.accessToken,
// //                 level,
// //                 fields: comprehensiveMetrics.join(','),
// //                 time_range: JSON.stringify(dateRange),
// //                 limit: 100,
// //                 breakdowns: 'age,gender,country'
// //             };

// //             const response = await axios.get(`${this.baseUrl}/${adAccountId}/insights`, {
// //                 params
// //             });
// //             return response.data;
// //         } catch (error) {
// //             throw new Error(`Error fetching detailed report: ${error.response?.data?.error?.message || error.message}`);
// //         }
// //     }

// //     // Export report to CSV
// //     async exportToCSV(data, filename = 'meta_ad_report.csv') {
// //         try {
// //             if (!data || !data.data || data.data.length === 0) {
// //                 throw new Error('No data to export');
// //             }

// //             const csvHeader = Object.keys(data.data[0]).join(',') + '\n';
// //             const csvRows = data.data.map(row => {
// //                 return Object.values(row).map(value => {
// //                     if (typeof value === 'object' && value !== null) {
// //                         return JSON.stringify(value);
// //                     }
// //                     return value;
// //                 }).join(',');
// //             }).join('\n');

// //             const csvContent = csvHeader + csvRows;
// //             fs.writeFileSync(filename, csvContent);
// //             console.log(`Report exported to ${filename}`);
// //             return filename;
// //         } catch (error) {
// //             throw new Error(`Error exporting to CSV: ${error.message}`);
// //         }
// //     }

// //     // Get performance summary
// //     async getPerformanceSummary(adAccountId, dateRange) {
// //         try {
// //             const insights = await this.getCampaignInsights(adAccountId, {
// //                 dateRange,
// //                 metrics: ['impressions', 'clicks', 'spend', 'reach', 'ctr', 'cpc']
// //             });

// //             const summary = {
// //                 totalImpressions: 0,
// //                 totalClicks: 0,
// //                 totalSpend: 0,
// //                 totalReach: 0,
// //                 averageCTR: 0,
// //                 averageCPC: 0,
// //                 campaignCount: insights.data.length
// //             };

// //             insights.data.forEach(campaign => {
// //                 summary.totalImpressions += parseInt(campaign.impressions || 0);
// //                 summary.totalClicks += parseInt(campaign.clicks || 0);
// //                 summary.totalSpend += parseFloat(campaign.spend || 0);
// //                 summary.totalReach += parseInt(campaign.reach || 0);
// //             });

// //             if (summary.totalImpressions > 0) {
// //                 summary.averageCTR = (summary.totalClicks / summary.totalImpressions * 100).toFixed(2);
// //             }
// //             if (summary.totalClicks > 0) {
// //                 summary.averageCPC = (summary.totalSpend / summary.totalClicks).toFixed(2);
// //             }

// //             return summary;
// //         } catch (error) {
// //             throw new Error(`Error getting performance summary: ${error.message}`);
// //         }
// //     }
// // }

// // // Usage example
// // async function main() {
// //     // Initialize with your access token
// //     const accessToken = 'YOUR_ACCESS_TOKEN_HERE';
// //     const metaReports = new MetaAdReports(accessToken);

// //     try {
// //         // Get ad accounts
// //         console.log('Fetching ad accounts...');
// //         const accounts = await metaReports.getAdAccounts();
// //         console.log('Ad Accounts:', accounts.data);

// //         if (accounts.data.length > 0) {
// //             const adAccountId = accounts.data[0].id;
// //             console.log(`\nUsing Ad Account: ${adAccountId}`);

// //             // Get campaigns
// //             console.log('\nFetching campaigns...');
// //             const campaigns = await metaReports.getCampaigns(adAccountId);
// //             console.log('Campaigns:', campaigns.data);

// //             // Get campaign insights
// //             console.log('\nFetching campaign insights...');
// //             const insights = await metaReports.getCampaignInsights(adAccountId, {
// //                 dateRange: { since: '2024-01-01', until: '2024-12-31' },
// //                 metrics: ['impressions', 'clicks', 'spend', 'ctr', 'cpc']
// //             });
// //             console.log('Campaign Insights:', insights.data);

// //             // Get performance summary
// //             console.log('\nGetting performance summary...');
// //             const summary = await metaReports.getPerformanceSummary(adAccountId, {
// //                 since: '2024-01-01',
// //                 until: '2024-12-31'
// //             });
// //             console.log('Performance Summary:', summary);

// //             // Export to CSV
// //             console.log('\nExporting to CSV...');
// //             await metaReports.exportToCSV(insights, 'campaign_insights.csv');

// //         }
// //     } catch (error) {
// //         console.error('Error:', error.message);
// //     }
// // }

// // // Package.json dependencies needed:
// // /*
// // {
// //   "dependencies": {
// //     "axios": "^1.6.0"
// //   }
// // }
// // */

// // module.exports = MetaAdReports;

// // // Uncomment to run the example
// // // main();