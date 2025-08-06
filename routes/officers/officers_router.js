
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
      req.body
    )
  );
});  
app.patch("/editOfficerToLead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.editOfficerLeadPermission(
      req.body
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

// app.patch("/deleteOfficerFromLead", middleware.checkToken, (req, res) => {
//   return response.handle(res, () =>
//     officersHelper.deleteOfficerUnderOfficer(
//       req.body.lead_officer_id,
//       req.body.officer_id
//     )
//   );
// });  

app.post("/insertRoundRobin", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.insertRoundRobin(
      req.body
    )
  );
});  
app.get("/listRoundRobin", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.listAllRoundRobin()
  );
});
app.patch("/insertStaffToRoundRobin", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.insertStaffToRoundRobin(
      req.body
    )
  );
});  
app.patch("/removeStaffFromRoundRobin", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.removeStaffFromRoundRobin(
      req.body
    )
  );
});  
app.delete("/deleteRoundRobin/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.deleteRoundRobin(
      req.params.id
    )
  );
}); 

module.exports = app;
