var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const { STATUSES } = require('../constants/enums');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { callActivityValidation, mobilecallLogValidation } = require('../validations/callActivityValidation');
const { ref } = require('joi');
const { safeObjectId } = require('../utils/safeObjectId');
const { validatePartial, formatJoiErrors } = require("../utils/validatePartial");
module.exports = {
    logActivity: async ({
        type,
        client_id,
        officer_id = null,
        assigned_by = null,
        comment = null,
        client_status = null,
        referrer_id = null
    }) => {
        try {
            // Validate required fields
            if (!type) throw new Error("Activity type is required");
            if (!client_id) throw new Error("Client ID is required");
            const safeObjectId = (id) => {
                if (!id) return null;
                if (id instanceof ObjectId) return id;
                if (typeof id === 'string') {
                    if (/^[0-9a-fA-F]{24}$/.test(id)) {
                        try {
                            return new ObjectId(id);
                        } catch {
                            return null;
                        }
                    }
                    return null;
                }
                return null;
            };

            const data = {
                type,
                client_id: safeObjectId(client_id),
                created_at: new Date(),
                ...(comment && { comment }),
                ...(client_status && { client_status })
            };

            // Only include these fields if they have valid ObjectIds
            const validOfficerId = safeObjectId(officer_id);
            if (validOfficerId) data.officer_id = validOfficerId;

            const validAssignedById = safeObjectId(assigned_by);
            if (validAssignedById) data.assigned_by = validAssignedById;

            const validReferrerId = safeObjectId(referrer_id);
            if (validReferrerId) data.referrer_id = validReferrerId;

            // Validate the client_id was properly converted
            if (!data.client_id) {
                throw new Error(`Invalid client_id format: ${client_id}`);
            }

            return await db.get().collection(COLLECTION.CUSTOMER_ACTIVITY).insertOne(data);
        } catch (err) {
            console.error("Error logging activity:", err.message);
            throw err; // Re-throw the error for the caller to handle
        }
    },
    logCallEvent: async (data, officer_id) => {
        return new Promise(async (resolve, reject) => {
            try {

                var { error, value } = callActivityValidation.validate(data, {
                    abortEarly: false,
                    stripUnknown: true,
                });
                if (error) {
                    const cleanErrors = formatJoiErrors(error, data);
                    throw "Validation failed: " + cleanErrors.join(", ");
                }

                data = value;
                if (!data.client_id) return reject("Client ID is required");
                const clientId = new ObjectId(data.client_id);

                const leadsCollection = db.get().collection(COLLECTION.LEADS);
                const customerActivityCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);

                // Fetch client
                const clientDoc = await leadsCollection.findOne({ _id: clientId });
                if (!clientDoc) return reject("Client not found");

                // Prepare next schedule
                let nextScheduleDate = data.next_schedule || null;

                // Insert call event log
                const logResult = await customerActivityCollection.insertOne({
                    type: "call_event",
                    client_id: clientId,
                    officer_id: ObjectId.isValid(officer_id) ? new ObjectId(officer_id) : null,
                    duration: data.duration || 0,
                    next_schedule: nextScheduleDate,
                    next_shedule_time: data.next_shedule_time || null,
                    comment: data.comment || data.dead_lead_reason || "",
                    call_type: data.call_type || "",
                    call_status: data.call_status || "",
                    created_at: new Date(),
                });

                if (!logResult.acknowledged) return reject("Failed to log call event");

                // Prepare lastcall object
                const lastcall = {
                    _id: logResult.insertedId,
                    type: "call_event",
                    client_id: clientId,
                    officer_id: ObjectId.isValid(officer_id) ? new ObjectId(officer_id) : null,
                    duration: data.duration || 0,
                    next_schedule: nextScheduleDate,
                    next_shedule_time: data.next_shedule_time || null,
                    comment: data.comment || "",
                    call_type: data.call_type || "",
                    call_status: data.call_status || "",
                    created_at: new Date(),
                };

                // Update status if changed
                if (
                    data.client_status &&
                    data.client_status !== "null" &&
                    data.client_status !== "" &&
                    clientDoc.status !== data.client_status
                ) {
                    await leadsCollection.updateOne(
                        { _id: clientId },
                        {
                            $set: {
                                status: data.client_status,
                                dead_lead_reason: data.dead_lead_reason || "",
                                lastcall
                            }
                        }
                    );

                    await module.exports.logActivity({
                        type: "status_update",
                        client_id: clientId,
                        officer_id: officer_id || null,
                        client_status: data.client_status,
                        comment: data.comment || data.dead_lead_reason || ""
                    });

                    return resolve("Status updated + call logged");
                }

                // If no status change, only update lastcall
                await leadsCollection.updateOne(

                    { _id: clientId },
                    { $set: { lastcall, dead_lead_reason: data.dead_lead_reason || "" } }
                );

                resolve("Call event logged");

            } catch (err) {

                reject(err.message || err);
            }
        });
    },

    logMobileCallEvent: async (data) => {
        return new Promise(async (resolve, reject) => {
            try {
                const { error, value } = mobilecallLogValidation.validate(data);
                if (error) {
                    return reject("Validation failed: " + error);
                }
                data = value;
                // Normalize phone by removing country code (+91 or 91) and any leading zeros
                const normalizedPhone = data.phone.toString().replace(/^(\+?91|0+)/, '').trim();
                // console.log("Normalized Phone:", normalizedPhone);
                let clientDoc = await db.get().collection(COLLECTION.LEADS).findOne({ phone: normalizedPhone });

                if(clientDoc == null){
                        return reject("Client not found with the provided phone number");
                }
                const insertResult = await db.get().collection(COLLECTION.CALL_LOG_ACTIVITY).insertOne({
                    type: 'call_event',
                    client_id: clientDoc ? ObjectId(clientDoc._id) : null,
                    officer_id: data.officer_id ? ObjectId(data.officer_id) : null,
                    officer_phone: data.officer_phone || null,
                    phone: normalizedPhone,
                    duration: parseFloat(data.duration || 0),
                    call_type: data.call_type || '',
                    call_status: data.call_status || parseFloat(data.duration || 0) > 0 ? 'ATTENDED' : 'NOT ATTENDED',
                    created_at: new Date()
                });

                if (insertResult.acknowledged) {

                    const lastcall = {
                        _id: insertResult.insertedId,
                        type: "call_event",
                        client_id: clientDoc ? ObjectId(clientDoc._id) : null,
                        officer_id: data.officer_id ? ObjectId(data.officer_id) : null,
                        officer_phone: data.officer_phone || null,
                        phone: normalizedPhone,
                        duration: parseFloat(data.duration || 0),
                        call_status: data.call_status || parseFloat(data.duration || 0) > 0 ? 'ATTENDED' : 'NOT ATTENDED',
                        call_type: data.call_type || '',
                        created_at: new Date()
                    };

                    // Update status if changed
                    if (clientDoc)
                        await db.get().collection(COLLECTION.LEADS).updateOne(
                            { _id: clientDoc ? ObjectId(clientDoc._id) : null },
                            {
                                $set: {
                                    // status: data.client_status,
                                    // dead_lead_reason: data.dead_lead_reason || "",
                                    lastcall
                                }
                            }
                        );


                    resolve("Call event logged successfully");
                } else {
                    reject("Failed to log call event");
                }

            } catch (err) {
                console.error(err);
                reject("Error logging call event");
            }
        });
    },

    getCallLogs: async (query, decoded) => {
        try {
            const {
                page = 1,
                limit = 10,
                call_type,
                call_status,
                employee,
                startDate,
                endDate,
                searchString
            } = query;
            const parsedPage = parseInt(page);
            const parsedLimit = parseInt(limit);
            const skip = (parsedPage - 1) * parsedLimit;
            const filter = {};

            // Admin chec
            const isAdmin = Array.isArray(decoded?.designation) &&
                decoded.designation.includes('ADMIN');

            // Officer filtering logic
            let officerIdList = [];
            if (!isAdmin) {
                officerIdList = Array.isArray(decoded?.officers)
                    ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
                    : [];
            }
            if (employee) {
                filter.officer_id = safeObjectId(employee);
            }
            else if (!isAdmin && officerIdList.length > 0) {
                filter.officer_id = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
            }
            else if (!isAdmin) {
                filter.officer_id = safeObjectId(decoded?._id);
            }
            // Admin sees all, so no officer_id filter for admin

            // Status filter
            if (call_type) filter.call_type = call_type;
            if (call_status) filter.call_status = call_status;

            // Date parsing
            const parseDate = (str) => {
                if (!str) return null;
                const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
                if (match) {
                    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                }
                return new Date(str);
            };

            let start = startDate ? parseDate(startDate) : null;
            let end = endDate ? parseDate(endDate) : null;
            if (end && !isNaN(end)) end.setHours(23, 59, 59, 999);

            if (start || end) {
                filter.created_at = {};
                if (start && !isNaN(start)) filter.created_at.$gte = start;
                if (end && !isNaN(end)) filter.created_at.$lte = end;

                if (Object.keys(filter.created_at).length === 0) {
                    delete filter.created_at;
                }
            }
            // SearchString (phone, name, notes, call_type)
            if (searchString) {
                const searchRegex = new RegExp(searchString, "i");
                filter.$or = [
                    { phone: { $regex: searchRegex } },
                    { notes: { $regex: searchRegex } }
                ];
            }

            const callLogCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);

            const logs = await callLogCollection.aggregate([
                { $match: filter },
                { $sort: { created_at: 1 } },
                {
                    $facet: {
                        data: [

                            { $skip: skip },
                            { $limit: parsedLimit }
                        ],

                        totalCount: [
                            { $count: "count" }
                        ]
                    }
                }
            ]).toArray();

            const result = {
                data: logs[0].data,
                totalCount: logs[0].totalCount.length ? logs[0].totalCount[0].count : 0,
                currentPage: parsedPage,
                limit: parsedLimit,
            };

            return result;

        } catch (err) {
            console.error(err);
            throw "Error fetching call logs";
        }
    },


    getCustomerCallLogs: async (id) => {
        try {

            const result = await db.get().collection(COLLECTION.CALL_LOG_ACTIVITY).aggregate([
                { $match: { client_id: ObjectId(id) } },
                { $sort: { created_at: 1 } },
                {
                    $lookup: {
                        from: COLLECTION.OFFICERS,
                        localField: "officer_id",
                        foreignField: "_id",
                        as: "officer_details"
                    }
                },
                { $unwind: { path: "$officer_details", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        type: 1,
                        client_id: 1,
                        duration: 1,
                        next_schedule: 1,
                        next_shedule_time: 1,
                        comment: 1,
                        call_type: 1,
                        call_status: 1,
                        created_at: 1,
                        officer: {
                            $ifNull: [
                                {
                                    _id: "$officer_details._id",
                                    name: "$officer_details.name",
                                    email: "$officer_details.email",
                                    phone: "$officer_details.phone",
                                    officer_id: "$officer_details.officer_id",
                                    designation: "$officer_details.designation",
                                    // Add other officer fields you need
                                },
                                null
                            ]
                        }
                    }
                }
            ]).toArray();

            return result;
        } catch (err) {
            console.error("Error fetching call logs with officer details:", err);
            throw new Error("Error fetching call logs with officer details");
        }
    },


    updateCallLog: async (logId, updateData) => {
        return new Promise(async (resolve, reject) => {
            try {
                const data = validatePartial(callActivityValidation, updateData);

                const callLogCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
                const leadsCollection = db.get().collection(COLLECTION.LEADS);

                const now = new Date();
                const updateFields = { updated_at: now };

                const allowedFields = [
                    "duration",
                    "next_schedule",
                    "next_shedule_time",
                    "comment",
                    "officer_id"
                ];

                allowedFields.forEach(field => {
                    if (data[field] !== undefined) {
                        if (field === "officer_id") {
                            updateFields[field] = ObjectId.isValid(data.officer_id)
                                ? new ObjectId(data.officer_id)
                                : data.officer_id;
                        }
                        else if (field === "next_schedule") {
                            let nextScheduleDate = null;

                            if (typeof data.next_schedule === "string") {
                                // Case: incoming DD/MM/YYYY
                                const parts = data.next_schedule.split("/");
                                if (parts.length === 3) {
                                    const [day, month, year] = parts;
                                    nextScheduleDate = new Date(
                                        `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`
                                    );
                                }
                            }

                            // If it is already a Date or ISO string, just use it
                            else if (data.next_schedule instanceof Date) {
                                nextScheduleDate = data.next_schedule;
                            }

                            else if (typeof data.next_schedule === "object") {
                                // Example: { $date: "2025-01-10T00:00:00Z" }
                                nextScheduleDate = new Date(data.next_schedule);
                            }

                            else {
                                nextScheduleDate = null;
                            }

                            updateFields[field] = nextScheduleDate;
                        }

                        else {
                            updateFields[field] = data[field];
                        }
                    }
                });

                // 🔹 1. Update the call log entry
                const { value: updatedLog } = await callLogCollection.findOneAndUpdate(
                    { _id: new ObjectId(logId) },
                    { $set: updateFields },
                    { returnDocument: "after" }
                );

                if (!updatedLog) return reject("Call log not found");

                // 🔹 2. Update lastcall inside LEADS only
                const updateInLead = await leadsCollection.updateOne(
                    {
                        _id: updatedLog.client_id,
                        "lastcall._id": new ObjectId(updatedLog._id)
                    },
                    { $set: { lastcall: updatedLog } }
                );

                if (updateInLead.modifiedCount > 0) {
                    return resolve({
                        success: true,
                        collection: "LEADS",
                        lastcallUpdated: true
                    });
                }

                // If call log updated but lastcall not replaced
                resolve({
                    success: true,
                    lastcallUpdated: false,
                    message: "Call log updated, but lastcall not replaced"
                });

            } catch (err) {
                reject({ success: false, error: err.message || err });
            }
        });
    },

    getCustomerActivityLogs: async (id) => {
        try {
            const result = await db.get().collection(COLLECTION.CUSTOMER_ACTIVITY).aggregate([
                { $match: { client_id: ObjectId(id) } },
                // { $sort: { created_at: 1 } },
                {
                    $lookup: {
                        from: COLLECTION.OFFICERS,
                        localField: "officer_id",
                        foreignField: "_id",
                        as: "officer_details"
                    }
                },
                { $unwind: { path: "$officer_details", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        type: 1,
                        client_id: 1,
                        duration: 1,
                        next_schedule: 1,
                        next_shedule_time: 1,
                        comment: 1,
                        call_type: 1,
                        call_status: 1,
                        created_at: 1,
                        officer: {
                            $ifNull: [
                                {
                                    _id: "$officer_details._id",
                                    name: "$officer_details.name",
                                    email: "$officer_details.email",
                                    phone: "$officer_details.phone",
                                    officer_id: "$officer_details.officer_id",
                                    designation: "$officer_details.designation",
                                    // Add other officer fields you need
                                },
                                null
                            ]
                        }
                    }
                }

            ]).toArray();

            return result;
        } catch (err) {
            console.error("Error fetching call logs with officer details:", err);
            throw new Error("Error fetching call logs with officer details");
        }
    },

   getLatestCallLogByPhone: async (phone) => {
    try {
        const normalizedPhone = phone
            .toString()
            .replace(/^(\+?91|0+)/, '')
            .trim();

        const data = await db.get()
            .collection(COLLECTION.CALL_LOG_ACTIVITY)
            .aggregate([
                {
                    $match: { phone: normalizedPhone }
                },
                {
                    $sort: { created_at: -1 }
                },
                {
                    $limit: 1
                },
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
                {
                    $project: {
                        _id: 1,
                        phone: 1,
                        call_type: 1,
                        call_status: 1,
                        comment: 1,
                        duration: 1,
                        created_at: 1,

                        // SAFE lead fields
                        lead_name: { $ifNull: ["$client.name", null] },
                        interested_in: { $ifNull: ["$client.interested_in", null] },
                        status: { $ifNull: ["$client.status", null] }
                    }
                }
            ])
            .toArray();

        return data.length ? data[0] : 'not Client found';

    } catch (err) {
        console.error(err);
        throw new Error("Error fetching latest call log");
    }
},

}




