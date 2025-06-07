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
                const doc = await db.get()
                    .collection(COLLECTION.CONFIG)
                    .findOne({ _id: ObjectId("6829fcbf3deca8f5b103613b") });

                if (!doc || !Object.prototype.hasOwnProperty.call(doc, data.field)) {
                    return reject("Field does not exist in document");
                }

                await db.get()
                    .collection(COLLECTION.CONFIG)
                    .updateOne(
                        { _id: ObjectId("6829fcbf3deca8f5b103613b") },
                        { $set: { [data.field]: data.value } }
                    ).then((result, err) => {
                        if (result && result.modifiedCount > 0) {
                            resolve({ status: true });
                        } else {
                            reject(err || "No document updated");
                        }
                    });
            } catch (error) {
                reject(error);
            }
        });
    },

    accessPermissionList: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                await db.get()
                    .collection(COLLECTION.CONFIG)
                    .findOne(
                        {
                            _id: ObjectId("682a9eeb231dc6e6d693248a")
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

    editAccessPermission: async (data) => {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = await db.get()
                    .collection(COLLECTION.CONFIG)
                    .findOne({ _id: ObjectId("682a9eeb231dc6e6d693248a") });

                if (!doc || !Object.prototype.hasOwnProperty.call(doc, data.field)) {
                    return reject("Field does not exist in document");
                }

                await db.get()
                    .collection(COLLECTION.CONFIG)
                    .updateOne(
                        { _id: ObjectId("682a9eeb231dc6e6d693248a") },
                        { $set: { [data.field]: data.value } }
                    ).then((result, err) => {
                        if (result && result.modifiedCount > 0) {
                            resolve({ status: true });
                        } else {
                            reject(err || "No document updated");
                        }
                    });
            } catch (error) {
                reject(error);
            }
        });
    },
}