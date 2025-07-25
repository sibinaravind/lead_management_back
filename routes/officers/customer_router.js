const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let customerHelper=require('../../helpers/customer_helper');
const response = require("../../utils/responseManager");

app.get("/getCustomer/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.getCustomer(req.params.id)
  );
});

app.get("/search/:query", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.searchCustomer(req.params.query)
  );
});
app.patch("/assign_officer", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.assignOfficerToLead(req.body.clientId, req.body.officerId,req.body.comment, req.decoded._id)
  );
});

app.patch("/updateCustomerStatus", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.updateCustomerStatus(req.body, req.decoded._id)
  );
});

app.get("/getCustomerInteraction/:_id", middleware.checkToken, (req, res) => {
      return response.handle(res, () =>
        customerHelper.getCustomerInteraction(req.params._id)
  );
});




module.exports = app;