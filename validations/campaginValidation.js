const Joi = require('joi');
const { stringTodata } = require('../utils/parseDate');

const campaignValidation = Joi.object({
  title: Joi.string().trim().min(1).max(255).required(),
  startDate: Joi.string()
    .required()
    .allow(null, '')
    .custom((value, helpers) => {
      if (!value) return null;
      const date = stringTodata(value);
      if (!date) return helpers.error('any.invalid');
      return date;
    }, 'Custom Date Parser'),
  image: Joi.object({
    base64: Joi.string()
        .pattern(/^data:(.*);base64,(.*)$/)
        .required(),
    name: Joi.string().optional()
    }).required()

});

module.exports = campaignValidation;
