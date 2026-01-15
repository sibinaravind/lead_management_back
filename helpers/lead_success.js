const express = require('express');
const axios = require('axios');

const app = express();
const port = 3000;

// === CONFIGURATION ===
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

const PAGE_ID = '100464991488860'; // 🔁 Replace with your Page ID

async function fetchLeadForms(pageId) {
  
  const res = await axios.get(`${GRAPH_API_BASE}/${pageId}/leadgen_forms`, {
    params: { access_token: ACCESS_TOKEN },
  });
  return res.data.data;
}

async function fetchLeads(formId) {
  const res = await axios.get(`${GRAPH_API_BASE}/${formId}/leads`, {
    params: { access_token: ACCESS_TOKEN },
  });
  return res.data.data;
}

// === MAIN ENDPOINT ===
app.get('/', async (req, res) => {
  try {
    const results = [];

    const pageData = {
      pageId: PAGE_ID,
      pageName: 'My Page', // Optional static label
      forms: [],
    };

    const forms = await fetchLeadForms(PAGE_ID);

    for (const form of forms) {
      const leads = await fetchLeads(form.id);
      pageData.forms.push({
        formId: form.id,
        formName: form.name,
        leads,
      });
    }

    results.push(pageData);

    // return JSON to browser
    res.json({ success: true, data: results });
  } catch (error) {
    // console.error('❌ Error:', error.response?.data || error.message);
    // res.status(500).json({
    //   success: false,
    //   error: error.response?.data || error.message,
    // });
      throw new Error( error.response?.data || error.message );
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
