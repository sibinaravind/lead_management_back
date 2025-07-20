const Joi = require('joi');
const { stringTodata, stringToTime } = require('../utils/parseDate');
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
  duration: Joi.number().required(),
  next_schedule: Joi.string()
    .required()
    .custom((value, helpers) => {
      const parsed = stringTodata(value);
      if (!parsed) return helpers.error('any.invalid');
      return value;
    }, 'Custom Date Validator'),

  next_shedule_time: Joi.string()
    .required()
    .custom((value, helpers) => {
      const time = stringToTime(value);
      if (!time) return helpers.error('any.invalid');
      return time;
    }, 'Custom Time Validator'),

    client_status: Joi.string().trim().uppercase().required(),
    comment: Joi.string().optional().allow(''),
    call_type: Joi.string().uppercase(), //.valid('INCOMING', 'OUTGOING')
    call_status: Joi.string().uppercase() //.valid('ATTENDED', 'NOT_ATTENDED', 'BUSY')
});

const mobilecallLogValidation = Joi.object({
  received_phone: Joi.string()
    .custom((value, helpers) => {
      const phoneRegex = /^\+\d{7,15}$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    },  'Received Phone Validator'),
  officer_id: Joi.string()
    .trim()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId Validator'),
  phone: Joi.string()
    .required()
    .custom((value, helpers) => {
      const phoneRegex = /^\+\d{7,15}$/;
      if (!phoneRegex.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Phone Validator'),
  duration: Joi.number().required(),
  call_type: Joi.string().required().uppercase(),
});


module.exports = {callActivityValidation , mobilecallLogValidation};
