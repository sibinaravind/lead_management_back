
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let announcementHelper=require('../../helpers/announcement_helper');
const response = require("../../utils/responseManager");


app.get("/list", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    announcementHelper.getAnnouncements()
  );
});
app.post("/insert", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    announcementHelper.createAnnouncement(req.body.title, req.body.content,req.body.expire_on)
  );            
});
app.delete("/delete/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    announcementHelper.deleteAnnouncement(req.params.id)
  );
});
app.put("/update/:id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>         
    announcementHelper.updateAnnouncement(req.params.id, req.body.title, req.body.content)
    );
}
);


module.exports = app;