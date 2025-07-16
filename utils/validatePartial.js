const Joi = require("joi");

function validatePartial(schema, data) {
  const keys = Object.keys(data);
  const partialSchema = schema.fork(keys, (field) => field.optional());
  const { error, value } = partialSchema.validate(data, { abortEarly: false, stripUnknown: true });

  if (error) {
    throw new Error("Validation failed: " + error.details.map(d => d.message).join(", "));
  }

  return value;
}

module.exports = validatePartial;