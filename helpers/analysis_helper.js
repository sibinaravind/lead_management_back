var db = require('../config/connection');
let COLLECTION = require('../config/collections');
const { buildOfficerMatch } = require('../utils/officer_match');

module.exports = {
    getCalendarMonthSummary: async (query = {}, decoded = {}) => {
        try {
            const now = new Date();
            const requestedYear = Number(query.year);
            const requestedMonth = Number(query.month);
            const year = Number.isInteger(requestedYear) ? requestedYear : now.getFullYear();
            const month = Number.isInteger(requestedMonth) ? requestedMonth : now.getMonth() + 1;

            if (month < 1 || month > 12) {
                throw new Error('month must be between 1 and 12');
            }

            const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
            const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

            const eventMatch = {
                next_schedule: { $gte: monthStart, $lte: monthEnd },
                ...buildOfficerMatch(decoded, query.employee, 'officers')
            };

            const followupMatch = {
                next_schedule: { $gte: monthStart, $lte: monthEnd },
                ...buildOfficerMatch(decoded, query.employee, 'officer_id')
            };

            const [eventCounts, followupCounts] = await Promise.all([
                db.get().collection(COLLECTION.EVENTS).aggregate([
                    { $match: eventMatch },
                    {
                        $group: {
                            _id: {
                                $dateToString: {
                                    format: '%Y-%m-%d',
                                    date: '$next_schedule'
                                }
                            },
                            event_count: { $sum: 1 }
                        }
                    }
                ]).toArray(),
                db.get().collection(COLLECTION.CALL_LOG_ACTIVITY).aggregate([
                    {
                        $match: {
                            ...followupMatch,
                            next_schedule: {
                                $gte: monthStart,
                                $lte: monthEnd,
                                $ne: null
                            }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                $dateToString: {
                                    format: '%Y-%m-%d',
                                    date: '$next_schedule'
                                }
                            },
                            followup_count: { $sum: 1 }
                        }
                    }
                ]).toArray()
            ]);

            const dayMap = new Map();
            for (const row of eventCounts) {
                dayMap.set(row._id, {
                    date: row._id,
                    event_count: row.event_count || 0,
                    followup_count: 0,
                    total_tasks: row.event_count || 0
                });
            }

            for (const row of followupCounts) {
                const existing = dayMap.get(row._id) || {
                    date: row._id,
                    event_count: 0,
                    followup_count: 0,
                    total_tasks: 0
                };
                existing.followup_count = row.followup_count || 0;
                existing.total_tasks = (existing.event_count || 0) + existing.followup_count;
                dayMap.set(row._id, existing);
            }

            const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
            const totals = days.reduce((acc, day) => {
                acc.total_tasks += day.total_tasks || 0;
                acc.event_count += day.event_count || 0;
                acc.followup_count += day.followup_count || 0;
                return acc;
            }, { total_tasks: 0, event_count: 0, followup_count: 0 });

            return {
                month,
                year,
                totals,
                days
            };
        } catch (err) {
            console.error('getCalendarMonthSummary error:', err);
            throw new Error(err?.message || 'Error fetching calendar month summary');
        }
    },

    getCalendarDayDetails: async (query = {}, decoded = {}) => {
        try {
            const { date, employee } = query;
            if (!date) throw new Error('date is required in YYYY-MM-DD format');

            const parsed = new Date(`${date}T00:00:00`);
            if (Number.isNaN(parsed.getTime())) {
                throw new Error('Invalid date format. Use YYYY-MM-DD');
            }

            const dayStart = new Date(parsed);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(parsed);
            dayEnd.setHours(23, 59, 59, 999);

            const eventMatch = {
                next_schedule: { $gte: dayStart, $lte: dayEnd },
                ...buildOfficerMatch(decoded, employee, 'officers')
            };

            const followupMatch = {
                next_schedule: { $gte: dayStart, $lte: dayEnd, $ne: null },
                ...buildOfficerMatch(decoded, employee, 'officer_id')
            };

            const [events, followups] = await Promise.all([
                db.get().collection(COLLECTION.EVENTS).aggregate([
                    { $match: eventMatch },
                    { $sort: { next_schedule: 1 } },
                    {
                        $lookup: {
                            from: COLLECTION.LEADS,
                            localField: 'client_id',
                            foreignField: '_id',
                            as: 'lead'
                        }
                    },
                    { $unwind: { path: '$lead', preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: COLLECTION.OFFICERS,
                            localField: 'officers',
                            foreignField: '_id',
                            as: 'officer_info'
                        }
                    },
                    {
                        $project: {
                            type: { $literal: 'EVENT' },
                            _id: 1,
                            event_id: 1,
                            title: '$name',
                            description: 1,
                            schedule: '$next_schedule',
                            call_status: 1,
                            event_type: 1,
                            booking_id: 1,
                            booking_genid: 1,
                            client_id: '$lead._id',
                            client_name: '$lead.name',
                            client_phone: '$lead.phone',
                            status: '$lead.status',
                            officers: {
                                $map: {
                                    input: '$officer_info',
                                    as: 'officer',
                                    in: {
                                        _id: '$$officer._id',
                                        name: '$$officer.name',
                                        officer_id: '$$officer.officer_id'
                                    }
                                }
                            }
                        }
                    }
                ]).toArray(),
                db.get().collection(COLLECTION.CALL_LOG_ACTIVITY).aggregate([
                    { $match: followupMatch },
                    { $sort: { next_schedule: 1 } },
                    {
                        $lookup: {
                            from: COLLECTION.LEADS,
                            localField: 'client_id',
                            foreignField: '_id',
                            as: 'lead'
                        }
                    },
                    { $unwind: { path: '$lead', preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: COLLECTION.OFFICERS,
                            localField: 'officer_id',
                            foreignField: '_id',
                            as: 'officer'
                        }
                    },
                    { $unwind: { path: '$officer', preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            type: { $literal: 'FOLLOWUP' },
                            _id: 1,
                            title: 'Call Followup',
                            description: '$lead.note',
                            schedule: '$next_schedule',
                            call_status: '$call_status',
                            client_id: '$lead._id',
                            client_name: '$lead.name',
                            client_phone: '$lead.phone',
                            status: '$lead.status',
                            officers: [
                                {
                                    _id: '$officer._id',
                                    name: '$officer.name',
                                    officer_id: '$officer.officer_id'
                                }
                            ]
                        }
                    }
                ]).toArray()
            ]);

            const tasks = [...events, ...followups]
                .sort((a, b) => new Date(a.schedule) - new Date(b.schedule));

            return {
                date,
                counts: {
                    total_tasks: tasks.length,
                    event_count: events.length,
                    followup_count: followups.length
                },
                tasks
            };
        } catch (err) {
            console.error('getCalendarDayDetails error:', err);
            throw new Error(err?.message || 'Error fetching calendar day details');
        }
    }
};
