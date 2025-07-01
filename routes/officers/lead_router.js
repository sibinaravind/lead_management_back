
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let leadHelper=require('../../helpers/lead_helper');
const response = require("../../utils/responseManager");

app.get("/get", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.fetchFormsAndLeadsInsert()
  );
});

module.exports = app;