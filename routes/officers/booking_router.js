
const express = require("express");
const app = express();
app.use(express.json());
let middleware = require("../../middleware");
let bookinghelper=require('../../helpers/booking_helper');
const response = require("../../utils/responseManager");

app.post("/bookingCreate", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.createBooking(req.body)
  );
});

app.patch("/editBooking/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.editBooking(req.params._id, req.body)
  );
});

app.get("/bookingList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.getAllBookings(req.query)
  );
});

app.get("/bookingDetails/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.getBookingById(req.params._id)
  );
});
app.post("/addPayment/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.addPayment( req.params._id,req.body  )
  );
});

app.patch("/updatePayment/:_id", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.updatePayment( req.params._id,req.body  )
  );
});

app.post("/updateDocuments/:id", middleware.checkToken, async (req, res) => {
  try {
    const result = await response.handle(res, () =>
      bookinghelper.uploadBookingDocument(req.params.id, req.body)
    );
    return result;
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/deleteDocument/:id", middleware.checkToken, async (req, res) => {
  try {
    const result = await response.handle(res, () =>
      bookinghelper.deleteBookingDocument(req.params.id, req.body.doc_type)
    );
    return result;
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/upcomingBookings", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.getUpcomingBookings(
      req.query,
    )
  );
});


app.get("/getPaymentScheduleList", middleware.checkToken, (req, res) => {
  return response.handle(res, () =>
    bookinghelper.getPaymentScheduleList(
      req.query,
    )
  );
});

module.exports = app;