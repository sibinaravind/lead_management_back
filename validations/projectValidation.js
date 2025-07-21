const Joi = require('joi');
const mongoose = require('mongoose');
const clientValidation = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  alternate_phone: Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  address: Joi.string()
    .optional()
    .trim()
    .min(5)
    .messages({
      'string.min': 'Address must be at least 5 characters long.',
    }),
  city: Joi.string()
    .optional()
    .trim()
    .min(2)
    .messages({
      'string.min': 'City must be at least 2 characters long.',
    }),
  state: Joi.string()
    .optional()
    .trim()
    .min(2)
    .messages({
      'string.min': 'State must be at least 2 characters long.',
    }),
  country: Joi.string()
    .optional()
    .trim()
    .min(2)
    .messages({
      'string.min': 'Country must be at least 2 characters long.',
    })
});

const projectValidation = Joi.object({
  project_name: Joi.string().trim().min(2).max(100).required(),
  organization_type: Joi.string()
    .trim()
    .valid('GOV', 'PRIVATE', 'NGO', 'OTHER') 
    .required()
    .messages({
      'any.only': 'Organization type must be one of GOV, PRIVATE, NGO, or OTHER.',
    }),
  organization_category: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .optional()
    .messages({
      'string.min': 'Organization category must be at least 2 characters long.',
    }),
  organization_name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Organization name must be at least 2 characters long.',
    }),
  city: Joi.string()
    .optional()
    .trim()
    .min(2)
    .messages({
      'string.min': 'City must be at least 2 characters long.',
    }),

  country: Joi.string()
    .optional()
    .trim()
    .min(2)
    .messages({
      'string.min': 'Country must be at least 2 characters long.',
    })
});



const vacancyValidation = Joi.object({
  project_id:  Joi.string()
      .trim()
      .required()
      .custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          return helpers.error('any.invalid');
        }
        return value;
      }, 'ObjectId Validator'),

  job_title: Joi.string().trim().min(3).max(100).required(),
  job_category: Joi.string().trim().min(2).required(),
  qualifications: Joi.array().items(Joi.string().trim().min(2)).min(1).required(),

  experience: Joi.string()
    .pattern(/^\d+(\.\d+)?$/)
    .messages({ 'string.pattern.base': 'Experience must be a numeric value.' })
    .required(),

  skills: Joi.string().trim().optional().min(3),
  salary_from: Joi.number().min(0).optional(),
  salary_to: Joi.number()
    .min(Joi.ref('salary_from'))
    .optional()
    .messages({
      'number.min': 'Salary to must be greater than or equal to salary from.'
    }),
  lastdatetoapply: Joi.string()
    .pattern(/^\d{2}\/\d{2}\/\d{4}$/)
    .required()
    .messages({
      'string.pattern.base': 'Last date to apply must be in DD/MM/YYYY format.'
    }),

  description: Joi.string().trim().min(5).optional(),
  country: Joi.string().trim().min(2).optional(),
  city: Joi.string().trim().min(2).optional(),

  clients: Joi.array().items(
    Joi.object({
      client_id: Joi.string()
        .trim()
        .required()
        .custom((value, helpers) => {
          if (!mongoose.Types.ObjectId.isValid(value)) {
            return helpers.error('any.invalid');
          }
          return value;
        }, 'ObjectId Validator'),
      
      commission: Joi.number().min(0).required(),

      vacancies: Joi.object().pattern(
        Joi.string().trim().min(1),
        Joi.object({
          count: Joi.number().integer().min(0).required(),
          target_cv: Joi.number().integer().min(0).required()
            .custom((value, helpers, context) => {
              if (value < helpers.state.ancestors[0].count) {
                return helpers.error('number.greater');
              }
              return value;
            }, 'Target CV greater than count')
            .messages({
              'number.greater': 'Target CV must be greater than count.'
            })
        })
      ).required()
    })
  ).min(1).required()
});



module.exports = { clientValidation , projectValidation,vacancyValidation };
