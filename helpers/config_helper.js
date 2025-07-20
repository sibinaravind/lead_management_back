var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const ObjectId = require('mongodb').ObjectId

module.exports = {
    configList: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                await db.get()
                    .collection(COLLECTION.CONFIG)
                    .findOne(
                        {
                            _id: ObjectId("6829fcbf3deca8f5b103613b")
                        }
                    ).then((result, err) => {
                        if (result) {
                            resolve(result);
                        } else {
                            reject(err || "Error processing request");
                        }
                    });
            } catch (error) {
                reject(error);
            }
        });
    },

    editConfig: async (data) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CONFIG);
                const docId = ObjectId("6829fcbf3deca8f5b103613b");
                const { field, action, value } = data;

                const doc = await collection.findOne({ _id: docId });
                if (!doc || !doc[field]) return reject("Field not found");

                let updateResult;
                let insertedId = null;

                if (action === "insert") {
                    // Only allow if status is 'ACTIVE' or 'INACTIVE'
                    if (value.status !== "ACTIVE" && value.status !== "INACTIVE") {
                        return reject("Status must be 'ACTIVE' or 'INACTIVE'");
                    }
                    if (typeof value.name !== "string" || value.name.trim() === "") {
                        return reject("Name cannot be empty");
                    }
                    // Check if name contains only special characters
                    if (/^[^a-zA-Z0-9]+$/.test(value.name.trim())) {
                        return reject("Valid name is required");
                    }

                    const newItem = { _id: new ObjectId(), ...value };
                    insertedId = newItem._id;
                    updateResult = await collection.updateOne(
                        { _id: docId },
                        { $push: { [field]: newItem } }
                    );
                }

                else if (action === "update") {
                    if (!value._id) return reject("Missing _id for update");

                    // Only allow if status is 'ACTIVE' or 'INACTIVE'
                    if (value.status !== undefined && value.status !== "ACTIVE" && value.status !== "INACTIVE") {
                        return reject("Status must be 'ACTIVE' or 'INACTIVE'");
                    }
                    if (typeof value.name !== "string" || value.name.trim() === "") {
                        return reject("Name cannot be empty");
                    }
                    if (/^[^a-zA-Z0-9]+$/.test(value.name.trim())) {
                        return reject("Valid name is required");
                    }

                    // Prevent updating the _id field
                    const { _id, ...rest } = value;
                    const updateFields = {};
                    for (const key in rest) {
                        if (rest[key] !== "" && rest[key] !== null && rest[key] !== undefined) {
                            updateFields[`${field}.$.${key}`] = rest[key];
                        }
                    }

                    if (Object.keys(updateFields).length === 0) {
                        return reject("No valid fields to update");
                    }

                    updateResult = await collection.updateOne(
                        { _id: docId, [`${field}._id`]: ObjectId(_id) },
                        { $set: updateFields }
                    );
                }

                else if (action === "delete") {
                    if (!value._id) return reject("Missing _id for delete");

                    updateResult = await collection.updateOne(
                        { _id: docId },
                        { $pull: { [field]: { _id: ObjectId(value._id) } } }
                    );
                }
                if (updateResult?.modifiedCount > 0) {
                    if (action === "insert") {
                        resolve({ status: true, insertedId });
                    } else {
                        resolve({ status: true });
                    }
                } else {
                    reject("No changes made");
                }

            } catch (error) {
                reject(error);
            }
        });
    },
  
    accessPermissionList: async () => {
    return new Promise(async (resolve, reject) => {
        try {
        const result = await db.get()
            .collection(COLLECTION.CONFIG)
            .findOne({ _id: ObjectId("682a9eeb231dc6e6d693248a") });

        if (!result) return reject("No data found");
        const { _id, ...roles } = result;
        const transformed = Object.entries(roles).map(([category, value]) => ({
            category,
            value
        }));
        resolve(transformed);
        } catch (error) {
        reject(error);
        }
    });
    },

    insertAccessPermissionList: async (data) => {
    return new Promise(async (resolve, reject) => {
        
        try {
            if (typeof data.category !== "string" || data.category.trim() === "") {
                        return reject("Category cannot be empty");
            }

            const result = await db.get()
                .collection(COLLECTION.CONFIG)
                .updateOne(
                    { 
                        _id: ObjectId("682a9eeb231dc6e6d693248a")
                    },
                    { $set:  {
                [data.category]: data.value 
                } }
                );

            if (result.modifiedCount > 0 || result.upsertedCount > 0) {
                resolve(`'${data.category}' Inserted successfully`);
            } else {
                reject("No document modified");
            }
        } catch (error) {
            reject(error);
        }
    });
   },

   deleteAccessPermission: async (roleKey) => {
    return new Promise(async (resolve, reject) => {
        try {
            const officerWithRole = await db.get()
                .collection(COLLECTION.OFFICERS)
                .findOne({ designation: roleKey });

            if (officerWithRole) {
                return reject(`Cannot delete '${roleKey}' – role is currently assigned to at least one officer.`);
            }
            const updateResult = await db.get()
                .collection(COLLECTION.CONFIG)
                .updateOne(
                    {
                        _id: ObjectId("682a9eeb231dc6e6d693248a")
                    },
                    {
                        $unset: { [roleKey]: "" }
                    }
                );

            if (updateResult.modifiedCount > 0) {
                resolve(`Role '${roleKey}' deleted successfully.`);
            } else {
                reject("No document modified or role not found.");
            }
        } catch (error) {
            reject(error);
        }
    });
   },   

    editAccessPermission: async ({ category, value }) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!category || !Array.isArray(value) || value.length === 0) {
                    return reject("Missing or invalid 'category' or 'value' array");
                }

                const collection = db.get().collection(COLLECTION.CONFIG);
                const docId = ObjectId("682a9eeb231dc6e6d693248a");

                const config = await collection.findOne({ _id: docId });

                if (!config || !config[category]) {
                    return reject(`Invalid category '${category}'`);
                }

                const updateFields = {};

                for (const item of value) {
                    const { field, value: fieldValue } = item;

                    if (!field || typeof fieldValue !== 'boolean') {
                        return reject("Each item in 'value' must include a 'field' and a boolean 'value'");
                    }

                    if (!(field in config[category])) {
                        return reject(`Field '${field}' not found in category '${category}'`);
                    }

                    updateFields[`${category}.${field}`] = fieldValue;
                }

                const updateResult = await collection.updateOne(
                    { _id: docId },
                    { $set: updateFields }
                );

                if (updateResult.modifiedCount > 0) {
                    resolve({ status: true });
                } else {
                    reject("No changes were made");
                }
            } catch (error) {
                reject(error.message || error);
            }
        });

    }
}



  // editConfig: async (data) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             const collection = db.get().collection(COLLECTION.CONFIG);
    //             const docId = ObjectId("6829fcbf3deca8f5b103613b");
    //             const { field, action, value } = data;

    //             const doc = await collection.findOne({ _id: docId });
    //             if (!doc || !doc[field]) return reject("Field not found");

    //             let updateResult;

    //             if (action === "insert") {
    //                 // Only allow if status is 'ACTIVE' or 'INACTIVE'
    //                 if (value.status !== "ACTIVE" && value.status !== "INACTIVE") {
    //                     return reject("Status must be 'ACTIVE' or 'INACTIVE'");
    //                 }
    //                 const newItem = { _id: new ObjectId(), ...value };
    //                 updateResult = await collection.updateOne(
    //                     { _id: docId },
    //                     { $push: { [field]: newItem } }
    //                 );
    //             }

    //             else if (action === "update") {
    //                 if (!value._id) return reject("Missing _id for update");

    //                 // Only allow if status is 'ACTIVE' or 'INACTIVE'
    //                 if (value.status !== undefined && value.status !== "ACTIVE" && value.status !== "INACTIVE") {
    //                     return reject("Status must be 'ACTIVE' or 'INACTIVE'");
    //                 }

    //                 // Prevent updating the _id field
    //                 const { _id, ...rest } = value;
    //                 const updateFields = {};
    //                 for (const key in rest) {
    //                     if (rest[key] !== "" && rest[key] !== null && rest[key] !== undefined) {
    //                         updateFields[`${field}.$.${key}`] = rest[key];
    //                     }
    //                 }

    //                 if (Object.keys(updateFields).length === 0) {
    //                     return reject("No valid fields to update");
    //                 }

    //                 updateResult = await collection.updateOne(
    //                     { _id: docId, [`${field}._id`]: ObjectId(_id) },
    //                     { $set: updateFields }
    //                 );
    //             }

    //             else if (action === "delete") {
    //                 if (!value._id) return reject("Missing _id for delete");

    //                 updateResult = await collection.updateOne(
    //                     { _id: docId },
    //                     { $pull: { [field]: { _id: ObjectId(value._id) } } }
    //                 );
    //             }
    //             console.log(updateResult);
    //             if (updateResult?.modifiedCount > 0) {
    //                 resolve({ status: true });
    //             } else {
    //                 reject("No changes made");
    //             }

    //         } catch (error) {
    //             reject(error);
    //         }
    //     });
    // },


    // accessPermissionList: async () => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             await db.get()
    //                 .collection(COLLECTION.CONFIG)
    //                 .findOne(
    //                     {
    //                         _id: ObjectId("682a9eeb231dc6e6d693248a")
    //                     }

    //                 ).then((result, err) => {
    //                     if (result) {
    //                         resolve(result);
    //                     } else {
    //                         reject(err || "Error processing request");
    //                     }
    //                 });
    //         } catch (error) {
    //             reject(error);
    //         }
    //     });
    // },