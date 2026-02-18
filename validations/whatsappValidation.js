const Joi = require('joi');

const messageSchema = Joi.object({
    message_id: Joi.string().required(),
    outgoing:  Joi.boolean().default(false),
    phone: Joi.string().required(),
    isFromGroup: Joi.boolean().default(false),
    message_text: Joi.string().allow('', null).default(''),
    has_media: Joi.boolean().default(false),
    media_path: Joi.string().allow(null),
    is_viewed: Joi.boolean().default(false),
    timestamp: Joi.date().default(() => new Date())
});
module.exports = {  messageSchema
  
};
