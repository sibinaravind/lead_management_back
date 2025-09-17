const Joi = require("joi");
const { stringTodate } = require('../utils/parseDate');
const leadSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().allow(null, ""),
  phone: Joi.string().required().pattern(/^[0-9]+$/),
  country_code: Joi.string().optional().allow(null, ""),
  alternate_phone: Joi.alternatives().try(
    Joi.string().custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
    Joi.valid(null, "")
  ),
  whatsapp: Joi.alternatives().try(
    Joi.string().custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
    Joi.valid(null, "")
  ),
  gender: Joi.string().optional().allow(null, ""),
  dob: Joi.alternatives().try(
    Joi.string().custom((value, helpers) => {
      const parsed = stringTodate(value);
      if (!parsed) return helpers.error('any.invalid');
      return value;
    }, 'Custom Date Validator'),
    Joi.valid(null, "")
  ).required(),
  marital_status: Joi.string().optional().allow(null, ""),
  address: Joi.string().optional().allow(null, ""),
  city: Joi.string().optional().allow(null, ""),
  state: Joi.string().optional().allow(null, ""),
  country: Joi.string().optional().allow(null, ""),
  job_interests: Joi.array().items(Joi.string()).default([]),
  country_interested: Joi.array().items(Joi.string()).default([]),
  expected_salary: Joi.number().optional().allow(null),
  qualification: Joi.string().optional().allow(null, ""),
  experience: Joi.number().optional().allow(null),
//  skills: Joi.array()
//   .items(Joi.string())
//   .empty(null)
//   .default([]),
 skills: Joi.array().items(Joi.string()).default([]),
  profession: Joi.string().optional().allow(null, ""),
  specialized_in: Joi.array().items(Joi.string()).default([]),
  lead_source: Joi.string().default("direct").allow(null, ""),
  officer_id: Joi.string().optional().allow(null, ""),
  branch: Joi.string().optional().allow("", null),
  service_type: Joi.string().required().allow(null, ""),
  status: Joi.string().optional().allow("", null),
  on_call_communication: Joi.boolean().default(false),
  on_whatsapp_communication: Joi.boolean().default(false),
  on_email_communication: Joi.boolean().default(false),
  note: Joi.string().optional().allow(null, ""),
}).unknown(false);

module.exports = {
  leadSchema,
};
