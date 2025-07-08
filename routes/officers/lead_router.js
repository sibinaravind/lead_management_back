const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let leadHelper=require('../../helpers/lead_helper');
const response = require("../../utils/responseManager");

app.post("/insertLead", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.createLead(req.body)
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
module.exports = app;