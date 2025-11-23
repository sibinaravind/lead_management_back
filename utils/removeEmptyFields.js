function removeEmptyFields(obj) {
  if (Array.isArray(obj)) {
    return obj
      .map(removeEmptyFields)
      .filter(v => !(v === null || v === "" || v === undefined || JSON.stringify(v) === "{}" || JSON.stringify(v) === "[]"));
  }

  if (obj !== null && typeof obj === "object") {
    const cleanedObj = {};
    for (const key in obj) {
      const cleanedValue = removeEmptyFields(obj[key]);
      if (
        cleanedValue !== null &&
        cleanedValue !== "" &&
        cleanedValue !== undefined &&
        !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
        !(typeof cleanedValue === "object" && Object.keys(cleanedValue).length === 0)
      ) {
        cleanedObj[key] = cleanedValue;
      }
    }
    return cleanedObj;
  }

  return obj;
}
