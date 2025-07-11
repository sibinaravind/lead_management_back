
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

app.post("/insert_accesspermission", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    configHelper.insertAccessPermissionList(req.body)
  );
});
app.delete("/delete_accesspermission", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    configHelper.deleteAccessPermission(req.body.category)
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

module.exports = app;