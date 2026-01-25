var db = require('../config/connection');
let COLLECTION = require('../config/collections');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { eventSchema } = require("../validations/eventValidation");
const { safeObjectId } = require('../utils/safeObjectId');
const { validatePartial } = require("../utils/validatePartial");
const { buildOfficerMatch } = require("../utils/officer_match");
const { buildDateRangeFilter } = require("../utils/date_range_filter");
const { ObjectId } = require('mongodb');
const e = require('express');

module.exports = {
    createEvent: async (details, officer_id) => {
        return new Promise(async (resolve, reject) => {
            try {
                const { error, value } = eventSchema.validate(details);
                if (error) return reject(error.details[0].message);

                details = value;
                const eventCol = db.get().collection(COLLECTION.EVENTS);
                const newNumber = await getNextSequence("event_id");
                const event_id = `AEEID${String(newNumber).padStart(6, "0")}`;
                // Prepare event document
                const eventDoc = {
                    event_id,
                    ...details,
                    created_by: safeObjectId(officer_id),
                    created_at: new Date(),
                    updated_at: new Date()
                };

                const eventResult = await eventCol.insertOne(eventDoc);

                resolve({
                    event_id,
                    _id: eventResult.insertedId,
                    message: "Event created successfully"
                });

            } catch (err) {
                console.error("createEvent error:", err);
                reject(err?.message || err || "Event creation failed");
            }
        });
    },

    updateEvent: async (eventId, updateData) => {
        try {
            const validatedData = validatePartial(eventSchema, updateData);
            const eventCol = db.get().collection(COLLECTION.EVENTS);
            const query = ObjectId.isValid(eventId) && eventId.length === 24
                ? { _id: safeObjectId(eventId) }
                : { event_id: eventId };

            const updateResult = await eventCol.updateOne(
                query,
                { $set: { ...validatedData, updated_at: new Date() } }
            );

            if (updateResult.matchedCount === 0) {
                throw new Error("Event not found");
            }
            await eventCol.findOne(query);
            return { success: true, message: "Event updated successfully" };
        } catch (err) {
            throw (err.message || "Error updating event");
        }
    },

    getAllEvents: async (query, decoded) => {
        try {
            const {
                client_id,
                booking_id,
                event_type,
                status,
                startDate,
                endDate,
                searchString,
                page = 1,
                limit = 10,
                employee,
            } = query;

            const parsedPage = parseInt(page);
            const parsedLimit = parseInt(limit);
            const skip = (parsedPage - 1) * parsedLimit;

            const eventCol = db.get().collection(COLLECTION.EVENTS);
            const filter = {};
            if (client_id) filter.client_id = safeObjectId(client_id);
            if (booking_id) filter.booking_id = safeObjectId(booking_id);
            if (event_type) filter.event_type = event_type;
            if (status) filter.status = status;
            const isAdmin = Array.isArray(decoded?.designation) && decoded.designation.includes('ADMIN');

            if (employee) {
                // Specific employee filter
                filter.officers = safeObjectId(employee);
            } else if (!isAdmin) {
                // Non-admin users see only their events
                const officerIdList = Array.isArray(decoded?.officers)
                    ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
                    : [];

                if (officerIdList.length > 0) {
                    filter.officers = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
                } else if (decoded?._id != null) {
                    filter.officers = safeObjectId(decoded?._id);
                }
            }

            // Date range filter
            if (startDate || endDate) {
                const parseDate = (str) => {
                    if (!str) return null;
                    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
                    if (match) {
                        return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                    }
                    return new Date(str);
                };

                filter.date_time = {};
                if (startDate) {
                    filter.date_time.$gte = parseDate(startDate);
                }
                if (endDate) {
                    const end = parseDate(endDate);
                    end.setHours(23, 59, 59, 999);
                    filter.date_time.$lte = end;
                }
            }

            // Search filter
            if (searchString) {
                const searchRegex = new RegExp(searchString, "i");
                filter.$or = [
                    { name: { $regex: searchRegex } },
                    { description: { $regex: searchRegex } },
                    { event_id: { $regex: searchRegex } },
                ];
            }

            // Aggregation pipeline
            const result = await eventCol.aggregate([
                { $match: filter },
                { $sort: { date_time: 1 } }, // Sort by date ascending
                {
                    $facet: {
                        metadata: [{ $count: "total" }],
                        data: [
                            { $skip: skip },
                            { $limit: parsedLimit },
                            {
                                $lookup: {
                                    from: COLLECTION.LEADS,
                                    localField: "client_id",
                                    foreignField: "_id",
                                    as: "client"
                                }
                            },
                            {
                                $unwind: {
                                    path: "$client",
                                    preserveNullAndEmptyArrays: true
                                }
                            },
                            // Lookup booking
                            {
                                $lookup: {
                                    from: COLLECTION.BOOKINGS,
                                    localField: "booking_id",
                                    foreignField: "_id",
                                    as: "booking"
                                }
                            },
                            {
                                $unwind: {
                                    path: "$booking",
                                    preserveNullAndEmptyArrays: true
                                }
                            },

                            // Lookup officers
                            {
                                $lookup: {
                                    from: COLLECTION.OFFICERS,
                                    localField: "officers",
                                    foreignField: "_id",
                                    as: "officer_details"
                                }
                            },

                            // Project
                            {
                                $project: {
                                    event_id: 1,
                                    name: 1,
                                    description: 1,
                                    date_time: 1,
                                    end_date_time: 1,
                                    url: 1,
                                    address: 1,
                                    event_type: 1,
                                    status: 1,
                                    reminder_sent: 1,
                                    notes: 1,
                                    created_at: 1,
                                    client_name: "$client.name",
                                    client_phone: "$client.phone",
                                    booking_no: "$booking.booking_id",
                                    officer_details: {
                                        $map: {
                                            input: "$officer_details",
                                            as: "officer",
                                            in: {
                                                _id: "$$officer._id",
                                                name: "$$officer.name",
                                                officer_id: "$$officer.officer_id"
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            ]).toArray();

            const total = result[0]?.metadata[0]?.total || 0;
            const events = result[0]?.data || [];

            return {
                events,
                pagination: {
                    total,
                    page: parsedPage,
                    limit: parsedLimit,
                    totalPages: Math.ceil(total / parsedLimit)
                }
            };

        } catch (err) {
            console.error("getAllEvents error:", err);
            throw new Error("Server Error");
        }
    },

    deleteEvent: async (eventId) => {
        try {
            const eventCol = db.get().collection(COLLECTION.EVENTS);
            const query = ObjectId.isValid(eventId) && eventId.length === 24
                ? { _id: safeObjectId(eventId) }
                : { event_id: eventId };
            const event = await eventCol.findOne(query);
            if (!event) {
                throw new Error("Event not found");
            }
            await eventCol.deleteOne(query);
            return { success: true, message: "Event deleted permanently" };

        } catch (err) {
            console.error("deleteEvent error:", err);
            throw (err.message || "Error deleting event");
        }
    },

    getEventCountByCategory: async (query, decoded) => {
        try {
            const { employee } = query;

            const now = new Date();
            // Date calculations
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const tomorrowStart = new Date(todayStart);
            tomorrowStart.setDate(todayStart.getDate() + 1);

            const tomorrowEnd = new Date(tomorrowStart);
            tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(todayStart.getDate() - 1);

            const weekStart = new Date(todayStart);
            weekStart.setDate(todayStart.getDate() - todayStart.getDay()); // Sunday

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);

            const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

            const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0);
            monthEnd.setHours(23, 59, 59, 999);

            // Build officer match
            const officerMatch = buildOfficerMatch(decoded, employee, "officers");

            // Base filter
            const baseFilter = {
                ...officerMatch,

            };
        

            const result = await db
                .get()
                .collection(COLLECTION.EVENTS)
                .aggregate([
                    { $match: baseFilter },
                    {
                        $facet: {
                            TOTAL: [{ $count: "count" }],

                            TODAY: [
                                {
                                    $match: {
                                        next_schedule: { $gte: todayStart, $lt: tomorrowStart }
                                    }
                                },
                                { $count: "count" }
                            ],

                            TOMORROW: [
                                {
                                    $match: {
                                        next_schedule: { $gte: tomorrowStart, $lt: tomorrowEnd }
                                    }
                                },
                                { $count: "count" }
                            ],
                            THIS_WEEK: [
                                {
                                    $match: {
                                        next_schedule: { $gte: weekStart, $lt: weekEnd }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_MONTH: [
                                {
                                    $match: {
                                        next_schedule: { $gte: monthStart, $lte: monthEnd }
                                    }
                                },
                                { $count: "count" }
                            ],

                            UPCOMING: [
                                {
                                    $match: {
                                        next_schedule: { $gte: todayStart }
                                    }
                                },
                                { $count: "count" }
                            ],

                            PENDING: [
                                {
                                    $match: {
                                        status: { $nin: ['COMPLETED', 'CANCELLED'] },
                                        next_schedule: { $lt: todayStart }
                                    }
                                },
                                { $count: "count" }
                            ]
                        }
                    }
                ])
                .toArray();

            const counts = result[0] || {};
            const getCount = (key) => counts[key]?.[0]?.count ?? 0;

            return {
                TOTAL: getCount("TOTAL"),
                TODAY: getCount("TODAY"),
                TOMORROW: getCount("TOMORROW"),
                THIS_WEEK: getCount("THIS_WEEK"),
                THIS_MONTH: getCount("THIS_MONTH"),
                UPCOMING: getCount("UPCOMING"),
                PENDING: getCount("PENDING")
            };

        } catch (err) {

            throw new Error("Server Error");
        }
    },


    getAllEvents: async (query = {}, decoded = {}) => {
        try {
            const {
                page = 1,
                limit = 10,
                employee,
                client_id,
                booking_id,
                startDate,
                endDate,
                status,
                filterCategory,
            } = query;
            const parsedPage = Math.max(parseInt(page), 1);
            const parsedLimit = Math.max(parseInt(limit), 1);
            const skip = (parsedPage - 1) * parsedLimit;
            // Parse date from DD/MM/YYYY format
            const parseDate = (dateStr) => {
                if (!dateStr) return null;
                const [day, month, year] = dateStr.split('/');
                return new Date(`${year}-${month}-${day}`);
            };

            const dateFilter = {};
            if (startDate || endDate) {
                if (startDate) {
                    const start = parseDate(startDate);
                    if (start && !isNaN(start)) {
                        dateFilter.$gte = start;
                    }
                }
                if (endDate) {
                    const end = parseDate(endDate);
                    if (end && !isNaN(end)) {
                        // Set to end of day
                        end.setHours(23, 59, 59, 999);
                        dateFilter.$lte = end;
                    }
                }
            }
            const officerMatchForEvents = buildOfficerMatch(
                decoded,
                employee,
                "officers"
            );

            const eventMatch = {
                ...(Object.keys(dateFilter).length > 0 && { next_schedule: dateFilter }),
                ...(booking_id && { booking_id: safeObjectId(booking_id) }),
                ...(client_id && { client_id: safeObjectId(client_id) }),
                ...officerMatchForEvents  // Apply officer filter
            };
       
            if (status) {
                eventMatch.status = status;
            }else if (filterCategory === 'PENDING') {
                eventMatch.status = { $nin: ['COMPLETED', 'CANCELLED'] };
            }
            const pipeline = [
                { $match: eventMatch },
                // Sort first
                { $sort: { next_schedule: 1 } },

                {
                    $facet: {
                        // -----------------------------
                        // Paginated Data
                        // -----------------------------
                        data: [
                            { $skip: skip },
                            { $limit: parsedLimit },

                            // Lookup lead info
                            {
                                $lookup: {
                                    from: COLLECTION.LEADS,
                                    let: { clientId: "$client_id" },
                                    pipeline: [
                                        { $match: { $expr: { $eq: ["$_id", "$$clientId"] } } },
                                        { $project: { name: 1, phone: 1, country_code: 1, client_id: 1 } }
                                    ],
                                    as: "lead"
                                }
                            },
                            { $unwind: { path: "$lead", preserveNullAndEmptyArrays: true } },

                            // Lookup officers
                            {
                                $lookup: {
                                    from: COLLECTION.OFFICERS,
                                    let: { officerIds: "$officers" },
                                    pipeline: [
                                        { $match: { $expr: { $in: ["$_id", "$$officerIds"] } } },
                                        { $project: { _id: 1, name: 1 ,officer_id: 1 } }
                                    ],
                                    as: "officer_info"
                                }
                            },

                            // Add computed fields
                            {
                                $addFields: {
                                    client_name: "$lead.name",
                                    client_phone: { $concat: ["$lead.country_code", " ", "$lead.phone"] },
                                    client_genid: "$lead.client_id",
                                    officers: "$officer_info",
                                    type: "EVENT"
                                }
                            },

                            // Remove temporary fields
                            { $project: { lead: 0, officer_info: 0 } }
                        ],

                        // -----------------------------
                        // Total count
                        // -----------------------------
                        metadata: [{ $count: "total" }]
                    }
                }
            ];

            const [result] = await db.get().collection(COLLECTION.EVENTS).aggregate(pipeline).toArray();

            return {
                activities: result?.data ?? [],
                total: result?.metadata?.[0]?.total ?? 0,
                page: parsedPage,
                limit: parsedLimit,
                totalPages: Math.ceil((result?.metadata?.[0]?.total ?? 0) / parsedLimit)
            };

        } catch (err) {
            console.error(err);
            throw new Error("Error fetching upcoming activities");
        }
    },

    getEventCountForAllOfficers: async (query) => {
        try {
            const { startDate, endDate } = query;

            /* ---------------- Date Parser ---------------- */
            const parseDate = (str) => {
                if (!str) return null;
                const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
                if (match) {
                    return new Date(
                        Number(match[3]),
                        Number(match[2]) - 1,
                        Number(match[1]),
                        0, 0, 0, 0
                    );
                }
                return new Date(str);
            };

            /* ---------------- Date Filter ---------------- */
            const filter = {};
            const dateField = "next_schedule";

            const start = parseDate(startDate);
            const end = parseDate(endDate);

            if (start || end) {
                filter[dateField] = {};

                if (start instanceof Date && !isNaN(start)) {
                    filter[dateField].$gte = start;
                }

                if (end instanceof Date && !isNaN(end)) {
                    end.setHours(23, 59, 59, 999);
                    filter[dateField].$lte = end;
                }

                if (Object.keys(filter[dateField]).length === 0) {
                    delete filter[dateField];
                }
            }

            /* ---------------- Day Calculations ---------------- */
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const tomorrowStart = new Date(todayStart);
            tomorrowStart.setDate(todayStart.getDate() + 1);

            const tomorrowEnd = new Date(tomorrowStart);
            tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(todayStart.getDate() - 1);

            const weekStart = new Date(todayStart);
            weekStart.setDate(todayStart.getDate() - todayStart.getDay());

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);

            const monthStart = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth(),
                1
            );

            const monthEnd = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth() + 1,
                0
            );
            monthEnd.setHours(23, 59, 59, 999);

            /* ---------------- Aggregation ---------------- */
            const result = await db
                .get()
                .collection(COLLECTION.EVENTS)
                .aggregate([
                    { $match: filter },

                    // Unwind officers array to group by each officer
                    {
                        $unwind: {
                            path: "$officers",
                            preserveNullAndEmptyArrays: true
                        }
                    },

                    {
                        $group: {
                            _id: { $ifNull: ["$officers", "UNASSIGNED"] },

                            TOTAL: { $sum: 1 },

                            TODAY: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gte: ["$next_schedule", todayStart] },
                                                { $lt: ["$next_schedule", tomorrowStart] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },

                            TOMORROW: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gte: ["$next_schedule", tomorrowStart] },
                                                { $lt: ["$next_schedule", tomorrowEnd] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },


                            THIS_WEEK: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gte: ["$next_schedule", weekStart] },
                                                { $lt: ["$next_schedule", weekEnd] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },

                            THIS_MONTH: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gte: ["$next_schedule", monthStart] },
                                                { $lte: ["$next_schedule", monthEnd] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },

                            UPCOMING: {
                                $sum: {
                                    $cond: [
                                        { $gte: ["$next_schedule", todayStart] },
                                        1,
                                        0
                                    ]
                                }
                            },

                            PENDING: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                {
                                                    $not: {
                                                        $in: ["$status", ["COMPLETED", "CANCELLED"]]
                                                    }
                                                },
                                                { $lt: ["$next_schedule", todayStart] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            }
                        }
                    },

                    /* ---------------- Join OFFICERS ---------------- */
                    {
                        $lookup: {
                            from: COLLECTION.OFFICERS,
                            localField: "_id",
                            foreignField: "_id",
                            as: "officer"
                        }
                    },
                    {
                        $unwind: {
                            path: "$officer",
                            preserveNullAndEmptyArrays: true
                        }
                    },

                    {
                        $project: {
                            _id: 1,
                            officer_id: {
                                $cond: [
                                    { $eq: ["$_id", "UNASSIGNED"] },
                                    "UNASSIGNED",
                                    "$officer.officer_id"
                                ]
                            },
                            officer_name: {
                                $cond: [
                                    { $eq: ["$_id", "UNASSIGNED"] },
                                    "UNASSIGNED",
                                    "$officer.name"
                                ]
                            },
                            TOTAL: 1,
                            TODAY: 1,
                            TOMORROW: 1,
                            THIS_WEEK: 1,
                            THIS_MONTH: 1,
                            UPCOMING: 1,
                            PENDING: 1
                        }
                    },

                    { $sort: { TOTAL: -1 } }
                ])
                .toArray();

            return result;
        } catch (err) {
            console.error("getEventCountForAllOfficers error:", err);
            throw new Error("Server Error");
        }
    }
}

//  getAllUpcomingActivities: async (query = {}, decoded = {}) => {
//         try {
//             const {
//                 page = 1,
//                 limit = 10,
//                 employee,
//                 client_id,
//                 booking_id,
//                 startDate,
//                 endDate
//             } = query;
//             const parsedPage = Math.max(parseInt(page), 1);
//             const parsedLimit = Math.max(parseInt(limit), 1);
//             const skip = (parsedPage - 1) * parsedLimit;
//             // Parse date from DD/MM/YYYY format
//             const parseDate = (dateStr) => {
//                 if (!dateStr) return null;
//                 const [day, month, year] = dateStr.split('/');
//                 return new Date(`${year}-${month}-${day}`);
//             };

//             const dateFilter = {};
//             if (startDate || endDate) {
//                 if (startDate) {
//                     const start = parseDate(startDate);
//                     if (start && !isNaN(start)) {
//                         dateFilter.$gte = start;
//                     }
//                 }
//                 if (endDate) {
//                     const end = parseDate(endDate);
//                     if (end && !isNaN(end)) {
//                         // Set to end of day
//                         end.setHours(23, 59, 59, 999);
//                         dateFilter.$lte = end;
//                     }
//                 }
//             }
//             const officerMatchForEvents = buildOfficerMatch(
//                 decoded,
//                 employee,
//                 "officers"
//             );
//             const officerMatchForCalls = buildOfficerMatch(
//                 decoded,
//                 employee,
//                 "officer_id"
//             );
//             const eventMatch = {
//                 ...(Object.keys(dateFilter).length > 0 && { next_schedule: dateFilter }),
//                 ...(booking_id && { booking_id: safeObjectId(booking_id) }),
//                 ...(client_id && { client_id: safeObjectId(client_id) }),
//                 ...officerMatchForEvents  // Apply officer filter
//             };

//             console.log("Event Match Filter:", eventMatch);


//             // Build match filters for calls
//             const callMatch = {
//                 ...(Object.keys(dateFilter).length > 0 && { next_schedule: dateFilter }),
//                 ...(client_id && { client_id: safeObjectId(client_id) }),
//                 ...officerMatchForCalls  // Apply officer filter
//             };
//             console.log("Call Match Filter:", callMatch);

//             const result = await db.get()
//                 .collection(COLLECTION.EVENTS)
//                 .aggregate([
//                     { $match: eventMatch },
//                     {
//                         $project: {
//                             _id: 1,
//                             type: { $literal: "EVENT" },
//                             title: "$name",
//                             description: 1,
//                             next_schedule: "$next_schedule",
//                             client_id: 1,
//                             booking_id: 1,
//                             officers: 1,
//                             created_at: 1
//                         }
//                     },
//                     ...(!booking_id ? [{
//                         $unionWith: {
//                             coll: COLLECTION.CALL_LOG_ACTIVITY,
//                             pipeline: [
//                                 { $match: callMatch },
//                                 {
//                                     $project: {
//                                         _id: 1,
//                                         type: { $literal: "CALL_EVENT" },
//                                         title: "$call_type",
//                                         description: "$comment",
//                                         next_schedule: "$next_schedule",
//                                         client_id: 1,
//                                         officer_id: 1,
//                                         created_at: 1
//                                     }
//                                 }
//                             ]
//                         }
//                     }] : []),
//                     { $sort: { next_schedule: 1 } },
//                     {
//                         $facet: {
//                             metadata: [{ $count: "total" }],
//                             data: [{ $skip: skip }, { $limit: parsedLimit }]
//                         }
//                     }
//                 ])
//                 .toArray();

//             const total = result[0]?.metadata?.[0]?.total ?? 0;

//             return {
//                 activities: result[0]?.data ?? [],
//                 total,
//                 page: parsedPage,
//                 limit: parsedLimit,
//                 totalPages: Math.ceil(total / parsedLimit)
//             };

//         } catch (err) {
//             console.error(err);
//             throw new Error("Error fetching upcoming activities");
//         }
//     }



//  getEventById: async (id) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const eventCol = db.get().collection(COLLECTION.EVENTS);
//                 const query = ObjectId.isValid(id) && id.length === 24
//                     ? { _id: safeObjectId(id) }
//                     : { event_id: id };

//                 const data = await eventCol.aggregate([
//                     { $match: query },
//                     {
//                         $lookup: {
//                             from: COLLECTION.LEADS,
//                             localField: "client_id",
//                             foreignField: "_id",
//                             as: "client"
//                         }
//                     },
//                     {
//                         $unwind: {
//                             path: "$client",
//                             preserveNullAndEmptyArrays: true
//                         }
//                     },
//                     {
//                         $lookup: {
//                             from: COLLECTION.BOOKINGS,
//                             localField: "booking_id",
//                             foreignField: "_id",
//                             as: "booking"
//                         }
//                     },
//                     {
//                         $unwind: {
//                             path: "$booking",
//                             preserveNullAndEmptyArrays: true
//                         }
//                     },
//                     {
//                         $lookup: {
//                             from: COLLECTION.OFFICERS,
//                             localField: "officers",
//                             foreignField: "_id",
//                             as: "officer_details"
//                         }
//                     },
//                     {
//                         $lookup: {
//                             from: COLLECTION.OFFICERS,
//                             localField: "created_by",
//                             foreignField: "_id",
//                             as: "creator"
//                         }
//                     },
//                     {
//                         $unwind: {
//                             path: "$creator",
//                             preserveNullAndEmptyArrays: true
//                         }
//                     },
//                     {
//                         $project: {
//                             event_id: 1,
//                             name: 1,
//                             description: 1,
//                             date_time: 1,
//                             end_date_time: 1,
//                             url: 1,
//                             address: 1,
//                             event_type: 1,
//                             status: 1,
//                             reminder_sent: 1,
//                             notes: 1,
//                             created_at: 1,
//                             updated_at: 1,
//                             client_id: 1,
//                             booking_id: 1,
//                             client_name: "$client.name",
//                             client_phone: "$client.phone",
//                             client_app_id: "$client.client_id",
//                             booking_no: "$booking.booking_id",
//                             booking_product: "$booking.product_name",
//                             officer_details: {
//                                 $map: {
//                                     input: "$officer_details",
//                                     as: "officer",
//                                     in: {
//                                         _id: "$$officer._id",
//                                         name: "$$officer.name",
//                                         officer_id: "$$officer.officer_id",
//                                         phone: "$$officer.phone"
//                                     }
//                                 }
//                             },
//                             created_by_name: "$creator.name",
//                             created_by_id: "$creator.officer_id"
//                         }
//                     }
//                 ]).toArray();

//                 if (!data.length) {
//                     return reject("Event not found");
//                 }

//                 resolve(data[0]);

//             } catch (err) {
//                 console.error("getEventById error:", err);
//                 reject(err.message || "Error fetching event");
//             }
//         });
//     },
