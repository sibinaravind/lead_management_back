
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let configHelper=require('../../helpers/config_helper');
const response = require("../../utils/responseManager");

app.get("/list", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    configHelper.configList()
  );
});
app.patch("/edit_configList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    configHelper.editConfig(req.body)
  );
});


app.get("/access_permission", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    configHelper.accessPermissionList()
  );
});
app.patch("/edit_accessList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    configHelper.editAccessPermission(req.body)
  );
});


app.patch("/upload_media/:_id", (req, res) => {
  return response.handle(res, () =>
    freshFoodHelper.uploadFreshFoodImage(req.files.media, req.params._id)
  );
});

module.exports = app;