const Joi = require("joi");

const discountSchema = Joi.object({
  title: Joi.string().allow("", null),
  percent: Joi.number().min(0).max(100).default(0),
  validFrom: Joi.string().allow("", null),
  validTo: Joi.string().allow("", null),
});

const priceComponentSchema = Joi.object({
  title: Joi.string().allow("", null),
  percent: Joi.number().min(0).max(100).default(0),
  gstPercent: Joi.number().min(0).max(100).default(0),
  cgstPercent: Joi.number().min(0).max(100).default(0),
  sgstPercent: Joi.number().min(0).max(100).default(0),
});

const documentRequiredSchema = Joi.object({
  docName: Joi.string().required(),
  mandatory: Joi.boolean().default(true),
});

const productSchema = Joi.object({
  id: Joi.string().allow("", null),
  name: Joi.string().required(),
  code: Joi.string().allow("", null),
  category: Joi.string().allow("", null),
  subCategory: Joi.string().allow("", null),

  type: Joi.string()
    .valid(
      "TRAVEL",
      "MIGRATION",
      "VEHICLE",
      "EDUCATION",
      "REAL_ESTATE",
      "OTHER"
    )
    .required(),

  status: Joi.string().valid("ACTIVE", "INACTIVE").default("ACTIVE"),

  description: Joi.string().allow("", null),
  shortDescription: Joi.string().allow("", null),

  basePrice: Joi.number().min(0).default(0),
  sellingPrice: Joi.number().min(0).default(0),
  costPrice: Joi.number().min(0).default(0),

  advanceRequiredPercent: Joi.number().min(0).max(100).default(0),

  discount: Joi.array().items(discountSchema).default([]),

  priceComponents: Joi.array().items(priceComponentSchema).default([]),

  documentsRequired: Joi.array().items(documentRequiredSchema).default([]),

  validity: Joi.string().allow("", null),
  processingTime: Joi.string().allow("", null),
  serviceMode: Joi.string().valid("ONLINE", "OFFLINE", "HYBRID", "").allow("", null),

  ageLimit: Joi.string().allow("", null),
  minIncomeRequired: Joi.string().allow("", null),
  qualificationRequired: Joi.string().allow("", null),
  experienceRequired: Joi.string().allow("", null),

  requiresAgreement: Joi.boolean().default(false),

  images: Joi.array().items(Joi.string()).default([]),

  isRefundable: Joi.boolean().default(false),
  refundPolicy: Joi.string().allow("", null),

  tags: Joi.array().items(Joi.string()).default([]),
  notes: Joi.string().allow("", null),

  // LOCATION
  country: Joi.string().allow("", null),
  city: Joi.string().allow("", null),
  state: Joi.string().allow("", null),

  // TRAVEL
  travelType: Joi.string().allow("", null),
  duration: Joi.string().allow("", null),
  inclusions: Joi.array().items(Joi.string()).default([]),
  exclusions: Joi.array().items(Joi.string()).default([]),

  // MIGRATION / VISA
  visaType: Joi.string().allow("", null),
  jobAssistance: Joi.boolean().default(false),
  interviewPreparation: Joi.boolean().default(false),

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
  countryOfStudy: Joi.string().allow("", null),

  // REAL ESTATE
  propertyType: Joi.string().allow("", null),
  size: Joi.string().allow("", null),
  bhk: Joi.string().allow("", null),
  location: Joi.string().allow("", null),
  possessionTime: Joi.string().allow("", null),
  furnishingStatus: Joi.string().allow("", null),

  // Terms, Support, Warranty
  termsAndConditions: Joi.string().allow("", null),
  agreementTemplateUrl: Joi.string().allow("", null),

  supportAvailable: Joi.boolean().default(true),
  supportDuration: Joi.string().allow("", null),
  warrantyInfo: Joi.string().allow("", null),

  // WORKFLOW STEPS
  stepList: Joi.array().items(Joi.string()).default(["Initial Check", "Document Collection", "Processing", "Completion"]),
});

module.exports = productSchema;
