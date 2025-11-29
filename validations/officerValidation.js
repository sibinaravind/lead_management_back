const Joi = require('joi');

const officerValidation = Joi.object({
  officer_id: Joi.string()
    .optional(),
  name: Joi.string().required(),
  dob: Joi.date().optional().allow(null, ''),
  gender: Joi.string().uppercase()
    .optional().allow(null, '')
    ,
  phone: Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  company_phone_number:Joi.string().allow(null, '')
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  status: Joi.string()
    .optional().allow(null, '').default('ACTIVE'),
  designation: Joi.array()
    .items(Joi.string())
    .optional().allow(null, ''),
  branch: Joi.array()
    .items(Joi.string())
    .optional().allow(null, ''),
  password: Joi.string()
    .required().allow(null, '')
    .custom((value, helpers) => {
      if (
        typeof value !== 'string' ||
        value.length < 8 ||
        !/[A-Z]/.test(value) ||       
        !/[a-z]/.test(value) ||      
        !/\d/.test(value) ||       
        !/[!@#$%^&*(),.?":{}|<>]/.test(value)
      ) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Password Strength Validator')
    .messages({
      'any.invalid': 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a digit, and a special symbol.',
    }),
});

module.exports = officerValidation ;
