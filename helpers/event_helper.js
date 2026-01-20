var db = require('../config/connection');
let COLLECTION = require('../config/collections');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { eventSchema } = require("../validations/eventValidation");
const { safeObjectId } = require('../utils/safeObjectId');
const { validatePartial } = require("../utils/validatePartial");
const { buildOfficerMatch } = require("../utils/officer_match");
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

                            // Lookup client
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

    getUpcomingActivities: async (query = {}, decoded = {}) => {
        try {
            const { page = 1, limit = 10, employee } = query;
            const parsedPage = Math.max(parseInt(page, 10), 1);
            const parsedLimit = Math.max(parseInt(limit, 10), 1);
            const skip = (parsedPage - 1) * parsedLimit;

            const now = new Date();

            const officerEventMatch = buildOfficerMatch(decoded, employee, "officers");
            const officerCallMatch = buildOfficerMatch(decoded, employee, "officer_id");

            const result = await db.get().collection(COLLECTION.EVENTS).aggregate([
                {
                    $match: {
                        // date_time: { $gt: now },
                        ...officerEventMatch
                    }
                },
                {
                    $project: {
                        _id: 1,
                        type: { $literal: "EVENT" },
                        title: "$name",
                        description: 1,
                        date_time: 1,
                        client_id: 1,
                        officers: 1,
                        created_at: 1
                    }
                },
                {
                    $unionWith: {
                        coll: COLLECTION.CALL_LOG_ACTIVITY,
                        pipeline: [
                            {
                                $match: {
                                    next_schedule: { $gt: now },
                                    ...officerCallMatch
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    type: { $literal: "CALL_EVENT" },
                                    title: "$call_type",
                                    next_schedule: "$next_schedule",
                                    description: "$comment",
                                    date_time: 1,
                                    client_id: 1,
                                    created_at: 1
                                }
                            }
                        ]
                    }
                },
                { $sort: { date_time: 1 } },
                {
                    $facet: {
                        metadata: [{ $count: "total" }],
                        data: [
                            { $skip: skip },
                            { $limit: parsedLimit }
                        ]
                    }
                }
            ]).toArray();
// console.log(result);
            const total = result[0]?.metadata?.[0]?.total ?? 0;
            const activities = result[0]?.data ?? [];

            return {
                activities,
                total,
                page: parsedPage,
                limit: parsedLimit,
                totalPages: Math.ceil(total / parsedLimit)

            };

        } catch (err) {

            throw new Error(err.message || "Error fetching upcoming activities");
        }
    },


};



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
