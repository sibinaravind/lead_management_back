const Joi = require("joi");
const { stringTodate } = require('../utils/parseDate');

const phoneValidator = (value, helpers) => {
  // Allow formats like "+92 9876543210" or "+929876543210" or "9876543210"
  const phoneRegex = /^(\+?\d{1,3}\s?\d{10,15}|\d{10,15})$/;
  if (!phoneRegex.test(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const dateValidator = (value, helpers) => {
  const parsed = stringTodate(value);
  if (!parsed) return helpers.error('any.invalid');
  return value;
};

// Sub Schemas (converted)
const academic_record_schema = Joi.object({
  qualification: Joi.string().optional().allow(null, ""),
  institution: Joi.string().optional().allow(null, ""),
  year_of_passing: Joi.number().integer().min(1900).max(2100).optional().allow(null, ""),
  percentage: Joi.number().min(0).max(100).optional().allow(null, ""),
  board: Joi.string().optional().allow(null, ""),
  description: Joi.string().optional().allow(null, "")
}).optional().allow(null);

const exam_record_schema = Joi.object({
  exam_name: Joi.string().optional().allow(null, ""),
  score: Joi.number().min(0).optional().allow(null, ""),
  test_date: Joi.date().optional().allow(null, ""),
  validity: Joi.date().optional().allow(null, ""),
  description: Joi.string().optional().allow(null, "")
}).optional().allow(null);

const travel_record_schema = Joi.object({
  country: Joi.string().optional().allow(null, ""),
  purpose: Joi.string().optional().allow(null, ""),
  duration: Joi.string().optional().allow(null, ""),
  year: Joi.number().integer().min(1900).max(2100).optional().allow(null),
  description: Joi.string().optional().allow(null, "")
}).optional().allow(null);

const work_record_schema = Joi.object({
  company: Joi.string().optional().allow(null, ""),
  position: Joi.string().optional().allow(null, ""),
  start_date:  Joi.date().optional().allow(null, ''),
  end_date: Joi.date().optional().allow(null, ""),
  description: Joi.string().optional().allow(null, "")
}).optional().allow(null);

// const document_record_schema = Joi.object({
//   doc_type: Joi.string().optional().allow(null, ""),
//   file_path: Joi.string().optional().allow(null, ""),
//   uploaded_at: Joi.date().optional().allow(null)
// }).optional().allow(null);

const offer_item_schema = Joi.object({
  offer_price: Joi.number().optional().allow(null, ""),
  demanding_price: Joi.number().optional().allow(null, ""),
  uploaded_at: Joi.date().default(new Date()),
  updated_by: Joi.string().optional().allow(null, ""),
  status: Joi.string().optional().allow(null, ""),
  description: Joi.string().optional().allow(null, "")
});
const product_interested_schema = Joi.object({
  product_id: Joi.string().required(),
  product_name: Joi.string().required(),
  offers: Joi.array().items(offer_item_schema).optional().allow(null, "")
});

const leadSchema = Joi.object({
  client_id: Joi.string().optional().allow(null, ""),
  name: Joi.string().required().min(1).max(100),
  email: Joi.string().email().optional().allow(null, ""),
  phone: Joi.string().required().custom(phoneValidator, 'Phone Validator'),
  country_code: Joi.string().optional().allow(null, ""),
  alternate_phone: Joi.alternatives().try(
    Joi.string().custom(phoneValidator),
    Joi.valid(null, "")
  ).optional(),
  whatsapp: Joi.alternatives().try(
    Joi.string().custom(phoneValidator),
    Joi.valid(null, "")
  ).optional(),
  gender: Joi.string().optional().allow(null, ""),  //.valid('Male', 'Female', 'Other')
  dob: Joi.date().optional().allow(null, ""),
  marital_status: Joi.string().optional().allow(null, ""), //.valid('Single', 'Married', 'Divorced', 'Widowed')
  address: Joi.string().optional().allow(null, "").max(500),
  city: Joi.string().optional().allow(null, "").max(100),
  state: Joi.string().optional().allow(null, "").max(100),
  country: Joi.string().optional().allow(null, "").max(100),
  pincode: Joi.string().optional().allow(null, "").pattern(/^[0-9]{6}$/),

  lead_source: Joi.string().optional().allow(null, ""),
  source_campaign: Joi.string().optional().allow(null, ""), // 
  status: Joi.string().default('NEW'), // NEW, CONTACTED, IN_PROGRESS, CONVERTED, DEAD ,'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST')
  service_type: Joi.string().required(),  // master ticket , visa 

  created_at: Joi.date().optional().allow(null, ""),
  updated_at: Joi.date().optional().allow(null),
  note: Joi.string().optional().allow(null, "").max(1000),
  interested_in: Joi.array().items(Joi.string()).allow(null, "").optional(),
  feedback: Joi.string().optional().allow(null, "").max(500),
  loan_required: Joi.boolean().optional().default(false),
  loan_amount_required: Joi.number().min(0).optional().allow(null, ""),

  on_call_communication: Joi.boolean().default(false),
  phone_communication: Joi.boolean().default(true),
  email_communication: Joi.boolean().default(false),
  whatsapp_communication: Joi.boolean().default(false),

  officer_id: Joi.string().optional().allow(null, ""),
  branch: Joi.string().optional().allow(null, ""),

  // product_interested: Joi.array().optional().items(product_interested_schema).default([]),
  budget: Joi.number().min(0).optional().allow(null, ""),
  preferred_location: Joi.string().optional().allow(null, ""),
  preferred_date: Joi.date().optional().allow(null),
  country_interested: Joi.array().items(Joi.string()).allow(null, "").optional(),
  expected_salary: Joi.number().integer().min(0).optional().allow(null, ""),
  qualification: Joi.string().optional().allow(null, ""),
  skills: Joi.string().optional().allow(null, ""),
  profession: Joi.string().optional().allow(null, ""),
  specialized_in: Joi.string().optional().allow(null, ""),
  employment_status: Joi.string().optional().allow(null, ""),  //.valid('Employed', 'Self-Employed', 'Unemployed', 'Student', 'Retired')
  experience: Joi.number().integer().min(0).max(50).optional().allow(null, ""),
  job_gap_months: Joi.number().integer().min(0).max(600).optional().allow(null, ""),
  annual_income: Joi.number().min(0).optional().allow(null, ""),
  pan_card_number: Joi.string().optional().allow(null, "").pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/),
  gst_number: Joi.string().optional().allow(null, "").pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/),
  id_proof_type: Joi.string().optional().allow(null, ""),  //.valid()
  id_proof_number: Joi.string().optional().allow(null, ""),
  has_existing_loans: Joi.boolean().allow(null, "").optional(),
  credit_score: Joi.number().integer().min(300).max(900).optional().allow(null, ""),
  first_job_date: Joi.date().optional().allow(null, ""),
  

  birth_country: Joi.string().optional().allow(null, ""),
  birth_place: Joi.string().optional().allow(null, ""),
  email_password: Joi.string().optional().allow(null, ""),
  emergency_contact: Joi.string().optional().allow(null, ""),
  passport_number: Joi.string().optional().allow(null, ""),
  passport_expiry_date: Joi.date().optional().allow(null, ""),

  religion: Joi.string().optional().allow(null, ""),
  

  academic_records: Joi.array().optional().items(academic_record_schema).allow(null, ""),
  exam_records: Joi.array().optional().items(exam_record_schema).allow(null, ""),
  travel_records: Joi.array().optional().items(travel_record_schema).allow(null, ""),
  work_records: Joi.array().optional().items(work_record_schema).allow(null, ""),
  // documents: Joi.array().optional().items(document_record_schema).allow(null, ""),

  travel_purpose: Joi.string().optional().allow(null, ""),  //.valid.valid('BUSINESS', 'HONEYMOON', 'FAMILY', 'FRIENDS', 'SOLO')
  number_of_travelers: Joi.number().integer().optional().allow(null, ""),
  accommodation_preference: Joi.string().optional().allow(null, "").allow(null, ""),  //.valid('BUDGET', 'STANDARD', 'LUXURY')
  visited_countries: Joi.array().optional().items(Joi.string()).allow(null, ""),
  visa_type_required: Joi.string().optional().allow(null, ""),  //.valid('TOURIST', 'BUSINESS', 'STUDENT', 'WORK')
  travel_duration: Joi.number().integer().min(1).max(365).optional().allow(null, ""),  
  requires_travel_insurance: Joi.boolean().optional().allow(null, ""),
  requires_hotel_booking: Joi.boolean().optional().allow(null, ""),
  requires_flight_booking: Joi.boolean().optional().allow(null, ""),

  preferred_study_mode: Joi.string().optional().allow(null, ""),  //.valid('ONLINE', 'OFFLINE', 'HYBRID')
  batch_preference: Joi.string().optional().allow(null, ""),  //.valid('MORNING', 'AFTERNOON', 'EVENING', 'WEEKEND')
  highest_qualification: Joi.string().optional().allow(null, ""),
  year_of_passing: Joi.number().integer().min(1900).max(2100).optional().allow(null, ""),
  field_of_study: Joi.string().optional().allow(null, ""),
  percentage_or_cgpa: Joi.number().min(0).max(100).optional().allow(null, ""),
  courses_interested: Joi.array().items(Joi.string()).allow(null, "").optional(),

  target_visa_type: Joi.string().optional().allow(null, ""),
  has_relatives_abroad: Joi.boolean().allow(null, "").optional(),
  relative_country: Joi.string().optional().allow(null, ""),
  relative_relation: Joi.string().optional().allow(null, ""),
  requires_job_assistance: Joi.boolean().allow(null, "").optional(),
  preferred_settlement_city: Joi.string().optional().allow(null, ""),

  vehicle_type: Joi.string().optional().allow(null, ""),  //.valid('NEW', 'USED')
  brand_preference: Joi.string().optional().allow(null, ""),
  model_preference: Joi.string().optional().allow(null, ""),
  fuel_type: Joi.string().optional().allow(null, ""),  //.valid('PETROL', 'DIESEL', 'ELECTRIC', 'CNG')
  transmission: Joi.string().optional().allow(null, ""),  //.valid('MANUAL', 'AUTOMATIC')
  down_payment_available: Joi.number().min(0).optional().allow(null, ""),
  insurance_type: Joi.string().optional().allow(null, ""),  //.valid('COMPREHENSIVE', 'THIRD_PARTY')

  property_type: Joi.string().optional().allow(null, ""),//.valid('RESIDENTIAL', 'COMMERCIAL', 'PLOT', 'INDUSTRIAL' , 'AGRICULTURAL', 'RETAIL'),
  property_use: Joi.string().optional().allow(null, ""), //.valid('PERSONAL', 'INVESTMENT', 'RENTAL'),

  requires_home_loan: Joi.boolean().allow(null, "").optional(),
  loan_amount_required_real_estate: Joi.number().min(0).optional().allow(null, ""),
  possession_timeline: Joi.string().optional().allow(null, ""),  //.valid('IMMEDIATE', '3_MONTHS', '6_MONTHS', '1_YEAR')
  furnishing_preference: Joi.string().optional().allow(null, ""),  //.valid('FULLY_FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED')
  requires_legal_assistance: Joi.boolean().allow(null, "").optional(),
  total_peoples: Joi.string().optional().allow(null, ""),
  group_type: Joi.string().optional().allow(null, "") ////.valid('COUPLE', 'MARRIED_COUPLE', 'BOYS', 'GIRLS' , 'FAMILY', 'FRIENDS')
}).unknown(false);

// Update Schema (all optional)
const leadUpdateSchema = leadSchema.fork(
  Object.keys(leadSchema.describe().keys),
  (schema) => schema.optional()
);

module.exports = {
  leadSchema,
  leadUpdateSchema,
  phoneValidator,
  dateValidator,
  product_interested_schema
};


// const Joi = require("joi");
// const { stringTodate } = require('../utils/parseDate');
// const leadSchema = Joi.object({
//   name: Joi.string().required(),
//   email: Joi.string().email().allow(null, ""),
//   phone: Joi.string().required().pattern(/^[0-9]+$/),
//   country_code: Joi.string().optional().allow(null, ""),
//   alternate_phone: Joi.alternatives().try(
//     Joi.string().custom((value, helpers) => {
//       const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
//       if (!phoneRegex.test(value)) {
//         return helpers.error('any.invalid');
//       }
//       return value;
//     }, 'Received Phone Validator'),
//     Joi.valid(null, "")
//   ),
//   whatsapp: Joi.alternatives().try(
//     Joi.string().custom((value, helpers) => {
//       const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
//       if (!phoneRegex.test(value)) {
//         return helpers.error('any.invalid');
//       }
//       return value;
//     }, 'Received Phone Validator'),
//     Joi.valid(null, "")
//   ),
//   gender: Joi.string().optional().allow(null, ""),
//   dob: Joi.alternatives().try(
//     Joi.string().custom((value, helpers) => {
//       const parsed = stringTodate(value);
//       if (!parsed) return helpers.error('any.invalid');
//       return value;
//     }, 'Custom Date Validator'),
//     Joi.valid(null, "")
//   ).required(),
//   marital_status: Joi.string().optional().allow(null, ""),
//   address: Joi.string().optional().allow(null, ""),
//   city: Joi.string().optional().allow(null, ""),
//   state: Joi.string().optional().allow(null, ""),
//   country: Joi.string().optional().allow(null, ""),
//   job_interests: Joi.array().items(Joi.string()).default([]),
//   country_interested: Joi.array().items(Joi.string()).default([]),
//   expected_salary: Joi.number().optional().allow(null),
//   qualification: Joi.string().optional().allow(null, ""),
//   experience: Joi.number().optional().allow(null),
// //  skills: Joi.array()
// //   .items(Joi.string())
// //   .empty(null)
// //   .default([]),
//  skills: Joi.array().items(Joi.string()).default([]),
//   profession: Joi.string().optional().allow(null, ""),
//   specialized_in: Joi.array().items(Joi.string()).default([]),
//   lead_source: Joi.string().default("direct").allow(null, ""),
//   officer_id: Joi.string().optional().allow(null, ""),
//   branch: Joi.string().optional().allow("", null),
//   service_type: Joi.string().required().allow(null, ""),
//   status: Joi.string().optional().allow("", null),
//   on_call_communication: Joi.boolean().default(false),
//   on_whatsapp_communication: Joi.boolean().default(false),
//   on_email_communication: Joi.boolean().default(false),
//   note: Joi.string().optional().allow(null, ""),
// }).unknown(false);

// module.exports = {
//   leadSchema,
// };

