
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let officersHelper=require('../../helpers/officers_helper')
const response = require("../../utils/responseManager");

app.post("/insert", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.createOfficer(req.body)
  );
});

app.patch("/updateOfficer/:id", (req, res) => {
  return response.handle(res, () =>
    officersHelper.editOfficer(req.params.id,req.body)
  );
});
app.get("/list", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.listOfficers()
  );
});  
app.post("/login", (req, res) => {
  return response.handle(res, () =>
    officersHelper.loginOfficer(req.body.officer_id, req.body.password)
  );
});    
app.patch("/resetPassword/:id", (req, res) => {
  return response.handle(res, () =>
    officersHelper.updateOfficerPassword(req.params.id,req.body)
  );
});  

app.delete("/delete/:id", (req, res) => {
  return response.handle(res, () =>
    officersHelper.deleteOfficer(req.params.id)
  );
});  

app.get("/listLeadOfficers", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.listLeadOfficers()
  );
});  
app.patch("/addOfficerToLead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.addOfficerUnderOfficer(
      req.body.lead_officer_id,
      req.body.officer_id
    )
  );
});  
app.patch("/deleteOfficerFromLead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.removeOfficerUnderOfficer(
      req.body.lead_officer_id,
      req.body.officer_id
    )
  );
});  


module.exports = app;
