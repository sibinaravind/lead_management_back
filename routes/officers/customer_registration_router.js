const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let customerHelper=require('../../helpers/customer_registeration_helper');
const response = require("../../utils/responseManager");

app.get("/incompleteList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.getRegisterdCustomers(req.params.id)
  );
});


module.exports = app;