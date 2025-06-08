
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let projecthelper=require('../../helpers/project_helper');
const response = require("../../utils/responseManager");

app.post("/clientCreate", middleware.checkToken, (req, res) => {

  return response.handle(res, () =>
    projecthelper.createClient(req.body)
  );
});

app.patch("/clientUpdate/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.editClient(req.params._id, req.body)
  );
});
app.get("/clientList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.getClientList()
  );
});
app.post("/createProject", middleware.checkToken, (req, res) => {

  return response.handle(res, () =>
    projecthelper.createProject(req.body)
  );
});
app.get("/ongoingProjectList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.getlatestProjectList()
  );
});
app.get("/projectList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>  
    projecthelper.getAllProjects()
  );
});
app.get("/projectDetails/:_id", middleware.checkToken, (req, res) => { //test we have to add based on these permissions the data 
  return response.handle(res, () =>
    projecthelper.getProjectDeatils(req.params._id)
  );
});
app.get("/projectDetailsWithClientInfo/:_id", middleware.checkToken, (req, res) => { //test we have to add based on these permissions the data 
  return response.handle(res, () =>
    projecthelper.getProjectListWithClientDetails(req.params._id)
  );
});
app.patch("/projectUpdate/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.editProject(req.params._id, req.body)
  );
});
app.post("/clientProjectInsert", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.addClientToProject(req.body.project_id, req.body.clients)
  );
});
app.patch("/updateProjectClient/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.editProjectClient(req.params._id,req.body.client_id , req.body.update_fields)
  );
});
app.patch("/removeClientFromProject/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.removeClientFromProject(req.params._id,req.body.client_id )
  );
});
module.exports = app;