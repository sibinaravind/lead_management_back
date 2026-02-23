const express = require('express');
const app = express();
app.use(express.json());
const analysisHelper = require('../../helpers/analysis_helper');
let middleware = require('../../middleware');
const response = require('../../utils/responseManager');

app.get('/calendarMonthSummary', middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    analysisHelper.getCalendarMonthSummary(req.query, req.decoded)
  );
});

app.get('/calendarDayDetails', middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    analysisHelper.getCalendarDayDetails(req.query, req.decoded)
  );
});

module.exports = app;
