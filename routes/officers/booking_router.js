
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let bookinghelper=require('../../helpers/booking_helper');
const response = require("../../utils/responseManager");

app.post("/bookingCreate", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.createBooking(req.body)
  );
});

app.patch("/productUpdate/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.editProduct(req.params._id, req.body)
  );
  
});
app.get("/productList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.getProductList()
  );
});

app.get("/productDetails/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.getProductDetails(req.params._id)
  );
});

app.get("/getProductIntrested/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.getProductIntrested(req.params._id)
  );
});

app.post("/addDiscount", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.addDiscount( req.body)
  );
});
app.patch("/editDiscount/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.editDiscount(req.params._id, req.body)
  );
});

app.delete("/deleteDiscount/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.deleteDiscount(req.params._id)
  );
});



module.exports = app;