const Joi = require("joi");
const { stringTodata } = require('../utils/parseDate');
const registrationValidation = Joi.object({
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

module.exports = {
  registrationValidation,
};
