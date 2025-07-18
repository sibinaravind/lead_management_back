var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const { STATUSES } = require('../constants/enums');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
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
                if (!data.client_id) return reject("Client ID is required");

                const clientId = new ObjectId(data.client_id);
                const leadsCollection = db.get().collection(COLLECTION.LEADS);
                const customersCollection = db.get().collection(COLLECTION.CUSTOMERS);
                const deadLeadsCollection = db.get().collection(COLLECTION.DEAD_LEADS);
                const customerActivityCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);

                // Try to find client in LEADS, then CUSTOMERS, then DEAD_LEADS
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

                // If client is in DEAD_LEADS, just log the call and return
                if (currentCollection === deadLeadsCollection) {
                    console.log("Client is in DEAD_LEADS, logging call event only");

                    const logResult = await customerActivityCollection.insertOne({
                        type: 'call_event',
                        client_id: ObjectId.isValid(clientId) ? ObjectId(clientId) : null,
                        officer_id: ObjectId.isValid(officer_id) ? ObjectId(officer_id) : null,
                        duration: data.duration || 0,
                        next_schedule: data.next_schedule || null,
                        next_shedule_time: data.next_shedule_time || null,
                        comment: data.comment || '',
                        call_type: data.call_type || '',
                        call_status: data.call_status || '',
                        created_at: new Date()
                    });
                    return logResult.acknowledged
                        ? resolve("Call event logged ")
                        : reject("Failed to log call event ");
                }

                // Handle status changes if provided (only for non-dead leads)
                if (
                    data.client_status &&
                    data.client_status !== 'null' &&
                    data.client_status !== '' &&
                    clientDoc.status !== data.client_status
                ) {
                    const status = data.client_status;

                    if (status === STATUSES.DEAD && currentCollection !== deadLeadsCollection) {
                        const insertResult = await deadLeadsCollection.insertOne({
                            ...clientDoc,
                            status: STATUSES.DEAD,
                            moved_to_dead_at: new Date(),
                            dead_reason: data.comment || ''
                        });
                        if (!insertResult.acknowledged) return reject("Failed to move to DEAD_LEADS");
                        await currentCollection.deleteOne({ _id: clientId });
                    }
                    else if (status === STATUSES.REGISTER && currentCollection !== customersCollection) {
                        const new_client_id = `AECID${String(await getNextSequence("customer_id")).padStart(5, "0")}`;
                        clientDoc.client_id = new_client_id;
                        const insertResult = await customersCollection.insertOne({
                            ...clientDoc,
                            status: status,
                        });

                        if (!insertResult.acknowledged) return reject("Failed to move to CUSTOMERS");
                        await currentCollection.deleteOne({ _id: clientId });
                    }
                    else {
                        await currentCollection.updateOne(
                            { _id: clientId },
                            { $set: { status: status } }
                        );
                    }

                    // Log the status update activity
                    await module.exports.logActivity({
                        type: 'status_update',
                        client_id: clientId,
                        recruiter_id: clientDoc.recruiter_id || null,
                        officer_id: officer_id || null,
                        client_status: status,
                        comment: data.comment || ''
                    });
                }



                const logResult = await customerActivityCollection.insertOne({
                    type: 'call_event',
                    client_id: ObjectId.isValid(clientId) ? ObjectId(clientId) : null,
                    officer_id: ObjectId.isValid(officer_id) ? ObjectId(officer_id) : null,
                    duration: data.duration || 0,
                    next_schedule: data.next_schedule || null,
                    next_shedule_time: data.next_shedule_time || null,
                    comment: data.comment || '',
                    call_type: data.call_type || '',
                    call_status: data.call_status || '',
                    created_at: new Date()
                });
                if (logResult.acknowledged) {
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

    logMobileCallEvent: async (data) => {
        return new Promise(async (resolve, reject) => {
            try {
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
                        from:COLLECTION.OFFICERS, 
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
                                    phone: "$officer_details.phone"
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