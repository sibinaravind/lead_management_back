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
app.get("/metaLead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    metalead.fetchFormsAndLeadsInsert()
  );
});
app.patch("/assign_officer", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.assignOfficerToLead(req.body.clientId, req.body.officerId)
  );
});
app.post("/logCallEvent", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.logCallEvent(req.body, req.decoded._id)
  );
});
app.patch("/updateCustomerStatus", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.updateCustomerStatus(req.body, req.decoded._id)
  );
});
app.patch("/updateCustomer/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.updateLead(req.params.id, req.body)
  );
});
app.patch("/restoreClientFromDead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.restoreClientFromDeadAndAssignOfficer(req.body.clientId, req.body.officerId, req.body.comment)
  );
});
app.get("/getCustomer/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.getClient(req.params.id)
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

app.post("/add_mobile_call_log", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.logMobileCallEvent(req.body)
  );
});
app.get("/get_call_log", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.getCallLogs()
  );
});
module.exports = app;