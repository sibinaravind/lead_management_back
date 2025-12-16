
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let producthelper=require('../../helpers/product_helper');
const response = require("../../utils/responseManager");

app.post("/productCreate", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.createProduct(req.body)
  );
});

app.patch("/productUpdate/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    producthelper.editProduct(req.params._id, req.body)
  );
  
});

app.post("/addProductImage/:id", middleware.checkToken, async (req, res) => {
  try {
    const result = await response.handle(res, () =>
      producthelper.addProductImage(req.params.id, req.body)
    );
    return result;
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
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