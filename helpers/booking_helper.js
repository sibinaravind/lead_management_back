var db = require('../config/connection');
let COLLECTION = require('../config/collections');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { STATUSES } = require('../constants/enums');
const { bookingSchema } = require("../validations/bookingValidation");
const { safeObjectId } = require('../utils/safeObjectId');
const { logActivity } = require('./customer_interaction_helper');
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
                    details.status = STATUSES.PENDING;
                }
                const status_history = [{
                    status: details.status,
                    changed_at: new Date(),
                    changed_by: details.created_by || null,
                }];

                const result = await collection.insertOne({
                    booking_no: booking_no,
                    ...details,
                    status_history: status_history,
                    created_at: new Date(),
                    updated_at: new Date()
                });
                logActivity({
                            type: "booked_product",
                            client_id:safeObjectId(details.customer_id),
                            officer_id: safeObjectId(details.created_by),
                            referrer_id:safeObjectId(result.insertedId),
                            comment:" Booked Product: " +details.product + " , for : " + details.grand_total,
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
                customerId,
                productId,
                status,
                fromDate,
                toDate,
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

            // -------------------------
            // BUILD FILTER
            // -------------------------
            const filter = {};

            if (customerId) filter.customerId = customerId;
            if (productId) filter.productId = productId;
            if (status) filter.status = status;
            if (branch) filter.branch = branch;

            // Officer filter
            const isAdmin = decoded?.roles?.includes("ADMIN");
            if (!isAdmin) {
                filter.officerId = decoded?._id; // restrict to logged-in officer
            } else if (officer) {
                filter.officerId = officer; // admin can filter by officer
            }

            // Date range filter
            if (fromDate || toDate) {
                filter.startDate = {};
                if (fromDate) filter.startDate.$gte = new Date(fromDate);
                if (toDate) {
                    const end = new Date(toDate);
                    end.setHours(23, 59, 59, 999);
                    filter.startDate.$lte = end;
                }
            }

            // Search filter
            if (search) {
                const searchRegex = new RegExp(search, "i");
                filter.$or = [
                    { customerName: { $regex: searchRegex } },
                    { productName: { $regex: searchRegex } },
                    { bookingId: { $regex: searchRegex } },
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
                                        from: COLLECTION.CUSTOMERS,
                                        localField: "customerId",
                                        foreignField: "_id",
                                        as: "customer",
                                    },
                                },
                                { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
                                // Projection
                                {
                                    $project: {
                                        _id: 1,
                                        customerId: 1,
                                        productId: 1,
                                        totalAmount: 1,
                                        advancePaid: 1,
                                        balance: { $subtract: ["$totalAmount", "$advancePaid"] },
                                        startDate: 1,
                                        status: 1,
                                        officerId: 1,
                                        customerName: "$customer.name",
                                        createdAt: 1,
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

    /** -----------------------------------------------------
     *  UPDATE BOOKING STATUS
     * ----------------------------------------------------- */
    updateBookingStatus: async (id, newStatus, changedBy = null, remarks = "") => {
        return new Promise(async (resolve, reject) => {
            try {
                const objectId = safeObjectId(id);
                if (!objectId) return reject("Invalid booking ID");

                const collection = db.get().collection(COLLECTION.BOOKINGS);

                const history_entry = {
                    status: newStatus,
                    changed_at: new Date(),
                    changed_by: changedBy,
                    remarks: remarks
                };

                await collection.updateOne(
                    { _id: objectId },
                    {
                        $set: {
                            status: newStatus,
                            updated_at: new Date()
                        },
                        $push: { status_history: history_entry }
                    }
                );

                resolve({ success: true, message: "Status updated successfully" });

            } catch (err) {
                console.error(err);
                reject(err.message || "Error updating status");
            }
        });
    },

    addPayment: async (id, paymentData) => {
        return new Promise(async (resolve, reject) => {
            try {
                const objectId = safeObjectId(id);
                if (!objectId) return reject("Invalid booking ID");

                const collection = db.get().collection(COLLECTION.BOOKINGS);

                paymentData = cleanObject(paymentData);

                await collection.updateOne(
                    { _id: objectId },
                    {
                        $push: { payment_schedule: paymentData },
                        $set: { updated_at: new Date() }
                    }
                );

                resolve({ success: true, message: "Payment added successfully" });

            } catch (err) {
                console.error(err);
                reject(err.message || "Error adding payment");
            }
        });
    },

    updatePaymentStatus: async (id, paymentIndex, paymentStatus, transactionDetails = {}) => {
        return new Promise(async (resolve, reject) => {
            try {
                const objectId = safeObjectId(id);
                if (!objectId) return reject("Invalid booking ID");

                const collection = db.get().collection(COLLECTION.BOOKINGS);

                const updateFields = {
                    [`payment_schedule.${paymentIndex}.status`]: paymentStatus,
                    updated_at: new Date()
                };

                if (paymentStatus === 'PAID') {
                    updateFields[`payment_schedule.${paymentIndex}.paid_at`] = new Date();
                    if (transactionDetails.transactionId)
                        updateFields[`payment_schedule.${paymentIndex}.transaction_id`] = transactionDetails.transactionId;
                    if (transactionDetails.paymentMethod)
                        updateFields[`payment_schedule.${paymentIndex}.payment_method`] = transactionDetails.paymentMethod;
                }

                await collection.updateOne(
                    { _id: objectId },
                    { $set: updateFields }
                );

                resolve({ success: true, message: "Payment updated successfully" });

            } catch (err) {
                console.error(err);
                reject(err.message || "Error updating payment");
            }
        });
    }
};
