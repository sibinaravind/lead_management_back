const Joi = require('joi');
const { stringTodate, stringToTime } = require('../utils/parseDate');
const mongoose = require('mongoose');

const callActivityValidation = Joi.object({
  client_id: Joi.string()
    .trim()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId Validator'),
  duration: Joi.number().optional(),
  next_schedule: Joi.date()
    .required()
   .allow(null),

    next_shedule_time: Joi.number()
    .optional()
    .custom((value, helpers) => {
      const doubleValue = parseFloat(value);
      if (isNaN(doubleValue)) return helpers.error('any.invalid');
      return doubleValue;
    }, 'Custom Double Validator').allow(null),
    dead_lead_reason: Joi.string()
    .trim()
    .when('client_status', {
      is: 'DEAD',
      then: Joi.required(),
      otherwise: Joi.optional().allow('')
    }).uppercase(),
    client_status: Joi.string().trim().uppercase().required(),
    comment: Joi.string().optional().allow(''),
    call_type: Joi.string().uppercase(), //.valid('INCOMING', 'OUTGOING')
    call_status: Joi.string().uppercase(), //.valid('ATTENDED', 'NOT_ATTENDED', 'BUSY'),
    officer_id: Joi.string()
    .trim()
    .optional()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId Validator'),
});

const mobilecallLogValidation = Joi.object({
  officer_phone:Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  officer_id: Joi.string()
    .trim()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId Validator'),
  phone:Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^(\+?\d{1,3}(?:\s?\d{2,})+|\d{10,15})$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Received Phone Validator'),
  duration: Joi.number().required(),
  call_type: Joi.string().required().uppercase(),
});


module.exports = {callActivityValidation , mobilecallLogValidation};
