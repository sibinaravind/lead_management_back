
// const express = require("express");
// const app = express();
// app.use(express.json());
// let middleware = require("../../middleware");
// let creHelper=require('../../helpers/cre_helper');
// const response = require("../../utils/responseManager");

// app.get("/assignHotLeadsToCRE", middleware.checkToken, (req, res) => {
//   return response.handle(res, () =>
//     creHelper.assignHotLeadsToCRE()
//   );
// });
// app.get("/getAllCreList", middleware.checkToken, (req, res) => {
//   return response.handle(res, () =>
//     creHelper.getAllCreList()
//   );
// });

// module.exports = app;