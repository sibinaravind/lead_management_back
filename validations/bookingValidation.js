const Joi = require("joi");
const crypto = require("crypto");
const { safeObjectId } = require('../utils/safeObjectId');
// Payment schedule schema

const paymentScheduleSchema = Joi.object({
  _id: Joi.string().default(() => {
    return new crypto.randomBytes(12).toString("hex");
  }).allow("", null),
  payment_type: Joi.string().allow("", null),
  due_date: Joi.date().allow("", null),
  amount: Joi.number().min(0).allow("", null),
  status: Joi.string().default("PENDING").allow("", null),
});

const priceComponentSchema = Joi.object({
  title: Joi.string().allow("", null),
  amount: Joi.number().min(0).allow("", null),
  offersApplied: Joi.array().items(
    Joi.object({
      offer_name: Joi.string().allow("", null),
      discount_amount: Joi.number().min(0).allow("", null)
    })
  ).optional(),
  gstPercent: Joi.number().min(0).max(100).allow("", null),
  cgstPercent: Joi.number().min(0).max(100).allow("", null),
  sgstPercent: Joi.number().min(0).max(100).allow("", null),
});


const transactionSchema = Joi.object({
  paid_amount: Joi.number().positive().allow("", null),
  payment_method: Joi.string().allow("", null),
  transaction_id: Joi.string().allow("", null),
  remarks: Joi.string().allow("", null)
});

// MAIN BOOKING SCHEMA
const bookingSchema = Joi.object({
  customer_id: Joi.string().allow("", null),
  customer_name: Joi.string(),
  customer_phone: Joi.string(),
  customer_address: Joi.string().allow("", null),
  product_id: Joi.string().required(),
  product_name: Joi.string().allow("", null),
  booking_date: Joi.date().required(),
  expected_closure_date: Joi.date().allow("", null),
  total_amount: Joi.number().min(0).required(),
  gst_amount: Joi.number().min(0).allow("", null),
  cgst_amount: Joi.number().min(0).allow("", null),
  sgst_amount: Joi.number().min(0).allow("", null),
  price_components: Joi.array().items(priceComponentSchema).allow("", null),
  grand_total: Joi.number().min(0).allow("", null),
  discount_amount: Joi.number().min(0).allow("", null),
  transaction: transactionSchema.optional(),
  payment_schedule: Joi.array().items(paymentScheduleSchema).allow("", null),

  status: Joi.string().allow("", null),
  // status_history: Joi.array().items(
  //   Joi.object({
  //     status: Joi.string().required(),
  //     changed_at: Joi.date().default(() => new Date()),
  //     changed_by: Joi.string().optional(),
  //     remarks: Joi.string().optional(),
  //   })
  // ).optional(),
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
  }),
  
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

module.exports = { bookingSchema , paymentScheduleSchema,transactionSchema};
