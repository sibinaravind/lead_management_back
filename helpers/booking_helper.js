var db = require('../config/connection');
let COLLECTION = require('../config/collections');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { STATUSES, BOOKING_STATUSES } = require('../constants/enums');
const { bookingSchema, paymentScheduleSchema } = require("../validations/bookingValidation");
const { safeObjectId } = require('../utils/safeObjectId');
const { logActivity } = require('./customer_interaction_helper');
const { validatePartial } = require("../utils/validatePartial");
const { ObjectId } = require('mongodb');
const fileUploader = require('../utils/fileUploader');
const path = require('path');
var fs = require('fs');
const { custom } = require('joi');
const { off } = require('process');
function cleanObject(obj) {
    return Object.fromEntries(
        Object.entries(obj || {}).filter(([_, v]) =>
            v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")
        )
    );
}


async function allocatePaymentToSchedules({
    booking,
    amount,
    payment_method,
    transaction_id,
    remarks,
    officer_id
}) {
    const bookingCol = db.get().collection(COLLECTION.BOOKINGS);
    const txnCol = db.get().collection(COLLECTION.TRANSACTIONS);
    let remainingAmount = Number(amount);
    // sort schedules
    const schedules = booking.payment_schedule
        .sort((a, b) => a.due_date - b.due_date);
    // create transaction ONCE
    const txn = {
        booking_id: booking._id,
        booking_no: booking.booking_id,
        customer_id: safeObjectId(booking.customer_id),
        amount,
        payment_method,
        transaction_id,
        remarks,
        created_by: safeObjectId(officer_id),
        created_at: new Date()
    };

    const txnResult = await txnCol.insertOne(txn);

    const bulkOps = [];

    for (const schedule of schedules) {
        if (remainingAmount <= 0) break;

        const paid = schedule.paid_amount || 0;
        const pending = schedule.amount - paid;
        if (pending <= 0) continue;
        const payNow = Math.min(pending, remainingAmount);
        const newPaid = paid + payNow;
        const status = newPaid >= schedule.amount ? "PAID" : "PARTIAL-PAID";

        bulkOps.push({
            updateOne: {
                filter: {
                    _id: booking._id,
                    "payment_schedule._id": schedule._id
                },
                update: {
                    $set: {
                        "payment_schedule.$.paid_amount": newPaid,
                        "payment_schedule.$.status": status,
                        "payment_schedule.$.paid_at": new Date(),
                        updated_at: new Date()
                    },
                    $push: {
                        "payment_schedule.$.transaction_ids": txnResult.insertedId
                    }
                }
            }
        });

        remainingAmount -= payNow;
    }

    if (bulkOps.length) {
        await bookingCol.bulkWrite(bulkOps);
    }

    return {
        transaction_id: txnResult.insertedId,
        unallocated_amount: remainingAmount
    };
}

