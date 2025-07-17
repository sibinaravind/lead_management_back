const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let leadHelper=require('../../helpers/customer_interaction_helper');
const response = require("../../utils/responseManager");

app.post("/logCallEvent", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    leadHelper.logCallEvent(req.body ,req.decoded._id)
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