var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { STATUSES } = require('../constants/enums');
const { productSchema, productUpdateSchema } = require("../validations/product_validation");
const validatePartial = require("../utils/validatePartial");
const { ObjectId } = require('mongodb');
// Helper to get next sequence number
const { safeObjectId } = require('../utils/safeObjectId');
module.exports = {
    createProduct: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
                var { error, value } = productSchema.validate(details);
                if (error) return reject("Validation failed: " + error.details[0].message);
                value = Object.fromEntries(
                    Object.entries(value || {}).filter(([_, v]) =>
                        v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")
                    )
                );
                details = value;
                const collection = db.get().collection(COLLECTION.PRODUCTS);
                const newNumber = await getNextSequence('product_id');
                const product_id = `AEPID${String(newNumber).padStart(5, '0')}`;
                // Ensure status is present, else set to STATUSES.ACTIVE
                if (!details.status) {
                    details.status = STATUSES.ACTIVE;
                }
                collection.insertOne({
                    product_id: product_id,
                    ...details,
                    updated_at: new Date(),
                    created_at: new Date()
                }).then(result => {
                    if (result.acknowledged) {
                        resolve(result.insertedId);
                    } else {
                        reject("Insert failed");
                    }
                }).catch(err => {
                    reject("Error processing request");
                });
            } catch (err) {
                console.error(err);
                reject(err || "Error processing request");
            }
        });
    },
    // // Edit Project
    editProduct: async (product_id, updateFields) => {
        return new Promise(async (resolve, reject) => {
            try {
                const filteredFields = validatePartial(productUpdateSchema, updateFields);
                db.get().collection(COLLECTION.PRODUCTS).updateOne(
                    { _id: safeObjectId(product_id) },
                    { $set: { ...filteredFields, updated_at: new Date() } }
                ).then(result => {
                    if (result.modifiedCount > 0) {
                        resolve(true);
                    } else {
                        reject("Update failed or no changes made");
                    }
                }).catch(err => {

                    reject("Error processing request");
                });
            } catch (err) {

                reject(err || "Error processing request");
            }
        });
    },
    // // Get Client List  
    getProductList: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                resolve(await db.get().collection(COLLECTION.PRODUCTS).find({ status: { $ne: STATUSES.DELETED } }).toArray());
            } catch (err) {
                console.error(err);
                reject(err || "Error fetching product list");
            }
        });
    },

    // Get product detail with active discounts using aggregation for better performance
    getProductDetails: async (product_id) => {
        try {
            const today = new Date();

            const pipeline = [
                {
                    $match: {
                        _id: safeObjectId(product_id),
                        status: { $ne: STATUSES.DELETED }
                    }
                },
                {
                    $lookup: {
                        from: COLLECTION.DISCOUNT,
                        let: { prodId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $in: ["$$prodId", "$product_ids"] },
                                            { $lte: ["$valid_from", today] },
                                            { $gte: ["$valid_to", today] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "discounts"
                    }
                }
            ];

            const result = await db
                .get()
                .collection(COLLECTION.PRODUCTS)
                .aggregate(pipeline)
                .toArray();

            if (!result || result.length === 0) throw "Product not found";

            return result[0];
        } catch (err) {
            throw err;
        }
    },
    getProductIntrested: async (product_id) => {
        try {

            const result = await db
                .get()
                .collection(COLLECTION.LEADS)
                .aggregate([
                    {
                        $match: {
                            "product_interested.product_id": product_id,
                            status: { $ne: STATUSES.DELETED }
                        }
                    },
                    // take only this product from array
                    {
                        $project: {
                            name: 1,
                            phone: 1,
                            country_code: 1,
                            email: 1,
                            client_id: 1,
                            created_at: 1,
                            updated_at: 1,
                            status: 1,
                            lead_source: 1,
                            officer_id: 1,
                            product_interested: {
                                $filter: {
                                    input: "$product_interested",
                                    as: "pi",
                                    cond: { $eq: ["$$pi.product_id", product_id] }
                                }
                            }
                        }
                    },

                    // flatten product_interested so we can access offers
                    { $unwind: "$product_interested" },

                    // get last entry from offers
                    {
                        $addFields: {
                            lastOffer: { $arrayElemAt: ["$product_interested.offers", -1] }
                        }
                    },

                    // convert uploaded_at (dd/MM/yyyy) → actual Date object
                    {
                        $addFields: {
                            lastOfferDate: {
                                $dateFromString: {
                                    dateString: "$lastOffer.uploaded_at",
                                    format: "%d/%m/%Y"
                                }
                            }
                        }
                    },
                    // sort by latest offer date
                    { $sort: { lastOfferDate: -1 } }
                ])
                .toArray();

            return result;

        } catch (err) {
            throw err;
        }
    },

    // Add discount to product (with discount_id)
    addDiscount: async (discountDetails) => {
        try {
            const collection = db.get().collection(COLLECTION.DISCOUNT);

            const discount_id = new ObjectId();

            // Helper to convert dd mm yyyy to Date
            function parseDDMMYYYY(dateStr) {
                if (!dateStr) return null;
                const [dd, mm, yyyy] = dateStr.split(/[-\/\s]/).map(Number);
                if (!dd || !mm || !yyyy) return null;
                return new Date(yyyy, mm - 1, dd);
            }

            const discountObj = {
                _id: discount_id,
                title: discountDetails.title,
                percent: discountDetails.percent,

                valid_from: parseDDMMYYYY(discountDetails.valid_from),
                valid_to: parseDDMMYYYY(discountDetails.valid_to),

                product_ids: (discountDetails.product_id || []).map(id => safeObjectId(id)),
                created_at: new Date(),
                updated_at: new Date(),
                description: discountDetails.description || ""
            };

            await collection.insertOne(discountObj);

            return discount_id;

        } catch (err) {
            throw err;
        }
    },



    // Edit discount in product
    editDiscount: async (discount_id, updateData) => {
        try {
            const collection = db.get().collection(COLLECTION.DISCOUNT);

            updateData.updated_at = new Date();

            const updateResult = await collection.updateOne(
                { _id: safeObjectId(discount_id) },
                { $set: updateData }
            );

            if (updateResult.modifiedCount > 0) return true;
            throw "Discount not found";
        } catch (err) {
            throw err;
        }
    },

    // Delete discount from product
    deleteDiscount: async (discount_id) => {
        try {
            const collection = db.get().collection(COLLECTION.DISCOUNT);
            const deleteResult = await collection.deleteOne({
                _id: safeObjectId(discount_id)
            });

            if (deleteResult.deletedCount > 0) return true;
            throw "Discount not found";
        } catch (err) {
            throw err;
        }
    },

    // updateS: async (projectId) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             db.get().collection(COLLECTION.PROJECTS).updateOne(
    //                 { _id: ObjectId(projectId) },
    //                 { $set: { status: STATUSES.DELETED, updated_at: new Date() } }
    //             ).then(result => {
    //                 if (result.modifiedCount > 0) {
    //                     resolve(true);
    //                 } else {
    //                     reject("Delete failed or project not found");
    //                 }
    //             }).catch(err => {
    //                 console.error(err);
    //                 reject("Error deleting project");
    //             });
    //         } catch (err) {
    //             console.error(err);
    //             reject(err || "Error deleting client");
    //         }
    //     });
    // },


}