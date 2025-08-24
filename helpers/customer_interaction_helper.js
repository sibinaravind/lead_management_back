var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const { STATUSES } = require('../constants/enums');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { callActivityValidation, mobilecallLogValidation } = require('../validations/callActivityValidation');
const validatePartial = require("../utils/validatePartial");
module.exports = {
    logActivity: async ({
        type,
        client_id,
        officer_id = null,
        recruiter_id = null,
        assigned_by = null,
        comment = null,
        client_status = null
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

            const validRecruiterId = safeObjectId(recruiter_id);
            if (validRecruiterId) data.recruiter_id = validRecruiterId;

            const validAssignedById = safeObjectId(assigned_by);
            if (validAssignedById) data.assigned_by = validAssignedById;

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
                const { error, value } = callActivityValidation.validate(data);
                if (error) {
                    return reject("Validation failed: " + error.details[0].message);
                }
                data = value; // Use validated data
                if (!data.client_id) return reject("Client ID is required");
                const clientId = new ObjectId(data.client_id);
                const leadsCollection = db.get().collection(COLLECTION.LEADS);
                const customersCollection = db.get().collection(COLLECTION.CUSTOMERS);
                const deadLeadsCollection = db.get().collection(COLLECTION.DEAD_LEADS);
                const customerActivityCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);

                // Lookup client
                let clientDoc = await leadsCollection.findOne({ _id: clientId });
                let currentCollection = leadsCollection;

                if (!clientDoc) {
                    clientDoc = await customersCollection.findOne({ _id: clientId });
                    currentCollection = customersCollection;
                }

                if (!clientDoc) {
                    clientDoc = await deadLeadsCollection.findOne({ _id: clientId });
                    currentCollection = deadLeadsCollection;
                }
                if (!clientDoc) return reject("Client not found in any collection");
                // Parse next_schedule (dd/mm/yyyy to ISO)
                let nextScheduleDate = data.next_schedule;
                // if (data.next_schedule) {
                //     const [day, month, year] = data.next_schedule.split('/');
                //     if (day && month && year) {
                //         nextScheduleDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
                //     }
                // }
                // Insert call event
                const logResult = await customerActivityCollection.insertOne({
                    type: 'call_event',
                    client_id: clientId,
                    officer_id: ObjectId.isValid(officer_id) ? new ObjectId(officer_id) : null,
                    duration: data.duration || 0,
                    next_schedule: nextScheduleDate,
                    next_shedule_time: data.next_shedule_time || null,
                    comment: data.comment || '',
                    call_type: data.call_type || '',
                    call_status: data.call_status || '',
                    created_at: new Date()
                });

                if (!logResult.acknowledged) return reject("Failed to log call event");

                const lastcall = {
                    _id: logResult.insertedId,
                    type: 'call_event',
                    client_id: clientId,
                    officer_id: ObjectId.isValid(officer_id) ? new ObjectId(officer_id) : null,
                    duration: data.duration || 0,
                    next_schedule: nextScheduleDate,
                    next_shedule_time: data.next_shedule_time || null,
                    comment: data.comment || '',
                    call_type: data.call_type || '',
                    call_status: data.call_status || '',
                    created_at: new Date()
                };
                // Status update
                if (
                    data.client_status &&
                    data.client_status !== 'null' &&
                    data.client_status !== '' &&
                    clientDoc.status !== data.client_status && currentCollection !== deadLeadsCollection
                ) {
                    const newStatus = data.client_status;
                    if (newStatus === STATUSES.DEAD && currentCollection !== deadLeadsCollection) {
                        const insertResult = await deadLeadsCollection.insertOne({
                            ...clientDoc,
                            status: newStatus,
                            lastcall,
                            dead_lead_reason: data.dead_lead_reason || '',
                            moved_to_dead_at: new Date(),
                            dead_reason: data.comment || ''
                        });
                        if (!insertResult.acknowledged) return reject("Failed to move to DEAD_LEADS");
                        await currentCollection.deleteOne({ _id: clientId });

                        await module.exports.logActivity({
                            type: 'status_update',
                            client_id: clientId,
                            recruiter_id: clientDoc.recruiter_id || null,
                            officer_id: officer_id || null,
                            client_status: newStatus,
                            comment: data.comment || ''
                        });

                        return resolve("Moved to DEAD_LEADS and call logged");
                    }

                    if (newStatus === STATUSES.REGISTER && currentCollection !== customersCollection) {
                        const new_client_id = `AECID${String(await getNextSequence("customer_id")).padStart(5, "0")}`;
                        clientDoc.client_id = new_client_id;

                        const insertResult = await customersCollection.insertOne({
                            ...clientDoc,
                            lastcall,
                            status: newStatus
                        });

                        if (!insertResult.acknowledged) return reject("Failed to move to CUSTOMERS");
                        await currentCollection.deleteOne({ _id: clientId });

                        await module.exports.logActivity({
                            type: 'status_update',
                            client_id: clientId,
                            recruiter_id: clientDoc.recruiter_id || null,
                            officer_id: officer_id || null,
                            client_status: newStatus,
                            comment: data.comment || ''
                        });

                        return resolve("Moved to CUSTOMERS and call logged");
                    }
                    // Simple status update
                    await currentCollection.updateOne(
                        { _id: clientId },
                        { $set: { status: newStatus, lastcall } }
                    );
                    await module.exports.logActivity({
                        type: 'status_update',
                        client_id: clientId,
                        recruiter_id: clientDoc.recruiter_id || null,
                        officer_id: officer_id || null,
                        client_status: newStatus,
                        comment: data.comment || ''
                    });
                    return resolve("Client status updated and call logged");
                }
                // No status change, just update lastcall
                await currentCollection.updateOne({ _id: clientId }, { $set: { lastcall } });

                resolve("Call event logged and client updated");
            } catch (err) {
                console.error(err);
                reject("Error logging call event");
            }
        });
    },

   CRETeamCallEvent: async (data, officer_id) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Validate input
            console.log("CRETeamCallEvent data:", officer_id);
            const { error, value } = callActivityValidation.validate(data);
            if (error) return reject("Validation failed: " + error.details[0].message);
            data = value;

            if (!data.client_id) return reject("Client ID is required");
            const clientId = new ObjectId(data.client_id);
            const leadsCollection = db.get().collection(COLLECTION.LEADS);
            const deadLeadsCollection = db.get().collection(COLLECTION.DEAD_LEADS);
            const activityCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
            // Fetch client
            const clientDoc = await leadsCollection.findOne({ _id: clientId });
            if (!clientDoc) return reject("Client not found in LEADS collection");

            const nextScheduleDate = data.next_schedule || null;
            const callEntry = {
                type: 'call_event',
                client_id: clientId,
                officer_id: ObjectId.isValid(officer_id) ? new ObjectId(officer_id) : null,
                duration: data.duration || 0,
                next_schedule: nextScheduleDate,
                next_shedule_time: data.next_shedule_time || null,
                comment: data.comment || '',
                call_type: data.call_type || '',
                call_status: data.call_status || '',
                created_at: new Date()
            };
            // Log call
            const logResult = await activityCollection.insertOne(callEntry);
            if (!logResult.acknowledged) return reject("Failed to log call event");
            const lastcall = { ...callEntry, _id: logResult.insertedId };
            const newStatus = data.client_status;
            const hasStatusChange = newStatus &&
                newStatus !== 'null' &&
                newStatus !== '' &&
                clientDoc.status !== newStatus;

            if (hasStatusChange) {
                // DEAD → Move to DEAD_LEADS
                if (newStatus === STATUSES.DEAD) {
                    const insertResult = await deadLeadsCollection.insertOne({
                        ...clientDoc,
                        status: newStatus,
                        lastcall,
                        dead_lead_reason: data.dead_lead_reason || '',
                        moved_to_dead_at: new Date(),
                        dead_reason: data.comment || ''
                    });

                    if (!insertResult.acknowledged) return reject("Failed to move to DEAD_LEADS");
                    await leadsCollection.deleteOne({ _id: clientId });
                    await module.exports.logActivity({
                        type: 'status_update',
                        client_id: clientId,
                        recruiter_id: clientDoc.recruiter_id || null,
                        officer_id: officer_id || null,
                        client_status: newStatus,
                        comment: data.comment || ''
                    });
                    return resolve("Moved to DEAD_LEADS and call logged");
                }

                // INTERESTED → update & remove from leads (assumed to be moved to another collection)
                if (newStatus === STATUSES.INTRESTED) {
                    const updateResult = await leadsCollection.updateOne(
                        { _id: clientId },
                        {
                            $set: {
                                status: newStatus,
                                lastcall,
                                officer_id: clientDoc.recruiter_id || 'UNASSIGNED',
                                updated_at: new Date()
                            }
                        }
                    );
                    if (!updateResult.acknowledged) return reject("Failed to update lead");
                    await module.exports.logActivity({
                        type: 'status_update',
                        client_id: clientId,
                        recruiter_id: clientDoc.recruiter_id || null,
                        officer_id: officer_id || null,
                        client_status: newStatus,
                        comment: data.comment || ''
                    });
                    return resolve("Moved to RECRUITER and call logged");
                }

                // Simple status update
                await leadsCollection.updateOne(
                    { _id: clientId },
                    { $set: { status: newStatus, lastcall , updated_at: new Date()} }
                );
                await module.exports.logActivity({
                    type: 'status_update',
                    client_id: clientId,
                    recruiter_id: clientDoc.recruiter_id || null,
                    officer_id: officer_id || null,
                    client_status: newStatus,
                    comment: data.comment || ''
                });

                return resolve("Client status updated and call logged");
            }
            // No status change → just update lastcall
            await leadsCollection.updateOne({ _id: clientId }, { $set: { lastcall } });
            return resolve("Call event logged and client updated");
        } catch (err) {
            console.error("CRETeamCallEvent Error:", err);
            return reject("Error logging call event");
        }
    });
},

    logMobileCallEvent: async (data) => {
        return new Promise(async (resolve, reject) => {
            try {
                const { error, value } = mobilecallLogValidation.validate(data);
                if (error) {
                    return reject("Validation failed: " + error.details[0].message);
                }
                data = value;
                const normalizedPhone = data.phone.toString().replace(/^\+?91/, '').trim();
                const customersCollection = db.get().collection(COLLECTION.CUSTOMERS);
                const leadsCollection = db.get().collection(COLLECTION.LEADS);
                const deadLeadsCollection = db.get().collection(COLLECTION.DEAD_LEADS);
                const callLogCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
                let clientDoc = await leadsCollection.findOne({ phone: normalizedPhone });
                if (!clientDoc) {
                    clientDoc = await customersCollection.findOne({ phone: normalizedPhone });
                }
                if (!clientDoc) {
                    clientDoc = await deadLeadsCollection.findOne({ phone: normalizedPhone });
                }

                const insertResult = await callLogCollection.insertOne({
                    type: 'call_event',
                    client_id: clientDoc ? ObjectId(clientDoc._id) : null,
                    officer_id: data.officer_id ? ObjectId(data.officer_id) : null,
                    received_phone: data.received_phone || null,
                    phone: normalizedPhone,
                    duration: parseFloat(data.duration || 0),
                    call_type: data.call_type || '',
                    created_at: new Date()
                });

                if (insertResult.acknowledged) {
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

    getCallLogs: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                const callLogCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
                const logs = await callLogCollection.find()
                    .sort({ created_at: -1 })
                    .toArray();
                resolve(logs);
            } catch (err) {
                console.error(err);
                reject("Error fetching call logs");
            }
        });
    },

    getCustomerCallLogs: async (id) => {
        try {

            const result = await db.get().collection(COLLECTION.CALL_LOG_ACTIVITY).aggregate([
                { $match: { client_id: ObjectId(id) } },
                { $sort: { created_at: -1 } },
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
                const clientsCollection = db.get().collection(COLLECTION.CUSTOMERS);
                const deadCollection = db.get().collection(COLLECTION.DEAD_LEADS);
                // Print the client document for debugging
                const now = new Date();
                const updateFields = { updated_at: now };

                const allowedFields = ['duration', 'next_schedule', 'next_shedule_time', 'comment', 'officer_id'];
                allowedFields.forEach(field => {
                    if (data[field] !== undefined) {
                        if (field === 'officer_id') {
                            updateFields[field] = ObjectId.isValid(data.officer_id)
                                ? new ObjectId(data.officer_id)
                                : data.officer_id;
                        } if (field === 'next_schedule') {
                            let nextScheduleDate = null;
                            if (data.next_schedule) {
                                const [day, month, year] = data.next_schedule.split('/');
                                if (day && month && year) {
                                    nextScheduleDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
                                }
                            }
                            updateFields[field] = nextScheduleDate; // Ensure it's a Date object
                        }

                        else {
                            updateFields[field] = data[field];
                        }
                    }
                });
                // 1. Update the call log
                const { value: updatedLog } = await callLogCollection.findOneAndUpdate(
                    { _id: new ObjectId(logId) },
                    { $set: updateFields },
                    { returnDocument: 'after' }
                );

                if (!updatedLog) return reject(new Error('Call log not found'));
                // console.log("Updated Call Log:", updatedLog);

                const collectionsToTry = [
                    { name: 'LEADS', collection: leadsCollection },
                    { name: 'CUSTOMERS', collection: clientsCollection },
                    { name: 'DEAD', collection: deadCollection }
                ];
                for (const { name, collection } of collectionsToTry) {
                    const result = await collection.updateOne({
                        _id: updatedLog.client_id,
                        $or: [
                            { 'lastcall._id': new ObjectId(updatedLog._id) },
                            { 'lastcall.next_schedule': { $lt: updatedLog.next_schedule } },
                            // { latest_call: { $exists: false } }
                        ]
                    }, { $set: { lastcall: updatedLog } });
                    console.log(`Updated in ${name} collection:`, result);
                    if (result.modifiedCount > 0) {
                        return resolve({ success: true, collection: name });
                    }
                }
                // No collection matched for latest_call update, but call log itself was updated
                resolve({ updated: false, message: 'Call log updated, but latest_call not replaced in any collection' });

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