// logCallEvent: async (data, officer_id) => {
//     return new Promise(async (resolve, reject) => {
//         try {
//             if (!data.client_id) return reject("Client ID is required");

//             const clientId = new ObjectId(data.client_id);
//             const leadsCollection = db.get().collection(COLLECTION.LEADS);
//             const customersCollection = db.get().collection(COLLECTION.CUSTOMERS);
//             const deadLeadsCollection = db.get().collection(COLLECTION.DEAD_LEADS);
//             const customerActivityCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);

//             // Try to find client in LEADS, then CUSTOMERS, then DEAD_LEADS
//             let clientDoc = await leadsCollection.findOne({ _id: clientId });
//             let currentCollection = leadsCollection;

//             if (!clientDoc) {
//                 clientDoc = await customersCollection.findOne({ _id: clientId });
//                 currentCollection = customersCollection;
//             }

//             if (!clientDoc) {
//                 clientDoc = await deadLeadsCollection.findOne({ _id: clientId });
//                 currentCollection = deadLeadsCollection;
//             }

//             if (!clientDoc) return reject("Client not found in any collection");

//             // If client is in DEAD_LEADS, just log the call and return
//             if (currentCollection === deadLeadsCollection) {
//                 console.log("Client is in DEAD_LEADS, logging call event only");
//                  var nextScheduleDate = null;
//                 if (data.next_schedule !== null && data.next_schedule !== '') {
//                     const [day, month, year] = (data.next_schedule || '').split('/');
//                      nextScheduleDate = day && month && year
//                     ? new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`)
//                     : null;
//                 }
//                 const logResult = await customerActivityCollection.insertOne({
//                     type: 'call_event',
//                     client_id: ObjectId.isValid(clientId) ? ObjectId(clientId) : null,
//                     officer_id: ObjectId.isValid(officer_id) ? ObjectId(officer_id) : null,
//                     duration: data.duration || 0,
//                     next_schedule: nextScheduleDate,
//                     next_shedule_time: data.next_shedule_time || null,
//                     comment: data.comment || '',
//                     call_type: data.call_type || '',
//                     call_status: data.call_status || '',
//                     created_at: new Date()
//                 });
//                 return logResult.acknowledged
//                     ? resolve("Call event logged ")
//                     : reject("Failed to log call event ");
//             }

