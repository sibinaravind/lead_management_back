
const express = require("express");
const app = express();
app.use(express.json());
const eventHelper = require('../../helpers/event_helper');
let middleware = require("../../middleware");
const response = require("../../utils/responseManager");

app.post("/creatEvent", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    eventHelper.createEvent(req.body , req.decoded._id)
  );
});

app.patch("/updateEvent/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    eventHelper.updateEvent(req.params._id, req.body)
  );
});
app.get("/eventList", middleware.checkToken, (req, res) => {
  
  return response.handle(res, () =>
    eventHelper.getAllEvents(req.query, req.decoded)
  );
});
app.get("/eventListCount", middleware.checkToken, (req, res) => {
  
  return response.handle(res, () =>
    eventHelper.getEventCountByCategory(req.query, req.decoded)
  );
});
app.get("/eventCountForAllOfficers", middleware.checkToken, (req, res) => {
  
  return response.handle(res, () =>
    eventHelper.getEventCountForAllOfficers(req.query)
  );
});
app.delete("/deleteEvent/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    eventHelper.deleteEvent(req.params._id)
  );
});

module.exports = app;
