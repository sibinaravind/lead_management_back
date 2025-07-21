const Joi = require('joi');

const officerValidation = Joi.object({
  officer_id: Joi.string()
    .required(),
  name: Joi.string().required(),
  gender: Joi.string().uppercase()
    .valid('MALE', 'FEMALE', 'OTHER')
    .required(),
  phone: Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  company_phone_number:Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  status: Joi.string()
    .valid('ACTIVE', 'INACTIVE', 'PAUSED', 'BLOCKED','DELETED')
    .required(),
  designation: Joi.array()
    .items(Joi.string())
    .min(1)
    .required(),
  branch: Joi.array()
    .items(Joi.string())
    .min(1)
    .required(),
  password: Joi.string()
    .required()
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