//             // Handle status changes if provided (only for non-dead leads)
//             if (
//                 data.client_status &&
//                 data.client_status !== 'null' &&
//                 data.client_status !== '' &&
//                 clientDoc.status !== data.client_status
//             ) {
//                 const status = data.client_status;

//                 if (status === STATUSES.DEAD && currentCollection !== deadLeadsCollection) {
//                     const insertResult = await deadLeadsCollection.insertOne({
//                         ...clientDoc,
//                         status: STATUSES.DEAD,
//                         moved_to_dead_at: new Date(),
//                         dead_reason: data.comment || ''
//                     });
//                     if (!insertResult.acknowledged) return reject("Failed to move to DEAD_LEADS");
//                     await currentCollection.deleteOne({ _id: clientId });
//                 }
//                 else if (status === STATUSES.REGISTER && currentCollection !== customersCollection) {
//                     const new_client_id = `AECID${String(await getNextSequence("customer_id")).padStart(5, "0")}`;
//                     clientDoc.client_id = new_client_id;
//                     const insertResult = await customersCollection.insertOne({
//                         ...clientDoc,
//                         status: status,
//                     });

//                     if (!insertResult.acknowledged) return reject("Failed to move to CUSTOMERS");
//                     await currentCollection.deleteOne({ _id: clientId });
//                 }
//                 else {
//                     await currentCollection.updateOne(
//                         { _id: clientId },
//                         { $set: { status: status } }
//                     );
//                 }

