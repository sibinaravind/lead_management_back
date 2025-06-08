const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let customerHelper=require('../../helpers/customer_helper');
const response = require("../../utils/responseManager");

app.post("/insertCustomer", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.createCustomer(req.body)
  );
});
module.exports = app;