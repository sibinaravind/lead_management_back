const Joi = require("joi");
const { safeObjectId } = require('../utils/safeObjectId');
const { EVENT_STATUSES } = require('../constants/enums');

// Event validation schema
const eventSchema = Joi.object({
    name: Joi.string().required().trim().min(3).max(200)
        .messages({
            'string.empty': 'Event name is required',
            'string.min': 'Event name must be at least 3 characters',
            'string.max': 'Event name cannot exceed 200 characters'
        }),
    description: Joi.string().allow("", null).trim().max(1000),
    next_schedule: Joi.date().required()
        .messages({
            'date.base': 'Valid event date and time is required',
            'any.required': 'Event date and time is required'
        }),
    url: Joi.string().allow("", null).trim(),
    address: Joi.string().allow("", null).trim().max(500),
    booking_id: Joi.string().hex().length(24).allow("", null).custom((value, helpers) => {
        if (!value) return value;
        try {
            return safeObjectId(value);
        } catch (err) {
            return helpers.error("any.invalid");
        }
    }),
    booking_genid: Joi.string().allow("", null),
    client_id: Joi.string().hex().length(24).allow("", null).custom((value, helpers) => {
        if (!value) return value;
        try {
            return safeObjectId(value);
        } catch (err) {
            return helpers.error("any.invalid");
        }
    }),
    officers: Joi.array()
        .items(
            Joi.string().hex().length(24).custom((value, helpers) => {
                try {
                    return safeObjectId(value);
                } catch (err) {
                    return helpers.error("any.invalid");
                }
            })
        )
        .allow(null)
        .default([]),
    event_type: Joi.string()
        .allow("", null),

    status: Joi.string()
        .default(EVENT_STATUSES.SCHEDULED)
       
});

module.exports = { eventSchema };