//                 // Log the status update activity
//                 await module.exports.logActivity({
//                     type: 'status_update',
//                     client_id: clientId,
//                     recruiter_id: clientDoc.recruiter_id || null,
//                     officer_id: officer_id || null,
//                     client_status: status,
//                     comment: data.comment || ''
//                 });
//             }



//             const logResult = await customerActivityCollection.insertOne({
//                 type: 'call_event',
//                 client_id: ObjectId.isValid(clientId) ? ObjectId(clientId) : null,
//                 officer_id: ObjectId.isValid(officer_id) ? ObjectId(officer_id) : null,
//                 duration: data.duration || 0,
//                 next_schedule: data.next_schedule || null,
//                 next_shedule_time: data.next_shedule_time || null,
//                 comment: data.comment || '',
//                 call_type: data.call_type || '',
//                 call_status: data.call_status || '',
//                 created_at: new Date()
//             });
//             if (logResult.acknowledged) {
//                 resolve("Call event logged successfully");
//             } else {
//                 reject("Failed to log call event");
//             }
//         } catch (err) {
//             console.error(err);
//             reject("Error logging call event");
//         }
//     });
// },


// updateCallLog: async (logId, data) => {
//     try {
//         const collection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
//         const updateFields = { updated_at: new Date() };

//         const allowedFields = [
//             'duration', 'next_schedule', 'next_shedule_time',
//             'comment'
//         ];
//         allowedFields.forEach(field => {
//             if (data[field] !== undefined) {
//                 updateFields[field] = field === 'officer_id'
//                     ? (ObjectId.isValid(data.officer_id) ? new ObjectId(data.officer_id) : null)
//                     : data[field];
//             }
//         });

//         // Execute update
//         const result = await collection.updateOne(
//             { _id: new ObjectId(logId) },
//             { $set: updateFields }
//         );

//         if (!result.matchedCount) throw new Error("Call log not found");

//         return { success: true, updated: result.modifiedCount > 0 };
//     } catch (err) {
//         console.error("Update error:", err);
//         throw new Error(err.message || "Failed to update call log");
//     }
// },
