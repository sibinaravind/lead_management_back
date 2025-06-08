
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
app.patch("/updatePassword/:id", (req, res) => {
  return response.handle(res, () =>
    officersHelper.updateOfficerPassword(req.params.id,req.body)
  );
});
app.patch("/updateStatus/:id", (req, res) => {
  return response.handle(res, () =>
    officersHelper.updateOfficerStatus(req.params.id,req.body.status)
  );
});
app.get("/list", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.listOfficers()
  );
});   
  app.get("/details/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    officersHelper.getOfficer(req.params.id)
  );
});


module.exports = app;
