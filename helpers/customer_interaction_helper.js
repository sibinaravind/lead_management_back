var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { leadSchema } = require("../validations/leadValidation");
const validatePartial = require("../utils/validatePartial");
const { DESIGNATIONS, STATUSES } = require('../constants/enums');
// Helper to get next sequence number

module.exports = {
    logCallEvent: async (data, officerId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const customersCollection = db.get().collection(COLLECTION.LEADS);

                if (data.client_status && (data.client_status != null || data.client_status !== '')) {
                    if (data.client_status === STATUSES.DEAD) {
                        // Move to DEAD_LEADS
                        const clientDoc = await customersCollection.findOne({ _id: new ObjectId(data.client_id) });
                        if (clientDoc) {
                            clientDoc.status = STATUSES.DEAD;
                        }
                        if (clientDoc) {
                            const insertResult = await db.get().collection(COLLECTION.DEAD_LEADS).insertOne({
                                ...clientDoc,
                                // status : 'DEAD',
                                moved_to_dead_at: new Date(),
                                dead_reason: data.comment || '',
                                moved_by: officerId
                            });

                            if (insertResult.acknowledged) {
                                await customersCollection.deleteOne({ _id: new ObjectId(data.client_id) });
                                data.status = data.client_status;
                            } else {
                                return reject("Failed to do action");
                            }
                        }
                        else {
                            return reject("Client not found");
                        }
                    }
                     else if (data.client_status === STATUSES.REGISTER) {
                        // Move to DEAD_LEADS
                        const clientDoc = await customersCollection.findOne({ _id: new ObjectId(data.client_id) });
                        if (clientDoc) {
                            clientDoc.status = data.client_status;
                        }
                        if (clientDoc) {
                            const insertResult = await db.get().collection(COLLECTION.CUSTOMERS).insertOne({
                                ...clientDoc,
                                // status : 'DEAD',
                            });

                            if (insertResult.acknowledged) {
                                await customersCollection.deleteOne({ _id: new ObjectId(data.client_id) });
                                data.status = data.client_status;
                            } else {
                                return reject("Failed to do action");
                            }
                        }
                        else {
                            return reject("Client not found");
                        }
                    }

                    else {
                        // Update status
                        const updateResult = await customersCollection.updateOne(
                            { _id: new ObjectId(data.client_id) },
                            { $set: { status: data.client_status } }
                        );
                        console.log("Update result:", updateResult);
                        // if (updateResult.modifiedCount === 0) {
                        //     return reject("Failed to update client status");
                        // }
                    }
                }

                // Log the call event only after successful status update/move
                const insertResult = await db.get().collection(COLLECTION.CUSTOMER_ACTIVITY).insertOne({
                    type: 'call_event',
                    client_id: new ObjectId(data.client_id),
                    officer_id: officerId,
                    duration: data.duration || 0,
                    next_schedule: data.next_schedule || null,
                    client_status: data.client_status || '',
                    comment: data.comment || '',
                    call_type: data.call_type || '',
                    call_status: data.call_status || '',
                    created_at: new Date()
                });

                if (insertResult.acknowledged) {
                
                    resolve(
                        "Call event logged successfully"
                    );
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
            const customersCollection = db.get().collection(COLLECTION.LEADS);
            const deadCustomersCollection = db.get().collection(COLLECTION.DEAD_LEADS);
            const callLogCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
            const normalizedPhone = data.phone.toString().replace(/^\+?91/, '').trim();
            const clientDoc = await customersCollection.findOne({
                phone: normalizedPhone
            });

            // Optional: check DEAD_LEADS for same phone
            if (clientDoc) {
                await deadCustomersCollection.findOne({ phone: normalizedPhone });
            }

            // 📞 Log the call event
            const insertResult = await callLogCollection.insertOne({
                type: 'call_event',
                client_id: clientDoc ? clientDoc._id : null,
                officer_id: data.officer_id || null,
                received_phone: data.received_phone || null,
                phone: normalizedPhone, // Store the normalized phone
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

}