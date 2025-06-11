
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let leadHelper=require('../../helpers/lead_helper');
const response = require("../../utils/responseManager");
const e = require("express");

app.post("/insert", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.getAllCampaigns()
  );
});

module.exports = app;