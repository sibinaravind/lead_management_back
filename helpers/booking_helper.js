var db = require('../config/connection');
let COLLECTION = require('../config/collections');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { STATUSES, BOOKING_STATUSES } = require('../constants/enums');
const { bookingSchema, paymentScheduleSchema } = require("../validations/bookingValidation");
const { safeObjectId } = require('../utils/safeObjectId');
const { logActivity } = require('./customer_interaction_helper');
const validatePartial = require("../utils/validatePartial");
const { ObjectId } = require('mongodb');
const fileUploader = require('../utils/fileUploader');
const path = require('path');
var fs = require('fs');
function cleanObject(obj) {
    return Object.fromEntries(
        Object.entries(obj || {}).filter(([_, v]) =>
            v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")
        )
    );
}

module.exports = {
    createBooking: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
                var { error, value } = bookingSchema.validate(details);
                if (error) return reject("Validation failed: " + error.details[0].message);
                value = cleanObject(value);
                details = value;
                const collection = db.get().collection(COLLECTION.BOOKINGS);
                const newNumber = await getNextSequence('booking_id');
                const booking_no = `AEBK${String(newNumber).padStart(6, '0')}`;

                if (!details.status) {
                    details.status = BOOKING_STATUSES.PROCESSING;
                }
                // const status_history = [{
                //     status: details.status,
                //     changed_at: new Date(),
                //     changed_by: details.officer_id || null,
                // }];

                const result = await collection.insertOne({
                    booking_no: booking_no,
                    ...details,
                    // status_history: status_history,
                    created_at: new Date(),
                    updated_at: new Date()
                });
                logActivity({
                    type: "booked_product",
                    client_id: safeObjectId(details.customer_id),
                    officer_id: safeObjectId(details.officer_id),
                    referrer_id: safeObjectId(result.insertedId),
                    comment: " Booked Product: " + details.product_name + " for : " + details.grand_total,
                });
                resolve({
                    insertedId: result.insertedId,
                    booking_no
                });

            } catch (err) {
                console.error(err);
                reject(err.message || "Error processing request");
            }
        });
    },

    editBooking: async (bookingId, updateData, officer_id) => {
        try {
            // Validate input
            const validatedData = validatePartial(bookingSchema, updateData);
            const updateResult = await db.get().collection(COLLECTION.BOOKINGS).updateOne(
                { _id: ObjectId(bookingId) },
                { $set: { ...validatedData, updated_at: new Date() } }
            );
            if (updateResult.matchedCount === 0) {
                throw new Error("Booking not found");
            }
            return { success: true, message: "Lead updated successfully" };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },
    getBookingById: async (id) => {
        return new Promise(async (resolve, reject) => {
            try {
                const objectId = safeObjectId(id);
                if (!objectId) return reject("Invalid booking ID");

                const collection = db.get().collection(COLLECTION.BOOKINGS);

                const booking = await collection.findOne({ _id: objectId });

                if (!booking) return reject("Booking not found");

                resolve(booking);

            } catch (err) {
                console.error(err);
                reject(err.message || "Error fetching booking");
            }
        });
    },

    getAllBookings: async (query, decoded) => {
        try {
            const {
                customer_id,
                product_id,
                status,
                from_date,
                to_date,
                search,
                page = 1,
                limit = 10,
                officer,
                branch,
            } = query;

            const parsedPage = parseInt(page);
            const parsedLimit = parseInt(limit);
            const skip = (parsedPage - 1) * parsedLimit;
            const collection = db.get().collection(COLLECTION.BOOKINGS);

            const filter = {};

            if (customer_id) filter.customer_id = customer_id;
            if (product_id) filter.product_id = product_id;
            if (status) filter.status = status;
            if (branch) filter.branch = branch;

            // Officer filter
            const isAdmin = decoded?.roles?.includes("ADMIN");
            let officerIdList = [];
            if (!isAdmin) {
                officerIdList = Array.isArray(decoded?.officers)
                    ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
                    : [];
            }
            if (officer) {

                filter.officer_id = safeObjectId(officer);
            }
            else if (isAdmin) {
                // make it empty          
            }
            else if (officerIdList.length > 0) {
                filter.officer_id = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
            } else if (decoded?._id != null) {
                filter.officer_id = safeObjectId(decoded?._id);
            }

            // Date range filter
            if (from_date || to_date) {
                const parseDate = (str) => {
                    if (!str) return null;
                    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
                    if (match) {
                        return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                    }
                    return new Date(str);
                };
                filter.created_at = {};
                if (from_date) filter.created_at.$gte = parseDate(from_date);
                if (to_date) {
                    const end = parseDate(to_date);
                    end.setHours(23, 59, 59, 999);
                    filter.created_at.$lte = end;
                }
            }
            // Search filter
            if (search) {
                const searchRegex = new RegExp(search, "i");
                filter.$or = [
                    { customer_name: { $regex: searchRegex } },
                    { product_name: { $regex: searchRegex } },
                    { booking_no: { $regex: searchRegex } },
                ];
            }

            // -------------------------
            // AGGREGATION PIPELINE
            // -------------------------
            const result = await collection
                .aggregate([
                    { $match: filter },
                    {
                        $facet: {
                            data: [
                                { $sort: { createdAt: -1 } },
                                { $skip: skip },
                                { $limit: parsedLimit },
                                // Lookup customer (optional)
                                {
                                    $lookup: {
                                        from: COLLECTION.OFFICERS,
                                        localField: "officer_id",
                                        foreignField: "_id",
                                        as: "officers",
                                    },
                                },
                                { $unwind: { path: "$officers", preserveNullAndEmptyArrays: true } },
                                // Projection
                                {
                                    $project: {
                                        _id: 1,
                                        booking_date: 1,
                                        expected_closure_date: 1,
                                        booking_no: 1,
                                        customer_id: 1,
                                        customer_name: 1,
                                        product_id: 1,
                                        product_name: 1,
                                        total_amount: 1,
                                        grand_total: 1,
                                        status: 1,
                                        officer_id: 1,
                                        created_at: 1,
                                        officers_name: "$officers.name",
                                        officers_id: "$officers.officer_id",
                                        payed: {
                                            $sum: {
                                                $map: {
                                                    input: "$payment_schedule",
                                                    as: "p",
                                                    in: {
                                                        $cond: [
                                                            { $eq: ["$$p.status", "PAID"] },
                                                            "$$p.amount",
                                                            0
                                                        ]
                                                    }
                                                }
                                            }
                                        }

                                    },
                                },
                            ],
                            totalCount: [{ $count: "count" }],
                            grandTotal: [
                                { $group: { _id: null, total: { $sum: "$totalAmount" } } },
                            ],
                        },
                    },
                ])
                .toArray();

            const bookingData = result[0]?.data || [];
            const totalCount = result[0]?.totalCount?.[0]?.count || 0;
            const grandTotal = result[0]?.grandTotal?.[0]?.total || 0;

            return {
                bookings: bookingData,
                page: parsedPage,
                limit: parsedLimit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / parsedLimit),
                grand_total: grandTotal,
            };
        } catch (err) {
            throw new Error(err.message || "Error fetching bookings");
        }
    },

    addPayment: async (id, paymentData) => {
        return new Promise(async (resolve, reject) => {
            try {

                var { error, value } = paymentScheduleSchema.validate(paymentData);
                if (error) return reject("Validation failed: " + error.details[0].message);
                paymentData = cleanObject(value);
                const objectId = safeObjectId(id);
                if (!objectId) return reject("Invalid booking ID");
                const collection = db.get().collection(COLLECTION.BOOKINGS);

                await collection.updateOne(
                    { _id: objectId },
                    {
                        $push: { payment_schedule: paymentData },
                        $set: { updated_at: new Date() }
                    }
                ).then((updateResult) => {
                    if (updateResult.modifiedCount === 0) {
                        return reject("Payment not added");
                    }
                    resolve({ success: true, message: "Payment added successfully" });
                });
            } catch (err) {
                console.error(err);
                reject(err.message || "Error adding payment");
            }
        });
    },

    updatePayment: async (bookingId, updateData) => {
        return new Promise(async (resolve, reject) => {
            try {
                // Validate update body (partial allowed)
                const updatePayload = validatePartial(paymentScheduleSchema, updateData);

                if (!bookingId) return reject("Invalid booking ID");
                if (!updatePayload.id) return reject("Invalid payment ID");
                console.log("Update Payload:", updatePayload);
                await db.get().collection(COLLECTION.BOOKINGS).updateOne(
                    {
                        _id: safeObjectId(bookingId),
                        "payment_schedule.id": updatePayload.id
                    },
                    {
                        $set: {
                            "payment_schedule.$": {
                                ...updatePayload,
                            },
                            updated_at: new Date()
                        }
                    }
                ).then((updateResult) => {
                    if (updateResult.modifiedCount === 0) {
                        return reject("Payment not found or no changes applied");
                    }
                    resolve({
                        success: true,
                        message: "Payment updated successfully"
                    });
                });

            } catch (err) {
                console.error(err);
                reject(err.message || "Error updating payment");
            }
        });
    },

    uploadBookingDocument: (id, { doc_type, base64 }) => {
        let filePath = null;
        console.log("Starting document upload for lead ID:", id);
        return new Promise(async (resolve, reject) => {
            try {
                if (!doc_type || !base64) {
                    return reject("Missing required fields for document upload.");
                }
                const collection = db.get().collection(COLLECTION.BOOKINGS);
                // 🔍 Check if document with this type already exists
                const existing = await collection.findOne(
                    { _id: ObjectId(id), "documents.doc_type": doc_type },
                    { projection: { "documents.$": 1 } }
                );
                let oldFilePath = null;
                if (existing?.documents?.[0]?.file_path) {
                    oldFilePath = existing.documents[0].file_path;
                }
                // 📂 Save the new file
                filePath = await fileUploader.processAndStoreBase64File({
                    base64Data: base64,
                    originalName: doc_type,
                    clientName: `booking_${id}`,
                    uploadsDir: "uploads/booking_documents"
                });

                let updateResult;

                if (existing) {
                    // 📝 Update existing document
                    updateResult = await collection.updateOne(
                        { _id: ObjectId(id), "documents.doc_type": doc_type },
                        {
                            $set: {
                                "documents.$.file_path": filePath,
                                "documents.$.uploaded_at": new Date(),
                                updated_at: new Date()
                            }
                        }
                    );
                } else {
                    console.log("Adding new document entry for doc_type:", doc_type);
                    // ➕ Add new document entry if it doesn't exist
                    updateResult = await collection.updateOne(
                        { _id: ObjectId(id) },
                        {
                            $push: {
                                documents: {
                                    doc_type,
                                    file_path: filePath,
                                    uploaded_at: new Date()
                                }
                            },
                            $set: { updated_at: new Date() }
                        }
                    );
                }

                console.log("Update Result:", updateResult);

                if (updateResult.matchedCount === 0) {
                    // Rollback uploaded file if DB update fails
                    if (filePath) {
                        await fs.promises.unlink(path.resolve(filePath)).catch(() => { });
                    }
                    return reject(`Failed to update or add document for "${doc_type}".`);
                }

                // 🗑️ Remove old file if replaced
                if (oldFilePath) {
                    await fs.promises.unlink(path.resolve(oldFilePath)).catch((err) => {
                        console.warn("Failed to remove old file:", err.message);
                    });
                }

                resolve({ success: true, file_path: filePath });
            } catch (err) {
                console.log("Error occurred while uploading document:", err);
                // Rollback uploaded file if error
                if (filePath) {
                    await fs.promises.unlink(path.resolve(filePath)).catch(() => { });
                }
                reject("Error uploading document: " + (err.message || err));
            }
        });
    },

    deleteBookingDocument: async (bookingId, docType) => {
        try {
            if (!bookingId || !docType) {
                throw new Error("Missing booking ID or document type.");
            }
            const collection = db.get().collection(COLLECTION.BOOKINGS);

            // Find the document entry
            const booking = await collection.findOne(
                { _id: ObjectId(bookingId), "documents.doc_type": docType },
                { projection: { "documents.$": 1 } }
            );
            const doc = booking?.documents?.[0];
            if (!doc) {
                throw new Error("Document not found.");
            }

            // Remove the document entry from the array
            const updateResult = await collection.updateOne(
                { _id: ObjectId(bookingId) },
                {
                    $pull: { documents: { doc_type: docType } },
                    $set: { updated_at: new Date() }
                }
            );
            if (updateResult.modifiedCount === 0) {
                throw new Error("Failed to delete document.");
            }

            // Delete the file from disk
            if (doc.file_path) {
                await fs.promises.unlink(path.resolve(doc.file_path)).catch(() => { });
            }

            return { success: true, message: "Document deleted successfully." };
        } catch (err) {
            return { success: false, error: err.message || "Error deleting document." };
        }
    },

    getUpcomingBookings: async (query = {}) => {
        try {
            let {
                page = 1,
                limit = 50,
                from_date,
                to_date,
                status
            } = query;
            page = parseInt(page);
            limit = parseInt(limit);
            const collection = db.get().collection(COLLECTION.BOOKINGS);
            const skip = (page - 1) * limit;

            const matchFilter = {
                status: { $ne: "CANCELLED" }
            };

            // ---- DATE RANGE FILTER ----
            if (from_date || to_date) {
                const parseDate = (str) => {
                    if (!str) return null;
                    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
                    if (match) {
                        return new Date(
                            Number(match[3]),
                            Number(match[2]) - 1,
                            Number(match[1])
                        );
                    }
                    return new Date(str);
                };
                matchFilter.booking_date = {};

                if (from_date) {
                    matchFilter.booking_date.$gte = parseDate(from_date);
                }
                if (to_date) {
                    const end = parseDate(to_date);
                    end.setHours(23, 59, 59, 999);
                    matchFilter.booking_date.$lte = end;
                }
            } else {
                // Default upcoming filter (booking_date >= today)
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                matchFilter.booking_date = { $gte: today };
            }

            if (status) {
                matchFilter.status = status;
            }

            const result = await collection.aggregate([
                { $match: matchFilter },

                {
                    $project: {
                        booking_no: 1,
                        booking_date: 1,
                        expected_closure_date: 1,
                        customer_id: 1,
                        customer_name: 1,
                        product_id: 1,
                        product_name: 1,
                        total_amount: 1,
                        grand_total: 1,
                        status: 1,
                        officer_id: 1,
                        created_at: 1
                    }
                },

                { $sort: { booking_date: 1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $facet: {
                        data: [],
                        meta: [{ $count: "total" }]
                    }
                }
            ]).toArray()
            const response = result[0];
            const total = response.meta.length ? response.meta[0].total : 0;

            return {
                success: true,
                data: response.data,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };

        } catch (err) {
            return { success: false, error: err.message };
        }
    },


    getPaymentScheduleList: async (query) => {
        try {
            let {
                page = 1,
                limit = 20,
                status,            // PENDING | PAID | etc.
                filter_status,     // UPCOMING | OVERDUE
                from_date,
                to_date,
            } = query;
            page = parseInt(page);
            limit = parseInt(limit);
            const collection = db.get().collection(COLLECTION.BOOKINGS);
            const skip = (page - 1) * limit;
            // Date parser
            const parseDate = (str) => {
                if (!str) return null;
                const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
                return m
                    ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
                    : new Date(str);
            };
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const matchFilter = {
                "payment_schedule.due_date": { $exists: true },
                status: { $ne: "CANCELLED" }
            };
            // 👉 Status filter
            if (status) {
                matchFilter["payment_schedule.status"] = status;
            }

            // 👉 Upcoming / Overdue Filter
            if (filter_status === "UPCOMING") {
                matchFilter["payment_schedule.status"] = { $ne: "PAID" };
                matchFilter["payment_schedule.due_date"] = { $gte: today };
            }
            if (filter_status === "OVERDUE") {
                matchFilter["payment_schedule.status"] = { $ne: "PAID" };
                matchFilter["payment_schedule.due_date"] = { $lt: today };
            }

            // 👉 Date range filter (optional)
            if (from_date || to_date) {
                matchFilter["payment_schedule.due_date"] = {};
                if (from_date)
                    matchFilter["payment_schedule.due_date"].$gte = parseDate(from_date);

                if (to_date) {
                    const end = parseDate(to_date);
                    end.setHours(23, 59, 59, 999);
                    matchFilter["payment_schedule.due_date"].$lte = end;
                }
            }

            const result = await collection.aggregate([
                { $unwind: "$payment_schedule" },
                { $match: matchFilter },

                {
                    $project: {
                        _id: 0,
                        booking_id: "$_id",
                        booking_no: 1,
                        customer_name: 1,
                        product_name: 1,
                        payment_type: "$payment_schedule.payment_type",
                        status: "$payment_schedule.status",
                        amount: "$payment_schedule.amount",
                        due_date: "$payment_schedule.due_date",
                        paid_at: "$payment_schedule.paid_at",
                        transaction_id: "$payment_schedule.transaction_id",
                        payment_id: "$payment_schedule.id",
                        remarks: "$payment_schedule.remarks",
                    }
                },

                {
                    $facet: {
                        data: [
                            { $sort: { due_date: 1 } },
                            { $skip: skip },
                            { $limit: limit }
                        ],
                        meta: [
                            { $count: "total" }
                        ],
                        totalAmount: [
                            { $group: { _id: null, amount: { $sum: "$amount" } } }
                        ]
                    }
                }
            ]).toArray();


            const response = result[0];

            return {
                success: true,
                payments: response.data,
                total: response.meta?.[0]?.total || 0,
                total_amount: response.totalAmount?.[0]?.amount || 0,
                page,
                limit,
                totalPages: Math.ceil((response.meta?.[0]?.total || 0) / limit)
            };

        } catch (err) {
            return { success: false, error: err.message };
        }
    },


};
