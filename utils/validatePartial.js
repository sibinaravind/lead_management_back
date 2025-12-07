
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
      const formatted = filteredErrors.map((d) => {
        const path = d.path;

        // Handle nested array/object fields
        const cleanPath = path.filter((p) => typeof p !== "number"); // remove array indexes

        // If nested, show "field in parent"
        let msg;
        if (cleanPath.length > 1) {
          const parent = cleanPath[0];
          const field = cleanPath[1];
          // Use Joi message if not a regex pattern, else custom
          if (d.type === "string.pattern.base") {
            msg = `${field} in ${parent} with value ${data[parent]?.[0][field]} is not valid`;
          } else {
            // remove quotes from Joi message
            const shortMsg = d.message.replace(/["']/g, "").replace(cleanPath.join("."), "").trim();
            msg = `${field} in ${parent} ${shortMsg}`;
          }
        } else {
          const field = cleanPath[0];
          if (d.type === "string.pattern.base") {
            msg = `${field} with value ${data[field]} is not valid`;
          } else {
            const shortMsg = d.message.replace(/["']/g, "").replace(field, "").trim();
            msg = `${field} ${shortMsg}`;
          }
        }

        return msg;
      });

      throw new Error(formatted.join(", "));
    }
  }

  return value;
}

// function validatePartial(schema, data) {
//   const keys = Object.keys(data);
//   const partialSchema = schema.fork(keys, (field) => field.optional());
//   const { error, value } = partialSchema.validate(data, {
//     abortEarly: false,
//     stripUnknown: true,
//   });
//   // console.log("Validation result:", { error, partialSchema, value });
//   if (error) {
//     const filteredErrors = error.details.filter((d) =>
//       keys.includes(d.path[0])
//     );

//     if (filteredErrors.length > 0) {
//       throw new Error(
//         "Validation failed: " +
//           filteredErrors.map((d) => d.message).join(", ")
//       );
//     }
//   }

//   return value;
// }
// module.exports = validatePartial;




// const Joi = require("joi");

// function validatePartial(schema, data) {
//   const keys = Object.keys(data);
//   const partialSchema = schema.fork(keys, (field) => field.optional());

//   const { error, value } = partialSchema.validate(data, {
//     abortEarly: false,
//     stripUnknown: true,
//   });

//   if (error) {
//     const filteredErrors = error.details.filter((d) =>
//       keys.includes(d.path[0])
//     );

//     if (filteredErrors.length > 0) {
//       const formattedErrors = filteredErrors.map((d) => {
//         const field = d.path[0];
//         const rawValue = data[field];

//         // fix for arrays/objects
//         const value =
//           typeof rawValue === "object"
//             ? JSON.stringify(rawValue)
//             : String(rawValue);

//         return `${field} = ${value} is invalid`;
//       });

//       throw new Error("Validation failed: " + formattedErrors.join(", "));
//     }
//   }

//   return value;
// }



function formatJoiErrors(error, data) {
  // If it's a Joi validation error with details array
  if (error && Array.isArray(error.details)) {
    return error.details.map((d) => {
      const field = d.path.join('.') || "unknown_field";
      const value = data[field];
      return `${field} = "${value}" is invalid`;
    });
  }

  // If it's a standard Error object → return its message
  if (error instanceof Error) {
    return [error.message];
  }

  // For strings or unknown types
  if (typeof error === "string") {
    return [error];
  }

  return ["Unknown validation error"];
}

module.exports = 
{ validatePartial, formatJoiErrors };
