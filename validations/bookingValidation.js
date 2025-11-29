const Joi = require("joi");
const crypto = require("crypto");
const { safeObjectId } = require('../utils/safeObjectId');
// Payment schedule schema
const parseDDMMYYYY = require('../utils/parseDate').parseDDMMYYYY;

const paymentScheduleSchema = Joi.object({
  id: Joi.string().default(() => {
    // Generate a MongoDB ObjectId-like string
    return new crypto.randomBytes(12).toString("hex");
  }).allow("", null),
  payment_type: Joi.string().allow("", null),
  due_date: Joi.date()
  .allow("", null),
  amount: Joi.number().min(0).allow("", null),
  status: Joi.string().allow("", null),
  paid_at: Joi.date()
  .allow("", null)
 ,
  payment_method: Joi.string().allow("", null),
  transaction_id: Joi.string().allow("", null),
  collected_by: Joi.string()
  .hex()
  .length(24)
  .allow("", null)
  .custom((value, helpers) => {
    // Skip empty or null values
    if (!value) return null;
    try {
      return safeObjectId(value);   // convert to ObjectId
    } catch (err) {
      return helpers.error("any.invalid");
    }
  }),
  remarks: Joi.string().allow("", null),
});


// MAIN BOOKING SCHEMA
const bookingSchema = Joi.object({
  customer_id: Joi.string().required(),
  customer_name: Joi.string().allow("", null),
  customer_phone: Joi.string().allow("", null),
  customer_address: Joi.string().allow("", null),
  product_id: Joi.string().required(),
  product_name: Joi.string().allow("", null),
  booking_date: Joi.date().required(),
  expected_closure_date: Joi.date().allow("", null),
  total_amount: Joi.number().min(0).required(),
  gst_percentage: Joi.number().min(0).max(100).required(),
  gst_amount: Joi.number().min(0).allow("", null),

  cgst_amount: Joi.number().min(0).allow("", null),
  cgst_percentage: Joi.number().min(0).max(100).required(),

  sgst_amount: Joi.number().min(0).allow("", null),
  sgst_percentage: Joi.number().min(0).max(100).required(),

  grand_total: Joi.number().min(0).allow("", null),
  discount_amount: Joi.number().min(0).allow("", null),

  payment_schedule: Joi.array().items(paymentScheduleSchema).allow("", null),

  status: Joi.string().allow("", null),
  status_history: Joi.array().items(
    Joi.object({
      status: Joi.string().required(),
      changed_at: Joi.date().default(() => new Date()),
      changed_by: Joi.string().optional(),
      remarks: Joi.string().optional(),
    })
  ).optional(),

  loan_amount_requested: Joi.number().min(0).allow("", null),
  notes: Joi.string().allow("", null),

  course_name: Joi.string().allow("", null),
  institution_name: Joi.string().allow("", null),

  // Visa fields
  country_applying_for: Joi.string().allow("", null),
  visa_type: Joi.string().allow("", null),
  origin: Joi.string().allow("", null),
  destination: Joi.string().allow("", null),
  return_date: Joi.date().allow(null),
  no_of_travellers: Joi.number().min(1).allow(null),

  officer_id: Joi.string() .hex()
    .length(24).custom((value, helpers) => {
    // Skip empty or null values
    if (!value) return null;
    try {
      return safeObjectId(value);   // convert to ObjectId
    } catch (err) {
      return helpers.error("any.invalid");
    }
  }).allow("", null),
  offers_applied: Joi.array().items(
    Joi.object({
      offer_name: Joi.string().allow("", null),
      discount_amount: Joi.number().min(0).allow("", null)
    })
  ).optional(),
  co_applicant_list: Joi.array().items(
    Joi.object({
      name: Joi.string().allow("", null),
      phone: Joi.string().allow("", null),
      dob: Joi.string().allow("", null),
      address: Joi.string().allow("", null),
      email: Joi.string().allow("", null)
    })
  ).allow("", null),
});

module.exports = { bookingSchema , paymentScheduleSchema};
