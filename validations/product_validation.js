const Joi = require("joi");

const priceComponentSchema = Joi.object({
  title: Joi.string().allow("", null),
  amount: Joi.number().min(0).allow("", null),
  gstPercent: Joi.number().min(0).max(100).allow("", null),
  cgstPercent: Joi.number().min(0).max(100).allow("", null),
  sgstPercent: Joi.number().min(0).max(100).allow("", null),
});

const documentRequiredSchema = Joi.object({
  docName: Joi.string().required(),
  mandatory: Joi.boolean().default(true),
});



// const SUBCATEGORY = {
//   // Travel
//   TOUR_PACKAGE: "tour_package",
//   FLIGHT_BOOKING: "flight_booking",
//   HOTEL_BOOKING: "hotel_booking",

//   // Migration
//   VISA: "visa",
//   IMMIGRATION: "immigration",
//   JOB_ASSISTANCE: "job_assistance",

//   // Vehicle
//   CAR: "car",
//   BIKE: "bike",
//   SCOOTER: "scooter",

//   // Education
//   UG: "ug",
//   PG: "pg",
//   DIPLOMA: "diploma",
//   CERTIFICATION: "certification",

//   // Real Estate
//   APARTMENT: "apartment",
//   VILLA: "villa",
//   PLOT: "plot",
//   COMMERCIAL: "commercial",

//   // Others
//   OTHER: "other",
// };

const productSchema = Joi.object({
  id: Joi.string().allow("", null),
  name: Joi.string().required(),
  code: Joi.string().allow("", null),
  category: Joi.string().allow("", null), // e.g., home , rentential, personal
  subCategory: Joi.string().allow("", null), // e.g., loan, insurance, credit card
  status: Joi.string().allow("", null), //.valid("ACTIVE", "INACTIVE")
  productType: Joi.string().allow("", null), //.valid("Car", "3bhk", "Pg", "Tour", "Visa", ""),
  shortDescription: Joi.string().allow("", null),
  description: Joi.string().allow("", null),
  

  basePrice: Joi.number().min(0).allow("", null),
  sellingPrice: Joi.number().min(0).allow("", null),
  costPrice: Joi.number().min(0).allow("", null),
  advanceRequiredPercent: Joi.number().min(0).allow("", null),

  priceComponents: Joi.array().items(priceComponentSchema).allow("", null),

  documentsRequired: Joi.array().items(documentRequiredSchema).allow("", null),

  validity: Joi.string().allow("", null),
  processingTime: Joi.string().allow("", null),
  serviceMode: Joi.string().allow("", null), //.valid("ONLINE", "OFFLINE", "HYBRID", "")

  ageLimit: Joi.string().allow("", null),
  minIncomeRequired: Joi.string().allow("", null),
  qualificationRequired: Joi.string().allow("", null),
  experienceRequired: Joi.string().allow("", null),

  requiresAgreement: Joi.boolean().default(false),

  // images: Joi.array().items(Joi.string()).allow("", null),

  isRefundable: Joi.boolean().allow("", null),
  refundPolicy: Joi.string().allow("", null),

  tags: Joi.array().items(Joi.string()).allow("", null),
  notes: Joi.string().allow("", null),

  // LOCATION
  country: Joi.string().allow("", null),
  city: Joi.string().allow("", null),
  state: Joi.string().allow("", null),

  // TRAVEL
  travelType: Joi.string().allow("", null),
  duration: Joi.string().allow("", null),
  inclusions: Joi.array().items(Joi.string()).allow("", null),
  exclusions: Joi.array().items(Joi.string()).allow("", null),
  startDate: Joi.date().allow("", null),
  // MIGRATION / VISA
  visaType: Joi.string().allow("", null),
  jobAssistance: Joi.boolean().allow("", null),
  interviewPreparation: Joi.boolean().allow("", null),

  // VEHICLE
  brand: Joi.string().allow("", null),
  model: Joi.string().allow("", null),
  fuelType: Joi.string().allow("", null),
  transmission: Joi.string().allow("", null),
  registrationYear: Joi.string().allow("", null),
  kmsDriven: Joi.string().allow("", null),
  insuranceValidTill: Joi.string().allow("", null),

  // EDUCATION
  courseDuration: Joi.string().allow("", null),
  courseLevel: Joi.string().allow("", null), // UG / PG / DIPLOMA
  institutionName: Joi.string().allow("", null),
  // countryOfStudy: Joi.string().allow("", null),

  // REAL ESTATE
  propertyType: Joi.string().allow("", null),
  size: Joi.string().allow("", null),
  bhk: Joi.string().allow("", null),
  location: Joi.string().allow("", null),
  possessionTime: Joi.string().allow("", null),
  furnishingStatus: Joi.string().allow("", null),

  // Terms, Support, Warranty
  termsAndConditions: Joi.string().allow("", null),

  supportAvailable: Joi.boolean().default(true),
  supportDuration: Joi.string().allow("", null),
  warrantyInfo: Joi.string().allow("", null),
  downpayment: Joi.number().min(0).allow("", null),
  loanEligibility: Joi.number().allow("", null),
  providerDetails: Joi.object({
    name: Joi.string().allow("", null),
    contact: Joi.string().allow("", null),
    email: Joi.string().allow("", null),
    address: Joi.string().allow("", null),
  }).default({}),

  // WORKFLOW STEPS
  stepList: Joi.array().items(Joi.string()).optional(),
});

const productUpdateSchema = productSchema.fork(
  Object.keys(productSchema.describe().keys),
  (schema) => schema.optional()
);


module.exports = {  productSchema,
  productUpdateSchema
};
