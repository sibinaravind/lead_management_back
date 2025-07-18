
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
app.delete("/deleteClient/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.deleteClient(req.params._id)
  );
});


app.post("/createProject", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.createProject(req.body)
  );
});

app.patch("/projectUpdate/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.editProject(req.params._id, req.body)
  );
});
app.get("/projectList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.getProjectList()
  );
});
app.delete("/deleteProject/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.deletePoject(req.params._id)
  );
});


app.post("/createVacancy", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.createVacancy(req.body)
  );
});
app.patch("/editVacancy/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.editVacancy(req.params._id, req.body)
  );
});

app.post("/insertClient/:vacancyId", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.insertClientsToVacancy(req.params.vacancyId, req.body.clients)
  );
});
app.delete("/removeClient", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.removeClientFromVacancy(req.body.vacancyId, req.body.clientId)
  );
});
app.get("/getClientListOnVacancy/:vacancyId", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.getClientDetailsWithVacancyData(req.params.vacancyId)
  );
});

app.patch("/editClientInVacancy/:vacancyId", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.editClientsInVacancy(req.params.vacancyId, req.body.clients)
  );
});

app.delete("/deleteVacancy/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.deleteVacancy(req.params._id)
  );
});

app.get("/vacancyList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.getVacancyList()
  );
});

app.get("/vacancyListByClient/:clientId", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.getVacancyListByClient(req.params.clientId)
  );
});

app.get("/getVacancyMatchingProfiles/:vacancy_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    projecthelper.getVacancyMatchingProfiles(req.params.vacancy_id)
  );
});


module.exports = app;