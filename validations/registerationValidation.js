const Joi = require("joi");
const { stringTodata } = require('../utils/parseDate');
const customerBasicInfoValidation = Joi.object({
  name: Joi.string().required(),
  last_name: Joi.string().optional().allow(null, ""),
  email: Joi.string().email(),
  email_password: Joi.string().optional().allow(null, ""),
  phone: Joi.string().required().pattern(/^[0-9]+$/),
  gender: Joi.string().optional().allow(null, ""),
  country_code: Joi.string().optional().allow(null, ""),
  alternate_phone: Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
 emergency_contact: Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  whatsapp: Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  // gender: Joi.string().valid("male", "female", "other").optional().allow(null, ""),
  address: Joi.string().optional().allow(null, ""),
  city: Joi.string().optional().allow(null, ""),
  state: Joi.string().optional().allow(null, ""),
  country: Joi.string().optional().allow(null, ""),
  matrial_status: Joi.string().optional().allow(null, ""),
  dob: Joi.string()
      .required()
      .custom((value, helpers) => {
        const parsed = stringTodata(value);
        if (!parsed) return helpers.error('any.invalid');
        return value;
      }, 'Custom Date Validator'),
  birth_place: Joi.string().optional().allow(null, ""),
  birth_country: Joi.string().optional().allow(null, ""),
  marital_status: Joi.string().optional().allow(null, ""),
  religion: Joi.string().optional().allow(null, ""),
  passport_number: Joi.string().required(),
  passport_expiry_date:Joi.string()
      .required()
      .custom((value, helpers) => {
        const parsed = stringTodata(value);
        if (!parsed) return helpers.error('any.invalid');
        return value;
      }, 'Custom Date Validator'),
  profession: Joi.string().optional().allow(null, ""),
  specialized_in: Joi.array().items(Joi.string()).default([]),
  job_interests: Joi.array().items(Joi.string()).default([]),
  country_interested: Joi.array().items(Joi.string()).default([]),
  expected_salary: Joi.number().optional().allow(null),
  skills: Joi.array().items(Joi.string()).default([]),
  on_call_communication: Joi.boolean().default(false),
  on_whatsapp_communication: Joi.boolean().default(false),
  on_email_communication: Joi.boolean().default(false),
  note: Joi.string().optional().allow(null, ""),
    //   qualification: Joi.string().optional().allow(null, ""),
    // university: Joi.string().optional().allow(null, ""),
    // passing_year: Joi.string().optional().allow(null, ""),
    //   experience: Joi.number().optional().allow(null),
    //   skills: Joi.array().items(Joi.string()).default([]),
    //   profession: Joi.string().optional().allow(null, ""),
    //   specialized_in: Joi.array().items(Joi.string()).default([]),
    //   lead_source: Joi.string().default("direct"),
    //   officer_id: Joi.string().optional(),
    //   branch_name: Joi.string().optional().allow("", null),
    //   service_type: Joi.string().required(),
    //   status: Joi.string().optional().allow("", null),
}).unknown(false);

const academicValidation = Joi.object({
  qualification: Joi.string().trim().min(1).required(),
  institution: Joi.string().trim().min(1).required(),
  university: Joi.string().trim().min(1).required(),
  start_year: Joi.number().integer().min(1950).max((new Date().getFullYear()) + 3).required(),
  end_year: Joi.number().integer().min(Joi.ref('start_year')).max((new Date().getFullYear()) + 7).required(),
  grade: Joi.string().trim().allow('', null),
  percentage: Joi.number().min(0).max(100).allow(null)
});


const MIN_YEAR = 2000;
const MAX_YEAR = new Date().getFullYear() + 7;
const examValidation = Joi.object({
  exam: Joi.string().trim().required(),
  status: Joi.string().trim().uppercase().required(),
  validity_date: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!value) return null;
      const parsed = stringTodata(value);
      if (!parsed)
        return helpers.message('Invalid validity_date format (DD/MM/YYYY expected)');
      const year = parsed.getFullYear();
      if (year < MIN_YEAR || year > MAX_YEAR) {
        return helpers.message(`validity_date year must be between ${MIN_YEAR} and ${MAX_YEAR}`);
      }
      return parsed;
    }, 'Custom Validity Date Validator'),

  exam_date: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!value) return null;
      const parsed = stringTodata(value);
      if (!parsed)
        return helpers.message('Invalid exam_date format (DD/MM/YYYY expected)');
      const year = parsed.getFullYear();
      if (year < MIN_YEAR || year > MAX_YEAR) {
        return helpers.message(`exam_date year must be between ${MIN_YEAR} and ${MAX_YEAR}`);
      }

      return parsed;
    }, 'Custom Exam Date Validator'),
  score: Joi.number().min(0).max(100).optional().allow(null),
  grade: Joi.string().trim().allow('', null),
});



