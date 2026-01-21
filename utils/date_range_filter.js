const buildDateRangeFilter = (category, dateField, startDate, endDate) => {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const startOfDayAfterTomorrow = new Date(startOfTomorrow);
  startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const startOfNextWeek = new Date(startOfWeek);
  startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);

  const startOfMonth = new Date(
    startOfToday.getFullYear(),
    startOfToday.getMonth(),
    1
  );

  const startOfNextMonth = new Date(
    startOfToday.getFullYear(),
    startOfToday.getMonth() + 1,
    1
  );

  let range = null;

  switch (category) {
    case "today":
      range = { $gte: startOfToday, $lt: startOfTomorrow };
      break;

    case "tomorrow":
      range = { $gte: startOfTomorrow, $lt: startOfDayAfterTomorrow };
      break;

    case "pending":
      range = { $lt: startOfToday };
      break;

    case "upcoming":
      range = { $gte: startOfDayAfterTomorrow };
      break;

    case "week":
      range = { $gte: startOfWeek, $lt: startOfNextWeek };
      break;

    case "month":
      range = { $gte: startOfMonth, $lt: startOfNextMonth };
      break;

    case "custom":
      if (startDate && endDate) {
        range = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
      break;

    default:
      return {}; // all
  }

  return range ? { [dateField]: range } : {};
};
module.exports = { buildDateRangeFilter };