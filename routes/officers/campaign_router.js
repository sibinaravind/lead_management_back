
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let campaginHelper=require('../../helpers/campagin_helper');
const response = require("../../utils/responseManager");

app.get("/list", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    campaginHelper.getCampaignsList()
  );
});
app.post("/insert", middleware.checkToken, (req, res) => {
  console.log(req.body);
  return response.handle(res, () =>
    campaginHelper.createCampaign(req.body.title, req.body.startDate, req.body.doc_file)
  );
});
app.delete("/delete/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    campaginHelper.deleteCampaign( req.params.id)
  );
});




module.exports = app;