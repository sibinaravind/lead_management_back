
const Joi = require("joi");

function validatePartial(schema, data) {
  const keys = Object.keys(data);
  const partialSchema = schema.fork(keys, (field) => field.optional());
  const { error, value } = partialSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    const filteredErrors = error.details.filter((d) =>
      keys.includes(d.path[0])
    );

    if (filteredErrors.length > 0) {
      throw new Error(
        "Validation failed: " +
          filteredErrors.map((d) => d.message).join(", ")
      );
    }
  }

  return value;
}
module.exports = validatePartial;
