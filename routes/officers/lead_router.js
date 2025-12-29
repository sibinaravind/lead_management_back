const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let leadHelper=require('../../helpers/lead_helper');
let metalead=require('../../helpers/meta_lead_helper');
const response = require("../../utils/responseManager");
app.post("/insertLead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.createLead(req.body)
  );
});
app.post("/updateClientRequiredDocuments/:id", middleware.checkToken, async (req, res) => {
  try {
    const result = await response.handle(res, () =>
      leadHelper.uploadClientDocument(req.params.id, req.body)
    );
    return result;
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});
app.post("/bulkInsertLeads", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.bulkInsertLeads(req.body.data, req.body.roundrobin, req.body.officers)
  );
});
app.patch("/updateLead/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.editLead(req.params.id, req.body)
  );
});
app.patch("/updateLeadStatus/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.updateLeadStatus(req.params.id, req.body ,req.decoded._id)
  );
});
app.get("/getAllLeads", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.getAllLeads()
  );
});

app.patch("/addProductInterested/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.addProductInterested(req.params.id, req.body,req.decoded._id)
  );
});

app.patch("/assign_officer", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.assignOfficerToLead(req.body.client_id, req.body.officer_id,req.body.comment)
  );
});

app.get("/metaLead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    metalead.fetchFormsAndLeadsInsert()
  );
});

app.get("/getLead/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.getLeadDetails(req.params.id)
  );
});

app.get("/search/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.searchLead(req.params.id)
  );
});


app.get("/interactions/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.getLeadInteraction(req.params.id)
  );
});



// app.get("/getAllFilterdLeads", middleware.checkToken, async (req, res) => {
//   if (req.query.filterCategory == 'HISTORY') {
//       return response.handle(res, () =>   leadHelper.getCallHistoryWithFilters(req.query, req.decoded));
//   }
//   else
//   {
//     return response.handle(res, () =>   leadHelper.getFilteredLeads(req.query, req.decoded));
//   }
// });

app.get("/getAllFilterdLeads", middleware.checkToken, async (req, res) => {
    return response.handle(res, () =>   leadHelper.getFilteredLeads(req.query, req.decoded));
  
});

app.get("/getCallFilteredHistory", middleware.checkToken, async (req, res) => {
      return response.handle(res, () =>   leadHelper.getCallHistoryWithFilters(req.query, req.decoded));
});

app.get("/getLeadCount", middleware.checkToken, async (req, res) => {
      return response.handle(res, () =>   leadHelper.getLeadCountByCategory(req.decoded, req.query));
});

app.get("/getFilteredDeadLeads", middleware.checkToken, async (req, res) => {
      return response.handle(res, () =>   leadHelper.getFilteredDeadLeads( req.query, req.decoded,));
});





module.exports = app;