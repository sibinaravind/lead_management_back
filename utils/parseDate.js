

function stringTodata(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const [day, month, year] = dateStr.split('/');

  if (!day || !month || !year) return null;

  const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`;
  const date = new Date(isoString);

  return isNaN(date.getTime()) ? null : date;
}
function stringToTime(timeStr) {
  if (typeof timeStr !== 'string' || !timeStr.trim()) {
    return null; // Not a valid string
  }
  // Normalize decimal to colon, e.g., "14.5" → "14:5"
  const normalized = timeStr.includes('.') ? timeStr.replace('.', ':') : timeStr.trim();
  const parts = normalized.split(':');
  if (parts.length > 2) return null; // Too many parts

  let hour = 0;
  let minute = 0;

  if (parts.length === 1) {
    // "14", "9", etc.
    hour = parseInt(parts[0], 10);
    if (isNaN(hour)) return null;
    minute = 0;
  } else if (parts.length === 2) {
    hour = parseInt(parts[0], 10);
    minute = parseInt(parts[1], 10);
    if (isNaN(hour) || isNaN(minute)) return null;
  } else {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null; // Out-of-range time
  }
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}



module.exports = { stringTodata ,stringToTime };