module.exports = {


    createBooking: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
                const { error, value } = bookingSchema.validate(details);
                if (error) return reject(error.details[0].message);
                details = value;
                // Handle customer creation if not exists
                if (!details.customer_id) {
                    const leadsCol = db.get().collection(COLLECTION.LEADS);
                    const exists = await leadsCol.findOne({ phone: details.customer_phone });
                    if (exists) {
                        return reject(`Client with this phone number already exists with name ${exists.name}, Please use existing client.`
                        );
                    }

                    const leadIdSeq = await getNextSequence("lead_id");
                    const client_id = `AELID${String(leadIdSeq).padStart(5, "0")}`;

                    const leadResult = await leadsCol.insertOne({
                        client_id,
                        name: details.customer_name,
                        phone: details.customer_phone,
                        address: details.customer_address || "",
                        status: STATUSES.CONVERTED,
                        officer_id: details.officer_id ? safeObjectId(details.officer_id) : null,
                        created_at: new Date(),
                        updated_at: new Date()
                    });

                    if (leadResult.acknowledged) {
                        details.customer_id = safeObjectId(leadResult.insertedId);
                        details.customer_app_id = client_id;
                        await logActivity({
                            type: "customer_created",
                            client_id: leadResult.insertedId,
                            officer_id: details.officer_id
                                ? safeObjectId(details.officer_id)
                                : "UNASSIGNED",
                            comment: "New client created during booking creation."
                        });
                    } else {
                        return reject({
                            message: "Client creation failed. Cannot proceed with booking. Try again."
                        });
                    }
                }

                // Booking insertion
                const bookingCol = db.get().collection(COLLECTION.BOOKINGS);
                const newNumber = await getNextSequence("booking_id");
                const booking_id = `AEBK${String(newNumber).padStart(6, "0")}`;

                const payment_schedule = (details.payment_schedule || []).map(p => ({
                    ...p,
                    paid_amount: 0,
                    transaction_ids: [],
                    paid_at: null
                }));

                const bookingResult = await bookingCol.insertOne({
                    booking_id,
                    ...details,
                    payment_schedule,
                    status: BOOKING_STATUSES.PROCESSING,
                    created_at: new Date(),
                    updated_at: new Date()
                });

                const booking = await bookingCol.findOne({ _id: bookingResult.insertedId });

                // Initial payment
                let paymentResult = null;
                if (details.transaction?.paid_amount > 0) {
                    paymentResult = await allocatePaymentToSchedules({
                        booking,
                        amount: details.transaction.paid_amount,
                        payment_method: details.transaction.payment_method,
                        transaction_id: details.transaction.transaction_id,
                        remarks: details.transaction.remarks,
                        officer_id: details.officer_id
                    });
                }

                await logActivity({
                    type: "BOOKING_CREATED",
                    referrer_id: bookingResult.insertedId,
                    client_id: details.customer_id,
                    officer_id: details.officer_id
                        ? safeObjectId(details.officer_id)
                        : "UNASSIGNED",
                    comment: `New booking ${details.product_name} created.`
                });

                resolve({
                    booking_id,
                    _id: bookingResult.insertedId,
                    initial_payment: paymentResult
                });

            } catch (err) {

                reject(err?.message || err || "Booking creation failed");
            }
        });
    },



    editBooking: async (bookingId, updateData,) => {
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
            throw (err.message || "Error updating booking");
        }
    },

    addBookingPayment: async (data) => {
        const bookingCol = db.get().collection(COLLECTION.BOOKINGS);
        const booking = await bookingCol.findOne({
            _id: safeObjectId(data.booking_id)
        });
        if (!booking) throw "Booking not found";
        return allocatePaymentToSchedules({
            booking,
            amount: data.amount,
            payment_method: data.payment_method,
            transaction_id: data.transaction_id,
            remarks: data.remarks,
            officer_id: data.officer_id
        });
    },

    reschedulePayment: async ({
        booking_id,
        payment_schedule_id,
        due_date,
        amount
    }) => {
        try {
            const col = db.get().collection(COLLECTION.BOOKINGS);

            const result = await col.updateOne(
                {
                    _id: safeObjectId(booking_id),
                    payment_schedule: {
                        $elemMatch: {
                            id: payment_schedule_id,
                            status: { $ne: "PAID" }
                        }
                    }
                },
                {
                    $set: {
                        "payment_schedule.$.due_date": new Date(due_date),
                        // ...(amount != null && {
                        //     "payment_schedule.$.amount": Number(amount)
                        // }),
                        updated_at: new Date()
                    }
                }
            );
            if (result.matchedCount === 0) {
                throw new Error("Booking not found or payment already PAID");
            }

            return { message: "Payment rescheduled successfully" };

        } catch (err) {
            throw err;
        }
    },



    // getBookingById: async (id) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             const objectId = safeObjectId(id);
    //             if (!objectId) return reject("Invalid booking ID");

    //             const collection = db.get().collection(COLLECTION.BOOKINGS);
    //             const booking = await collection.findOne({ _id: objectId });
    //             if (!booking) return reject("Booking not found");

    //             resolve(booking);

    //         } catch (err) {
    //             console.error(err);
    //             reject(err.message || "Error fetching booking");
    //         }
    //     });
    // },

    getBookingById: async (id) => {
        return new Promise(async (resolve, reject) => {
            try {
                const objectId = safeObjectId(id);
                if (!objectId) return reject("Invalid booking ID");

                const bookingCol = db.get().collection(COLLECTION.BOOKINGS);

                const data = await bookingCol.aggregate([
                    {
                        $match: { _id: objectId }
                    },
                    {
                        $lookup: {
                            from: COLLECTION.PRODUCTS,
                            localField: "product_id",
                            foreignField: "_id",
                            as: "product"
                        }
                    },
                    {
                        $unwind: {
                            path: "$product",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: COLLECTION.LEADS,
                            localField: "customer_id",
                            foreignField: "_id",
                            as: "lead"
                        }
                    },
                    {
                        $unwind: {
                            path: "$lead",
                            preserveNullAndEmptyArrays: true
                        }
                    },

                    // 4️⃣ Add required + uploaded documents
                    {
                        $addFields: {
                            required_documents: {
                                $ifNull: ["$product.documentsRequired", []]
                            },
                            customer_documents: {
                                $ifNull: ["$lead.documents", []]
                            }
                        }
                    },

                    // 5️⃣ Remove lookup objects (optional cleanup)
                    {
                        $project: {
                            product: 0,
                            lead: 0
                        }
                    }
                ]).toArray();

                if (!data.length) {
                    return reject("Booking not found");
                }

                resolve(data[0]
                );

            } catch (err) {
                console.error(err);
                reject(err.message || "Error fetching booking");
            }
        });
    },

    getbookingCountByCategory: async (decoded, query) => {
        try {
            const { employee } = query;

            const isAdmin =
                Array.isArray(decoded?.designation) &&
                decoded.designation.includes("ADMIN");

            /* ---------------- BASE FILTER ---------------- */
            const filter = {};

            /* ---------------- OFFICER FILTER ---------------- */
            if (employee) {
                filter.officer_id = safeObjectId(employee);
            } else if (!isAdmin) {
                filter.officer_id = Array.isArray(decoded?.officers)
                    ? decoded.officers
                        .map(o => safeObjectId(o?.officer_id))
                        .filter(Boolean)
                    : safeObjectId(decoded?._id);
            }

            /* ---------------- DATE SETUP ---------------- */
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const tomorrowStart = new Date(todayStart);
            tomorrowStart.setDate(todayStart.getDate() + 1);

            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(todayStart.getDate() - 1);

            // Week: Sunday → next Sunday (exclusive)
            const weekStart = new Date(todayStart);
            weekStart.setDate(todayStart.getDate() - todayStart.getDay());

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);

            // Month: 1st → next month 1st (exclusive)
            const monthStart = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth(),
                1
            );

            const monthEnd = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth() + 1,
                1
            );

            /* ---------------- AGGREGATION ---------------- */
            const result = await db
                .get()
                .collection(COLLECTION.BOOKINGS)
                .aggregate([
                    { $match: filter },
                    {
                        $facet: {
                            TOTAL: [{ $count: "count" }],

                            TODAY: [
                                {
                                    $match: {
                                        created_at: {
                                            $gte: todayStart,
                                            $lt: tomorrowStart
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            YESTERDAY: [
                                {
                                    $match: {
                                        created_at: {
                                            $gte: yesterdayStart,
                                            $lt: todayStart
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_WEEK: [
                                {
                                    $match: {
                                        created_at: {
                                            $gte: weekStart,
                                            $lt: weekEnd
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_MONTH: [
                                {
                                    $match: {
                                        created_at: {
                                            $gte: monthStart,
                                            $lt: monthEnd
                                        }
                                    }
                                },
                                { $count: "count" }
                            ]
                        }
                    }
                ])
                .toArray();

            /* ---------------- RESPONSE ---------------- */
            const counts = result[0] || {};
            const getCount = key => counts[key]?.[0]?.count ?? 0;

            return {
                TOTAL: getCount("TOTAL"),
                TODAY: getCount("TODAY"),
                YESTERDAY: getCount("YESTERDAY"),
                THIS_WEEK: getCount("THIS_WEEK"),
                THIS_MONTH: getCount("THIS_MONTH")
            };

        } catch (err) {
            console.error("getbookingCountByCategory error:", err);
            throw new Error("Server Error");
        }
    },

    getBookingCountForAllOfficers: async (query) => {
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

            /* ---------------- BASE FILTER ---------------- */
            const filter = {};

            /* ---------------- CREATED_AT DATE FILTER ---------------- */
            const start = parseDate(startDate);
            const end = parseDate(endDate);

            if (start || end) {
                filter.created_at = {};

                if (start instanceof Date && !isNaN(start)) {
                    filter.created_at.$gte = start;
                }

                if (end instanceof Date && !isNaN(end)) {
                    end.setHours(23, 59, 59, 999);
                    filter.created_at.$lte = end;
                }

                if (Object.keys(filter.created_at).length === 0) {
                    delete filter.created_at;
                }
            }

            /* ---------------- DATE CALCULATIONS ---------------- */
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const tomorrowStart = new Date(todayStart);
            tomorrowStart.setDate(todayStart.getDate() + 1);

            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(todayStart.getDate() - 1);

            const weekStart = new Date(todayStart);
            weekStart.setDate(todayStart.getDate() - todayStart.getDay());

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);

            const monthStart = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth(),
                1
            );

            const monthEnd = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth() + 1,
                1
            );

            /* ---------------- AGGREGATION ---------------- */
            const result = await db
                .get()
                .collection(COLLECTION.BOOKINGS)
                .aggregate([
                    { $match: filter },
                    {
                        $group: {
                            _id: { $ifNull: ["$officer_id", "UNASSIGNED"] },
                            TOTAL: { $sum: 1 },
                            CANCELLED: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $eq: ["$status", "CANCELLED"] },
                                                // apply selected date range (start & end)
                                                ...(start ? [{ $gte: ["$created_at", start] }] : []),
                                                ...(end ? [{ $lte: ["$created_at", end] }] : [])
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },
                            TODAY: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gte: ["$created_at", todayStart] },
                                                { $lt: ["$created_at", tomorrowStart] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },

                            YESTERDAY: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $gte: ["$created_at", yesterdayStart] },
                                                { $lt: ["$created_at", todayStart] }
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
                                                { $gte: ["$created_at", weekStart] },
                                                { $lt: ["$created_at", weekEnd] }
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
                                                { $gte: ["$created_at", monthStart] },
                                                { $lt: ["$created_at", monthEnd] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            }
                        }
                    },

                    /* ---------------- JOIN OFFICERS ---------------- */
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
                            YESTERDAY: 1,
                            THIS_WEEK: 1,
                            THIS_MONTH: 1,
                            CANCELLED: 1
                        }
                    },

                    { $sort: { TOTAL: -1 } }
                ])
                .toArray();

            return result;
        } catch (err) {
            throw new Error("Server Error");
        }
    },


    getAllBookings: async (query, decoded) => {
        try {
            const {
                customer_id,
                product_id,
                status,
                startDate,
                endDate,
                searchString,
                page = 1,
                limit = 10,
                employee,
                branch,
            } = query;
            const parsedPage = parseInt(page);
            const parsedLimit = parseInt(limit);
            const skip = (parsedPage - 1) * parsedLimit;
            const collection = db.get().collection(COLLECTION.BOOKINGS);
            const filter = {};
            if (customer_id) filter.customer_id = safeObjectId(customer_id);
            if (product_id) filter.product_id = safeObjectId(product_id);
            if (status) filter.status = status;
            if (branch) filter.branch = branch;

            // Officer filter
            const isAdmin = Array.isArray(decoded?.designation) && decoded.designation.includes('ADMIN');
            let officerIdList = [];
            if (!isAdmin) {
                officerIdList = Array.isArray(decoded?.officers)
                    ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
                    : [];
            }
            if (employee) {
                filter.officer_id = safeObjectId(employee);
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
            if (startDate || endDate) {
                const parseDate = (str) => {
                    if (!str) return null;
                    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
                    if (match) {
                        return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                    }
                    return new Date(str);
                };
                filter.created_at = {};

                if (startDate) {

                    filter.created_at.$gte = parseDate(startDate);
                }
                if (endDate) {

                    const end = parseDate(endDate);
                    end.setHours(23, 59, 59, 999);
                    filter.created_at.$lte = end;
                }
            }
            // Search filter
            if (searchString) {
                const searchRegex = new RegExp(searchString, "i");
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
                                        booking_id: 1,
                                        customer_id: 1,
                                        customer_name: 1,
                                        customer_phone: 1,
                                        product_id: 1,
                                        product_name: 1,
                                        total_amount: 1,
                                        grand_total: 1,
                                        status: 1,
                                        officer_id: 1,
                                        created_at: 1,
                                        officer_name: "$officers.name",
                                        // officer_id: "$officers.officer_id",
                                        payed: {
                                            $sum: "$payment_schedule.paid_amount"
                                        }

                                    },
                                },
                            ],
                            totalCount: [{ $count: "count" }],
                            grandTotal: [
                                { $group: { _id: null, total: { $sum: "$grand_total" } } },
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


    uploadBookingDocument: (id, { doc_type, base64 }) => {
        let filePath = null;
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
            throw new Error(err.message || "Error deleting document.");
        }
    },

    getUpcomingBookingCount: async (decoded, query) => {
        try {
            const { employee } = query;

            const isAdmin =
                Array.isArray(decoded?.designation) &&
                decoded.designation.includes("ADMIN");

            /* ---------------- BASE FILTER ---------------- */
            const filter = {
                status: { $ne: "CANCELLED" }
            };

            /* ---------------- OFFICER FILTER ---------------- */
            if (employee) {
                filter.officer_id = safeObjectId(employee);
            } else if (!isAdmin) {
                filter.officer_id = Array.isArray(decoded?.officers)
                    ? decoded.officers
                        .map(o => safeObjectId(o?.officer_id))
                        .filter(Boolean)
                    : safeObjectId(decoded?._id);
            }

            /* ---------------- DATE SETUP ---------------- */
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const tomorrowStart = new Date(todayStart);
            tomorrowStart.setDate(todayStart.getDate() + 1);

            const dayAfterTomorrow = new Date(todayStart);
            dayAfterTomorrow.setDate(todayStart.getDate() + 2);

            // Week: Sunday → next Sunday (exclusive)
            const weekStart = new Date(todayStart);
            weekStart.setDate(todayStart.getDate() - todayStart.getDay());

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7); // exclusive

            // Month: 1st → next month 1st (exclusive)
            const monthStart = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth(),
                1
            );

            const monthEnd = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth() + 1,
                1
            ); // exclusive

            /* ---------------- AGGREGATION ---------------- */
            const result = await db
                .get()
                .collection(COLLECTION.BOOKINGS)
                .aggregate([
                    { $match: filter },
                    {
                        $facet: {
                            TOTAL_UPCOMING: [
                                { $match: { booking_date: { $gte: todayStart } } },
                                { $count: "count" }
                            ],

                            TODAY: [
                                {
                                    $match: {
                                        booking_date: {
                                            $gte: todayStart,
                                            $lt: tomorrowStart
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            TOMORROW: [
                                {
                                    $match: {
                                        booking_date: {
                                            $gte: tomorrowStart,
                                            $lt: dayAfterTomorrow
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_WEEK: [
                                {
                                    $match: {
                                        booking_date: {
                                            $gte: weekStart,
                                            $lt: weekEnd
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_MONTH: [
                                {
                                    $match: {
                                        booking_date: {
                                            $gte: monthStart,
                                            $lt: monthEnd
                                        }
                                    }
                                },
                                { $count: "count" }
                            ]
                        }
                    }
                ])
                .toArray();

            /* ---------------- RESPONSE ---------------- */
            const counts = result[0] || {};
            const getCount = key => counts[key]?.[0]?.count ?? 0;

            return {
                TOTAL: getCount("TOTAL_UPCOMING"),
                TODAY: getCount("TODAY"),
                TOMORROW: getCount("TOMORROW"),
                THIS_WEEK: getCount("THIS_WEEK"),
                THIS_MONTH: getCount("THIS_MONTH")
            };

        } catch (err) {
            console.error("getUpcomingBookingCount error:", err);
            throw new Error("Server Error");
        }
    },


    getUpcomingBookings: async (query, decoded) => {
        try {
            let {
                page = 1,
                limit = 50,
                startDate,
                endDate,
                status,
                employee,
                searchString,
            } = query;

            page = Number(page);
            limit = Number(limit);
            const collection = db.get().collection(COLLECTION.BOOKINGS);
            const skip = (page - 1) * limit;

            /* --------------------------------------------------
             * BASE FILTER
             * -------------------------------------------------- */
            const matchFilter = {
                status: { $ne: "CANCELLED" },
            };

            /* --------------------------------------------------
             * ROLE / OFFICER FILTER
             * -------------------------------------------------- */
            const isAdmin =
                Array.isArray(decoded?.designation) &&
                decoded.designation.includes("ADMIN");

            if (employee) {
                matchFilter.officer_id = safeObjectId(employee);
            } else if (!isAdmin) {
                const officerIds = Array.isArray(decoded?.officers)
                    ? decoded.officers
                        .map(o => safeObjectId(o?.officer_id))
                        .filter(Boolean)
                    : [];

                if (officerIds.length > 0) {
                    matchFilter.officer_id = {
                        $in: [safeObjectId(decoded?._id), ...officerIds],
                    };
                } else if (decoded?._id) {
                    matchFilter.officer_id = safeObjectId(decoded._id);
                }
            }
            // Admin → no officer filter

            /* --------------------------------------------------
             * DATE FILTER
             * -------------------------------------------------- */
            const parseDate = (value, endOfDay = false) => {
                if (!value) return null;

                // dd/MM/yyyy
                const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
                let date;

                if (match) {
                    date = new Date(
                        Number(match[3]),
                        Number(match[2]) - 1,
                        Number(match[1])
                    );
                } else {
                    date = new Date(value);
                }

                if (endOfDay) {
                    date.setHours(23, 59, 59, 999);
                } else {
                    date.setHours(0, 0, 0, 0);
                }

                return date;
            };

            if (startDate || endDate) {
                matchFilter.booking_date = {};

                if (startDate) {
                    matchFilter.booking_date.$gte = parseDate(startDate);
                }

                if (endDate) {
                    matchFilter.booking_date.$lte = parseDate(endDate, true);
                }
            } else {
                // Default → upcoming bookings
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                matchFilter.booking_date = { $gte: today };
            }
            if (status) {
                matchFilter.status = status;
            }
            if (searchString) {
                const searchRegex = new RegExp(searchString, "i");
                matchFilter.$or = [
                    { customer_name: { $regex: searchRegex } },
                    { product_name: { $regex: searchRegex } },
                    { booking_no: { $regex: searchRegex } },
                ];
            }

            const [result] = await collection
                .aggregate([
                    { $match: matchFilter },
                    {
                        $lookup: {
                            from: COLLECTION.OFFICERS,
                            localField: "officer_id",
                            foreignField: "_id",
                            as: "officers",
                        },
                    },
                    { $unwind: { path: "$officers", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            booking_date: 1,
                            expected_closure_date: 1,
                            booking_id: 1,
                            customer_id: 1,
                            customer_name: 1,
                            customer_phone: 1,
                            product_id: 1,
                            product_name: 1,
                            total_amount: 1,
                            grand_total: 1,
                            status: 1,
                            officer_id: 1,
                            created_at: 1,
                            officer_name: "$officers.name",
                            // officer_id: "$officers.officer_id",
                            payed: {
                                $sum: "$payment_schedule.paid_amount"
                            }

                        },
                    },

                    { $sort: { booking_date: 1 } },
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $facet: {
                            data: [],
                            meta: [{ $count: "total" }],
                        },
                    },
                ])
                .toArray();
            const total = result?.meta?.[0]?.total ?? 0;
            return {
                bookings: result?.data ?? [],
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit),
            }
        } catch (err) {
            console.error("getUpcomingBookings error:", err);
            throw new Error(err?.message || "Failed to fetch upcoming bookings");
        }
    },

    getPaymentScheduleCount: async (decoded, query) => {
        try {
            const { employee } = query;

            const isAdmin =
                Array.isArray(decoded?.designation) &&
                decoded.designation.includes("ADMIN");

            const matchFilter = {
                "payment_schedule.due_date": { $exists: true },
                status: { $ne: "CANCELLED" }
            };

            /* ---------------- OFFICER FILTER ---------------- */
            if (employee) {
                matchFilter.officer_id = safeObjectId(employee);
            } else if (!isAdmin) {
                matchFilter.officer_id = Array.isArray(decoded?.officers)
                    ? decoded.officers
                        .map(o => safeObjectId(o?.officer_id))
                        .filter(Boolean)
                    : safeObjectId(decoded?._id);
            }

            /* ---------------- DATE SETUP ---------------- */
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const tomorrowStart = new Date(todayStart);
            tomorrowStart.setDate(todayStart.getDate() + 1);

            const dayAfterTomorrow = new Date(tomorrowStart);
            dayAfterTomorrow.setDate(tomorrowStart.getDate() + 1);

            // Sunday → Saturday
            const weekStart = new Date(todayStart);
            weekStart.setDate(todayStart.getDate() - todayStart.getDay());

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7); // exclusive

            // Month start → next month start
            const monthStart = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth(),
                1
            );

            const monthEnd = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth() + 1,
                1
            ); // exclusive

            /* ---------------- AGGREGATION ---------------- */
            const result = await db
                .get()
                .collection(COLLECTION.BOOKINGS)
                .aggregate([
                    { $unwind: "$payment_schedule" },
                    { $match: matchFilter },
                    {
                        $facet: {
                            TODAY: [
                                {
                                    $match: {
                                        "payment_schedule.due_date": {
                                            $gte: todayStart,
                                            $lt: tomorrowStart
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            TOMORROW: [
                                {
                                    $match: {
                                        "payment_schedule.due_date": {
                                            $gte: tomorrowStart,
                                            $lt: dayAfterTomorrow
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_WEEK: [
                                {
                                    $match: {
                                        "payment_schedule.due_date": {
                                            $gte: weekStart,
                                            $lt: weekEnd
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_MONTH: [
                                {
                                    $match: {
                                        "payment_schedule.due_date": {
                                            $gte: monthStart,
                                            $lt: monthEnd
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            UPCOMING: [
                                {
                                    $match: {
                                        "payment_schedule.due_date": {
                                            $gte: todayStart
                                        }
                                    }
                                },
                                { $count: "count" }
                            ],

                            OVERDUE: [
                                {
                                    $match: {
                                        "payment_schedule.status": { $ne: "PAID" },
                                        "payment_schedule.due_date": {
                                            $lt: todayStart
                                        }
                                    }
                                },
                                { $count: "count" }
                            ]
                        }
                    }
                ])
                .toArray();

            /* ---------------- RESPONSE ---------------- */
            const counts = result[0] || {};
            const getCount = key => counts[key]?.[0]?.count ?? 0;

            return {
                TODAY: getCount("TODAY"),
                TOMORROW: getCount("TOMORROW"),
                THIS_WEEK: getCount("THIS_WEEK"),
                THIS_MONTH: getCount("THIS_MONTH"),
                UPCOMING: getCount("UPCOMING"),
                OVERDUE: getCount("OVERDUE")
            };

        } catch (err) {
            console.error("getPaymentScheduleCount error:", err);
            throw new Error("Server Error");
        }
    },


    getPaymentScheduleList: async (query, decoded) => {
        try {
            let {
                page = 1,
                limit = 20,
                status,
                filterCategory,
                startDate,
                endDate,
                employee,
                searchString
            } = query;

            page = Number(page);
            limit = Number(limit);
            const skip = (page - 1) * limit;

            const collection = db.get().collection(COLLECTION.BOOKINGS);

            // 🚀 OPTIMIZATION 1: Pre-compute today once
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 🚀 OPTIMIZATION 2: Simplified date parser with early return
            const parseDate = (str) => {
                if (!str) return null;
                const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
                return m
                    ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
                    : new Date(str);
            };

            /* --------------------------------------------------
             * 🚀 OPTIMIZATION 3: Build match filter more efficiently
             * -------------------------------------------------- */
            const matchFilter = {
                "payment_schedule.due_date": { $exists: true },
                "status": { $ne: "CANCELLED" },
            };



            // 🚀 OPTIMIZATION 4: Simplified admin check
            const isAdmin = decoded?.designation?.includes("ADMIN");

            // Officer filtering logic
            if (employee) {
                matchFilter.officer_id = safeObjectId(employee);
            } else if (!isAdmin) {
                const officerIds = decoded?.officers
                    ?.map(o => safeObjectId(o?.officer_id))
                    .filter(Boolean) || [];

                if (officerIds.length > 0) {
                    matchFilter.officer_id = {
                        $in: [safeObjectId(decoded?._id), ...officerIds],
                    };
                } else if (decoded?._id) {
                    matchFilter.officer_id = safeObjectId(decoded._id);
                }
            }

            if (searchString) {
                const searchRegex = new RegExp(searchString, "i");
                matchFilter.$or = [
                    { customer_name: { $regex: searchRegex } },
                    { product_name: { $regex: searchRegex } },
                    { booking_no: { $regex: searchRegex } },
                ];
            }

            if (status) {
                matchFilter["payment_schedule.status"] = status;
            }

            if (filterCategory === "UPCOMING" || filterCategory === "OVERDUE") {
                // matchFilter["payment_schedule.status"] = { $ne: "PAID" };
                matchFilter["payment_schedule.status"] = status
                    ? status
                    : { $ne: "PAID" };
                matchFilter["payment_schedule.due_date"] =
                    filterCategory === "UPCOMING" ? { $gte: today } : { $lt: today };
            }

            // Date range filtering
            if (startDate || endDate) {
                const dateFilter = {};
                if (startDate) {
                    dateFilter.$gte = parseDate(startDate);
                }
                if (endDate) {
                    const end = parseDate(endDate);
                    end.setHours(23, 59, 59, 999);
                    dateFilter.$lte = end;
                }
                if (matchFilter["payment_schedule.due_date"]?.$gte ||
                    matchFilter["payment_schedule.due_date"]?.$lt) {
                    Object.assign(matchFilter["payment_schedule.due_date"], dateFilter);
                } else {
                    matchFilter["payment_schedule.due_date"] = dateFilter;
                }
            }
            const pipeline = [

                { $unwind: "$payment_schedule" },
                { $match: matchFilter },
                {
                    $lookup: {
                        from: COLLECTION.OFFICERS,
                        localField: "officer_id",
                        foreignField: "_id",
                        as: "officer_info",
                    },
                },
                {
                    $project: {
                        _id: 1,
                        booking_id: 1,
                        customer_name: 1,
                        customer_phone: 1,
                        product_name: 1,
                        officer_id: 1,
                        grand_total: 1,
                        booking_date: 1,
                        status: 1,
                        payment_schedule: 1,
                        officer_name: { $arrayElemAt: ["$officer_info.name", 0] },
                    },
                },

                // Stage 4: Facet for pagination and aggregates
                {
                    $facet: {
                        data: [
                            { $sort: { "payment_schedule.due_date": 1 } },
                            { $skip: skip },
                            { $limit: limit },
                        ],
                        meta: [{ $count: "total" }],
                        totalAmount: [
                            {
                                $group: {
                                    _id: null,
                                    amount: { $sum: "$payment_schedule.amount" },
                                },
                            },
                        ],
                        totalPaid: [
                            {
                                $group: {
                                    _id: null,
                                    amount: { $sum: "$payment_schedule.paid_amount" },
                                },
                            },
                        ],
                    },
                },
            ];

            // 🚀 OPTIMIZATION 10: Single database call
            const [response] = await collection.aggregate(pipeline).toArray();

            const total = response?.meta?.[0]?.total ?? 0;
            const totalAmount = response?.totalAmount?.[0]?.amount ?? 0;

            return {
                bookings: response?.data ?? [],
                total,
                grand_total: totalAmount,
                total_paid_amount: response?.totalPaid?.[0]?.amount ?? 0,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        } catch (err) {
            console.error("getPaymentScheduleList error:", err);
            throw new Error(err?.message || "Failed to fetch payment schedules");
        }
    },


    getPaymentTransactionCount: async (decoded, query) => {
        try {
            const { employee } = query;

            const isAdmin =
                Array.isArray(decoded?.designation) &&
                decoded.designation.includes("ADMIN");

            /* ---------------- BASE FILTER ---------------- */
            const filter = {};

            /* ---------------- OFFICER FILTER ---------------- */
            if (employee) {
                filter.created_by = safeObjectId(employee);
            } else if (!isAdmin) {
                filter.created_by = Array.isArray(decoded?.officers)
                    ? decoded.officers
                        .map(o => safeObjectId(o?.officer_id))
                        .filter(Boolean)
                    : safeObjectId(decoded?._id);
            }

            /* ---------------- DATE SETUP ---------------- */
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const tomorrowStart = new Date(todayStart);
            tomorrowStart.setDate(todayStart.getDate() + 1);

            const yesterdayStart = new Date(todayStart);
            yesterdayStart.setDate(todayStart.getDate() - 1);

            // Week: Sunday → next Sunday (exclusive)
            const weekStart = new Date(todayStart);
            weekStart.setDate(todayStart.getDate() - todayStart.getDay());

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);

            // Month: 1st → next month 1st (exclusive)
            const monthStart = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth(),
                1
            );

            const monthEnd = new Date(
                todayStart.getFullYear(),
                todayStart.getMonth() + 1,
                1
            );

            /* ---------------- AGGREGATION ---------------- */
            const [result] = await db
                .get()
                .collection(COLLECTION.TRANSACTIONS)
                .aggregate([
                    { $match: filter },
                    {
                        $facet: {
                            TOTAL: [{ $count: "count" }],

                            TODAY: [
                                {
                                    $match: {
                                        created_at: { $gte: todayStart, $lt: tomorrowStart }
                                    }
                                },
                                { $count: "count" }
                            ],

                            YESTERDAY: [
                                {
                                    $match: {
                                        created_at: { $gte: yesterdayStart, $lt: todayStart }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_WEEK: [
                                {
                                    $match: {
                                        created_at: { $gte: weekStart, $lt: weekEnd }
                                    }
                                },
                                { $count: "count" }
                            ],

                            THIS_MONTH: [
                                {
                                    $match: {
                                        created_at: { $gte: monthStart, $lt: monthEnd }
                                    }
                                },
                                { $count: "count" }
                            ]
                        }
                    }
                ])
                .toArray();

            const counts = result || {};
            const getCount = key => counts[key]?.[0]?.count ?? 0;

            return {
                TOTAL: getCount("TOTAL"),
                TODAY: getCount("TODAY"),
                YESTERDAY: getCount("YESTERDAY"),
                THIS_WEEK: getCount("THIS_WEEK"),
                THIS_MONTH: getCount("THIS_MONTH")
            };
        } catch (err) {
            console.error("getPaymentTransactionCount error:", err);
            throw new Error("Server Error");
        }
    },

    getTransactionList: async (query, decoded) => {
        try {
            let {
                page = 1,
                limit = 50,
                startDate,
                endDate,
                employee
            } = query;

            page = Number(page);
            limit = Number(limit);
            const skip = (page - 1) * limit;

            const collection = db.get().collection(COLLECTION.TRANSACTIONS);
            const matchFilter = {};

            /* ---------------- ROLE FILTER ---------------- */
            const isAdmin =
                Array.isArray(decoded?.designation) &&
                decoded.designation.includes("ADMIN");

            if (employee) {
                matchFilter.created_by = safeObjectId(employee);
            } else if (!isAdmin) {
                const officerIds = Array.isArray(decoded?.officers)
                    ? decoded.officers
                        .map(o => safeObjectId(o?.officer_id))
                        .filter(Boolean)
                    : [];

                matchFilter.created_by =
                    officerIds.length > 0
                        ? { $in: [safeObjectId(decoded?._id), ...officerIds] }
                        : safeObjectId(decoded?._id);
            }

            /* ---------------- DATE PARSER ---------------- */
            const parseDate = (value, endOfDay = false) => {
                if (!value) return null;

                const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
                let date;

                if (match) {
                    date = new Date(
                        Number(match[3]),
                        Number(match[2]) - 1,
                        Number(match[1])
                    );
                } else {
                    date = new Date(value);
                }

                date.setHours(
                    endOfDay ? 23 : 0,
                    endOfDay ? 59 : 0,
                    endOfDay ? 59 : 0,
                    endOfDay ? 999 : 0
                );

                return date;
            };

            /* ---------------- DATE FILTER ---------------- */
            if (startDate || endDate) {
                matchFilter.created_at = {};
                if (startDate) matchFilter.created_at.$gte = parseDate(startDate);
                if (endDate) matchFilter.created_at.$lte = parseDate(endDate, true);
            }



            /* ---------------- AGGREGATION ---------------- */
            const [result] = await collection
                .aggregate([
                    { $match: matchFilter },

                    // 🔽 Latest transactions first
                    { $sort: { created_at: -1 } },

                    {
                        $lookup: {
                            from: COLLECTION.OFFICERS,
                            localField: "created_by",
                            foreignField: "_id",
                            as: "officer"
                        }
                    },
                    { $unwind: { path: "$officer", preserveNullAndEmptyArrays: true } },

                    {
                        $lookup: {
                            from: COLLECTION.BOOKINGS,
                            localField: "booking_id",
                            foreignField: "_id",
                            as: "booking"
                        }
                    },
                    { $unwind: { path: "$booking", preserveNullAndEmptyArrays: true } },

                    {
                        $project: {
                            _id: 1,
                            booking_no: 1,
                            booking_id: 1,
                            booking_date: 1,
                            amount: 1,
                            payment_method: 1,
                            transaction_id: 1,
                            remarks: 1,
                            created_at: 1,
                            officer_name: "$officer.name",
                            customer_name: "$booking.customer_name",
                            customer_phone: "$booking.customer_phone"
                        }
                    },

                    {
                        $facet: {
                            data: [
                                { $skip: skip },
                                { $limit: limit }
                            ],
                            meta: [
                                { $count: "total" }
                            ],
                            totalAmount: [
                                {
                                    $group: {
                                        _id: null,
                                        amount: { $sum: "$amount" }
                                    }
                                }
                            ]
                        }
                    }
                ])
                .toArray();

            const total = result?.meta?.[0]?.total ?? 0;
            const grandTotal = result?.totalAmount?.[0]?.amount ?? 0;

            return {
                data: result?.data ?? [],
                grand_total: grandTotal,
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            };

        } catch (err) {
            console.error("getTransactionList error:", err);
            throw new Error(err?.message || "Failed to fetch transaction list");
        }
    },


}

//     getPaymentScheduleList: async (query, decoded) => {
//         try {
//             let {
//                 page = 1,
//                 limit = 20,
//                 status,        // PENDING | PAID | etc.
//                 filter_status,     // UPCOMING | OVERDUE
//                 startDate,
//                 endDate,
//                 employee,       // 👈 added
//             } = query;
//             page = Number(page);
//             limit = Number(limit);
//             const collection = db.get().collection(COLLECTION.BOOKINGS);
//             const skip = (page - 1) * limit;
//             const parseDate = (str) => {
//                 if (!str) return null;
//                 const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
//                 return m
//                     ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
//                     : new Date(str);
//             };
//             const today = new Date();
//             today.setHours(0, 0, 0, 0);
//             /* --------------------------------------------------
//              * BASE MATCH FILTER
//              * -------------------------------------------------- */
//             const matchFilter = {
//                 "payment_schedule.due_date": { $exists: true },
//                 status: { $ne: "CANCELLED" },
//             };
//             const isAdmin =
//                 Array.isArray(decoded?.designation) &&
//                 decoded.designation.includes("ADMIN");

//             if (employee) {
//                 matchFilter.officer_id = safeObjectId(employee);
//             } else if (!isAdmin) {
//                 const officerIds = Array.isArray(decoded?.officers)
//                     ? decoded.officers
//                         .map(o => safeObjectId(o?.officer_id))
//                         .filter(Boolean)
//                     : [];

//                 if (officerIds.length > 0) {
//                     matchFilter.officer_id = {
//                         $in: [safeObjectId(decoded?._id), ...officerIds],
//                     };
//                 } else if (decoded?._id) {
//                     matchFilter.officer_id = safeObjectId(decoded._id);
//                 }
//             }
//             if (status) {
//                 matchFilter["payment_schedule.status"] = status;
//             }
//             if (filter_status === "UPCOMING") {
//                 matchFilter["payment_schedule.status"] = { $ne: "PAID" };
//                 matchFilter["payment_schedule.due_date"] = { $gte: today };
//             }
//             if (filter_status === "OVERDUE") {
//                 matchFilter["payment_schedule.status"] = { $ne: "PAID" };
//                 matchFilter["payment_schedule.due_date"] = { $lt: today };
//             }
//             if (startDate || endDate) {
//                 matchFilter["payment_schedule.due_date"] = {};

//                 if (startDate) {
//                     matchFilter["payment_schedule.due_date"].$gte = parseDate(startDate);
//                 }

//                 if (endDate) {
//                     const end = parseDate(endDate);
//                     end.setHours(23, 59, 59, 999);
//                     matchFilter["payment_schedule.due_date"].$lte = end;
//                 }
//             }

//             /* --------------------------------------------------
//              * AGGREGATION
//              * -------------------------------------------------- */
//             const [response] = await collection
//                 .aggregate([
//                     { $unwind: "$payment_schedule" },
//                     { $match: matchFilter },
//                     {
//                         $lookup: {
//                             from: COLLECTION.OFFICERS,
//                             localField: "officer_id",
//                             foreignField: "_id",
//                             as: "officers",
//                         },
//                     },
//                     { $unwind: { path: "$officers", preserveNullAndEmptyArrays: true } },
//                     {
//                         $project: {
//                             _id: 0,
//                             booking_id: 1,
//                             customer_name: 1,
//                             customer_phone: 1,
//                             product_name: 1,
//                             officer_id: 1,
//                             grand_total: 1,
//                             booking_date: 1,
//                             status: 1,
//                             payment_schedule: ["$payment_schedule"],
//                             officer_name: "$officers.name",
//                         },
//                     },
//                     {
//                         $facet: {
//                             data: [
//                                 { $sort: { due_date: 1 } },
//                                 { $skip: skip },
//                                 { $limit: limit },
//                             ],
//                             meta: [{ $count: "total" }],
//                             totalAmount: [
//                                 { $group: { _id: null, amount: { $sum: "$payment_schedule[0].amount" } } },
//                             ],
//                         },
//                     },
//                 ])
//                 .toArray();
//                console.log("Payment Schedule Response:", JSON.stringify(response, null, 2));
//             const total = response?.meta?.[0]?.total ?? 0;

//             return {
//                 bookings: response?.data ?? [],
//                 total,
//                 grand_total: response?.totalAmount,
//                 page,
//                 limit,
//                 totalPages: Math.ceil(total / limit),
//             };
//         } catch (err) {
//             console.error("getPaymentScheduleList error:", err);
//             throw new Error(err?.message || "Failed to fetch payment schedules");
//         }
//     },
// };


// getUpcomingBookings: async (query , decoded) => {
//     try {
//         let {
//             page = 1,
//             limit = 50,
//             startDate,
//             endDate,
//             status,
//             officer
//         } = query;
//         page = parseInt(page);
//         limit = parseInt(limit);
//         const collection = db.get().collection(COLLECTION.BOOKINGS);
//         const skip = (page - 1) * limit;
//         const matchFilter = {
//             status: { $ne: "CANCELLED" }
//         };
//         const isAdmin = Array.isArray(decoded?.designation) && decoded.designation.includes('ADMIN');
//         let officerIdList = [];
//         if (!isAdmin) {
//             officerIdList = Array.isArray(decoded?.officers)
//                 ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
//                 : [];
//         }
//         if (officer) {
//             matchFilter.officer_id = safeObjectId(officer);
//         }
//         else if (isAdmin) {
//             // make it empty
//         }
//         else if (officerIdList.length > 0) {
//             matchFilter.officer_id = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
//         } else if (decoded?._id != null) {
//             matchFilter.officer_id = safeObjectId(decoded?._id);
//         }

//         // ---- DATE RANGE FILTER ----
//         if (startDate || endDate) {
//             const parseDate = (str) => {
//                 if (!str) return null;
//                 const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
//                 if (match) {
//                     return new Date(
//                         Number(match[3]),
//                         Number(match[2]) - 1,
//                         Number(match[1])
//                     );
//                 }
//                 return new Date(str);
//             };
//             matchFilter.booking_date = {};

//             if (startDate) {
//                 matchFilter.booking_date.$gte = parseDate(startDate);
//             }
//             if (endDate) {
//                 const end = parseDate(endDate);
//                 end.setHours(23, 59, 59, 999);
//                 matchFilter.booking_date.$lte = end;
//             }
//         } else {
//             // Default upcoming filter (booking_date >= today)
//             const today = new Date();
//             today.setHours(0, 0, 0, 0);
//             matchFilter.booking_date = { $gte: today };
//         }

//         if (status) {
//             matchFilter.status = status;
//         }

//         const result = await collection.aggregate([
//             { $match: matchFilter },

//             {
//                 $project: {
//                     booking_no: 1,
//                     booking_date: 1,
//                     expected_closure_date: 1,
//                     customer_id: 1,
//                     customer_name: 1,
//                     product_id: 1,
//                     product_name: 1,
//                     total_amount: 1,
//                     grand_total: 1,
//                     status: 1,
//                     officer_id: 1,
//                     created_at: 1
//                 }
//             },

//             { $sort: { booking_date: 1 } },
//             { $skip: skip },
//             { $limit: limit },
//             {
//                 $facet: {
//                     data: [],
//                     meta: [{ $count: "total" }]
//                 }
//             }
//         ]).toArray()
//         const response = result[0];
//         const total = response.meta.length ? response.meta[0].total : 0;
//         return {
//             bookings: response.data,
//             page: page,
//             limit: limit,
//             total: total,
//             totalPages: Math.ceil(total / limit),
//         }
//     } catch (err) {
//         throw new Error(err.message);
//     }
// },



// getPaymentScheduleList: async (query,decoded) => {
//     try {
//         let {
//             page = 1,
//             limit = 20,
//             status,            // PENDING | PAID | etc.
//             // filter_status,     // UPCOMING | OVERDUE
//             startDate,
//             endDate,
//         } = query;
//         page = parseInt(page);
//         limit = parseInt(limit);
//         const collection = db.get().collection(COLLECTION.BOOKINGS);
//         const skip = (page - 1) * limit;
//         // Date parser
//         const parseDate = (str) => {
//             if (!str) return null;
//             const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
//             return m
//                 ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
//                 : new Date(str);
//         };
//         const today = new Date();
//         today.setHours(0, 0, 0, 0);
//         const matchFilter = {
//             "payment_schedule.due_date": { $exists: true },
//             status: { $ne: "CANCELLED" }
//         };
//         // 👉 Status filter
//         if (status) {
//             matchFilter["payment_schedule.status"] = status;
//         }

//         // // 👉 Upcoming / Overdue Filter
//         // if (filter_status === "UPCOMING") {
//         //     matchFilter["payment_schedule.status"] = { $ne: "PAID" };
//         //     matchFilter["payment_schedule.due_date"] = { $gte: today };
//         // }
//         // if (filter_status === "OVERDUE") {
//         //     matchFilter["payment_schedule.status"] = { $ne: "PAID" };
//         //     matchFilter["payment_schedule.due_date"] = { $lt: today };
//         // }

//         // 👉 Date range filter (optional)
//         if (startDate || endDate) {
//             matchFilter["payment_schedule.due_date"] = {};
//             if (startDate)
//                 matchFilter["payment_schedule.due_date"].$gte = parseDate(startDate);

//             if (endDate) {
//                 const end = parseDate(endDate);
//                 end.setHours(23, 59, 59, 999);
//                 matchFilter["payment_schedule.due_date"].$lte = end;
//             }
//         }

//         const result = await collection.aggregate([
//             { $unwind: "$payment_schedule" },
//             { $match: matchFilter },

//             {
//                 $project: {
//                     _id: 0,
//                     booking_id: "$_id",
//                     booking_no: 1,
//                     customer_name: 1,
//                     product_name: 1,
//                     payment_type: "$payment_schedule.payment_type",
//                     status: "$payment_schedule.status",
//                     amount: "$payment_schedule.amount",
//                     due_date: "$payment_schedule.due_date",
//                     paid_at: "$payment_schedule.paid_at",
//                     transaction_id: "$payment_schedule.transaction_id",
//                     payment_id: "$payment_schedule._id",
//                     remarks: "$payment_schedule.remarks",
//                 }
//             },

//             {
//                 $facet: {
//                     data: [
//                         { $sort: { due_date: 1 } },
//                         { $skip: skip },
//                         { $limit: limit }
//                     ],
//                     meta: [
//                         { $count: "total" }
//                     ],
//                     totalAmount: [
//                         { $group: { _id: null, amount: { $sum: "$amount" } } }
//                     ]
//                 }
//             }
//         ]).toArray();


//         const response = result[0];

//         return {
//             // success: true,
//             payments: response.data,
//             total: response.meta?.[0]?.total || 0,
//             total_amount: response.totalAmount?.[0]?.amount || 0,
//             page,
//             limit,
//             totalPages: Math.ceil((response.meta?.[0]?.total || 0) / limit)
//         };

//     } catch (err) {


//         throw new Error(err.message);
//     }
// },

//  createBooking: async (details) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 var { error, value } = bookingSchema.validate(details);
//                 if (error) return reject("Validation failed: " + error.details[0].message);
//                 value = cleanObject(value);
//                 details = value;
//                 const collection = db.get().collection(COLLECTION.BOOKINGS);
//                 const newNumber = await getNextSequence('booking_id');
//                 const booking_no = `AEBK${String(newNumber).padStart(6, '0')}`;

//                 if (!details.status) {
//                     details.status = BOOKING_STATUSES.PROCESSING;
//                 }
//                 // const status_history = [{
//                 //     status: details.status,
//                 //     changed_at: new Date(),
//                 //     changed_by: details.officer_id || null,
//                 // }];

//                 const result = await collection.insertOne({
//                     booking_no: booking_no,
//                     ...details,
//                     // status_history: status_history,
//                     created_at: new Date(),
//                     updated_at: new Date()
//                 });
//                 logActivity({
//                     type: "booked_product",
//                     client_id: safeObjectId(details.customer_id),
//                     officer_id: safeObjectId(details.officer_id),
//                     referrer_id: safeObjectId(result.insertedId),
//                     comment: " Booked Product: " + details.product_name + " for : " + details.grand_total,
//                 });
//                 resolve({
//                     insertedId: result.insertedId,
//                     booking_no
//                 });

//             } catch (err) {
//                 console.error(err);
//                 reject(err.message || "Error processing request");
//             }
//         });
//     },

// addPayment: async (id, paymentData) => {
//         return new Promise(async (resolve, reject) => {
//             try {

//                 var { error, value } = paymentScheduleSchema.validate(paymentData);
//                 if (error) return reject("Validation failed: " + error.details[0].message);
//                 paymentData = cleanObject(value);
//                 const objectId = safeObjectId(id);
//                 if (!objectId) return reject("Invalid booking ID");
//                 const collection = db.get().collection(COLLECTION.BOOKINGS);

//                 await collection.updateOne(
//                     { _id: objectId },
//                     {
//                         $push: { payment_schedule: paymentData },
//                         $set: { updated_at: new Date() }
//                     }
//                 ).then((updateResult) => {
//                     if (updateResult.modifiedCount === 0) {
//                         return reject("Payment not added");
//                     }
//                     resolve({ success: true, message: "Payment added successfully" });
//                 });
//             } catch (err) {
//                 console.error(err);
//                 reject(err.message || "Error adding payment");
//             }
//         });
//     },

//     updatePayment: async (bookingId, updateData) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 // Validate update body (partial allowed)
//                 const updatePayload = validatePartial(paymentScheduleSchema, updateData);

//                 if (!bookingId) return reject("Invalid booking ID");
//                 if (!updatePayload.id) return reject("Invalid payment ID");
//                 console.log("Update Payload:", updatePayload);
//                 await db.get().collection(COLLECTION.BOOKINGS).updateOne(
//                     {
//                         _id: safeObjectId(bookingId),
//                         "payment_schedule.id": updatePayload.id
//                     },
//                     {
//                         $set: {
//                             "payment_schedule.$": {
//                                 ...updatePayload,
//                             },
//                             updated_at: new Date()
//                         }
//                     }
//                 ).then((updateResult) => {
//                     if (updateResult.modifiedCount === 0) {
//                         return reject("Payment not found or no changes applied");
//                     }
//                     resolve({
//                         success: true,
//                         message: "Payment updated successfully"
//                     });
//                 });

//             } catch (err) {
//                 console.error(err);
//                 reject(err.message || "Error updating payment");
//             }
//         });
//     },
