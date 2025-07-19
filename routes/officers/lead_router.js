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

app.patch("/updateLead/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.editLead(req.params.id, req.body)
  );
});
app.get("/getAllLeads", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.getAllLeads()
  );
});
app.get("/getAllDeadLeads", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.getDeadLeads()
  );
});

app.get("/metaLead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    metalead.fetchFormsAndLeadsInsert()
  );
});
app.patch("/restoreClientFromDead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.restoreClientFromDeadAndAssignOfficer(req.body.clientId, req.body.officerId, req.body.comment)
  );
});

app.get("/getAllFilterdLeads", middleware.checkToken, async (req, res) => {
    return response.handle(res, () =>   leadHelper.getFilteredLeads(req.query, req.decoded));
});



app.get("/getAllTodaysFilterdLeads", middleware.checkToken, async (req, res) => {
    return response.handle(res, () =>   leadHelper.getFilteredTodaysLeads(req.query, req.decoded));
});


module.exports = app;