const TRAVEL_MIN_YEAR = 1950;
const TRAVEL_MAX_YEAR = new Date().getFullYear() + 7;
const travelHistoryValidation = Joi.object({
  country: Joi.string().trim().required(),

  visa_type: Joi.string()
    .trim()
    .uppercase()
    .required(),

  departure_date: Joi.string()
    .allow(null, '')
    .custom((value, helpers) => {
      if (!value) return null;
      const parsed = stringTodata(value);
      if (!parsed)
        return helpers.message('Invalid departure_date format (DD/MM/YYYY expected)');
      const year = parsed.getFullYear();
      if (year < TRAVEL_MIN_YEAR || year > TRAVEL_MAX_YEAR)
        return helpers.message(`departure_date year must be between ${TRAVEL_MIN_YEAR} and ${TRAVEL_MAX_YEAR}`);
      return parsed; // ✅ Return Date object
    }),

  return_date: Joi.string()
    .allow(null, '')
    .custom((value, helpers) => {
      if (!value) return null;
      const parsed = stringTodata(value);
      const departure = stringTodata(helpers.state.ancestors[0].departure_date);
      if (!parsed)
        return helpers.message('Invalid return_date format (DD/MM/YYYY expected)');
      const year = parsed.getFullYear();
      if (year < TRAVEL_MIN_YEAR || year > TRAVEL_MAX_YEAR)
        return helpers.message(`return_date year must be between ${TRAVEL_MIN_YEAR} and ${TRAVEL_MAX_YEAR}`);
      if (departure && parsed < departure)
        return helpers.message('return_date cannot be before departure_date');
      return parsed; // ✅ Return Date object
    }),

  visa_valid_date: Joi.string()
    .allow(null, '')
    .custom((value, helpers) => {
      if (!value) return null;
      const parsed = stringTodata(value);
      const departure = stringTodata(helpers.state.ancestors[0].departure_date);
      if (!parsed)
        return helpers.message('Invalid visa_valid_date format (DD/MM/YYYY expected)');
      const year = parsed.getFullYear();
      if (year < TRAVEL_MIN_YEAR || year > TRAVEL_MAX_YEAR)
        return helpers.message(`visa_valid_date year must be between ${TRAVEL_MIN_YEAR} and ${TRAVEL_MAX_YEAR}`);
      if (departure && parsed < departure)
        return helpers.message('visa_valid_date cannot be before departure_date');
      return parsed; // ✅ Return Date object
    }),
});


const WORK_MIN_YEAR = 1950;
const WORK_MAX_YEAR = new Date().getFullYear() + 2;

const workHistoryValidation = Joi.object({
  position: Joi.string().trim().required(),
  department: Joi.string().trim().allow(null, ''),
  organization: Joi.string().trim().required(),
  country: Joi.string().trim().required(),

  from_date: Joi.string()
    .allow(null, '')
    .custom((value, helpers) => {
      if (!value) return null;
      const parsed = stringTodata(value);
      if (!parsed) {
        return helpers.message('Invalid start_date format (DD/MM/YYYY expected)');
      }
      const year = parsed.getFullYear();
      if (year < WORK_MIN_YEAR || year > WORK_MAX_YEAR) {
        return helpers.message(`start_date year must be between ${WORK_MIN_YEAR} and ${WORK_MAX_YEAR}`);
      }
      return parsed; // Return original string, not parsed Date
    }),

  to_date: Joi.string()
    .allow(null, '')
    .custom((value, helpers) => {
      if (!value) return null;

      const parsed = stringTodata(value);
      if (!parsed) {
        return helpers.message('Invalid end_date format (DD/MM/YYYY expected)');
      }
      const year = parsed.getFullYear();
      if (year < WORK_MIN_YEAR || year > WORK_MAX_YEAR) {
        return helpers.message(`end_date year must be between ${WORK_MIN_YEAR} and ${WORK_MAX_YEAR}`);
      }

      const startStr = helpers?.state?.ancestors?.[0]?.start_date;
      const startDate = startStr ? stringTodata(startStr) : null;

      if (startDate && parsed < startDate) {
        return helpers.message('end_date cannot be before start_date');
      }

      return parsed; // Return original string
    }),
});
module.exports = {
  academicValidation,
  customerBasicInfoValidation,
  examValidation,
  travelHistoryValidation,
  workHistoryValidation
};
