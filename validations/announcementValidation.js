// announcementSchema.js
const Joi = require('joi');
const { stringTodate } = require('../utils/parseDate');

const announcementValidation = Joi.object({
  title: Joi.string().trim().min(1).required(),
  content: Joi.string().trim().min(1).required(),
  expire_on: Joi.string()
    .required()
    .custom((value, helpers) => {
      const date = stringTodate(value);
      if (!date) return helpers.error('any.invalid');
      return date;
    }, 'Custom Date Parser')
});

module.exports = announcementValidation;
