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
app.patch("/update_basic_info/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.updateCustomerBasicInfo(req.params.id, req.body)
  );
});
app.post("/update_academic_records/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.updateCustomerAcademicRecords(req.params.id, req.body)
  );
});

app.post("/update_exam_records/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.updateCustomerExamRecords(req.params.id, req.body)
  );
});


app.post("/travel_history_records/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.updateCustomerTravelHistoryRecords(req.params.id, req.body)
  );
});

app.post("/work_history_records/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.updateCustomerWorkHistoryRecords(req.params.id, req.body)
  );
});

app.post("/setRequiredDocuments/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    customerHelper.updateClientRequiredDocuments(req.params.id, req.body)
  );
});
app.post("/updateClientRequiredDocuments/:id", middleware.checkToken, async (req, res) => {
  try {
    console.log("Updating client required documents");
    const result = await response.handle(res, () =>
      customerHelper.uploadClientDocument(req.params.id, req.body)
    );
    return result;
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});



module.exports = app;