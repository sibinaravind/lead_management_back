var db = require('../config/connection');
let COLLECTION = require('../config/collections')
// var request = require('request');
const ObjectID = require('mongodb').ObjectID
const config = require("../jwtconfig");
const jwt = require("jsonwebtoken");
const sharp = require('sharp');
var fs = require('fs');
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongodb');
const ensureDirectoryExists = (directory) => {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
};
module.exports = {
    authUser: (phone) => {
        return new Promise(async (resolve, reject) => {
            var code = Math.floor(1000 + Math.random() * 9000)
            await db.get()
                .collection(COLLECTION.EMPLOYEES)
                .findOne(
                    { phone: phone },
                    async (err, profile) => {
                        if (!profile) {
                            await db.get()
                                .collection(COLLECTION.EMPLOYEES)
                                .insertOne(
                                    {
                                        phone: phone,
                                        code: code,
                                        status: "inactive"
                                    }
                                )
                                .then((result) => {
                                    if (result.acknowledged) {

                                        request.get('https://www.fast2sms.com/dev/bulkV2?authorization=' + process.env.API_KEY + '&route=otp&variables_values=' + code + '&flash=0&numbers=' + (phone), function (err, res, body) {
                                            return resolve(["new_user", result.insertedId])
                                        })
                                    }
                                })
                        }
                        else if (profile.status == "inactive") {
                            await db.get()
                                .collection(COLLECTION.EMPLOYEES)
                                .updateOne(
                                    { _id: ObjectID(profile._id) },
                                    {
                                        $set: {
                                            code: code
                                        },
                                    })

                                .then((result) => {
                                    request.get('https://www.fast2sms.com/dev/bulkV2?authorization=' + process.env.API_KEY + '&route=otp&variables_values=' + code + '&flash=0&numbers=' + (profile.phone), function (err, ress, body) {
                                        return resolve(["inactive_user", profile._id])
                                    })
                                })
                        }
                        else if (profile.status == "active") {
                            return resolve(["active_user", profile._id])
                        }
                        else if (profile.status == "blocked") {
                            reject("user_blocked")
                        }
                        // else {
                        //     await db.get()
                        //         .collection(COLLECTION.EMPLOYEES)
                        //         .insertOne(
                        //             {
                        //                 phone: phone,
                        //                 code: code,
                        //                 status: "inactive"
                        //             }
                        //         )
                        //         .then((result) => {
                        //             if (result.acknowledged) {

                        //                  request.get('https://www.fast2sms.com/dev/bulkV2?authorization=' + process.env.API_KEY + '&route=otp&variables_values=' + code + '&flash=0&numbers=' + (phone), function (err, res, body) {
                        //                     return resolve(["new_user", profile._id])
                        //                  })
                        //             }
                        //         })
                        // }
                    },
                )

        })
    },
   
    resendCode: async (phone) => {
        return new Promise(async (resolve) => {
            await db.get()
                .collection(COLLECTION.EMPLOYEES)
                .findOne(
                    { phone: phone },
                    async (err, profile) => {
                        // request.get('https://www.fast2sms.com/dev/bulkV2?authorization=' + process.env.API_KEY + '&route=otp&variables_values=' + (profile.code) + '&flash=0&numbers=' + (profile.phone), function (err, ress, body) {
                        //     return resolve("msg Send")
                        // })
                    })
        })
    },

    verifyPassWord: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
                db.get()
                    .collection(COLLECTION.EMPLOYEES)
                    .findOne({ _id: ObjectID(details._id) }, async (err, user) => {
                        if (user) {
                            await bcrypt.compare(details.password, user.password).then(async (status) => {
                                if (status) {
                                    if (user.status == "active") {
                                        let token = jwt.sign({ username: user.phone, _id: user._id }, config.key);
                                        resolve(token)
                                    }
                                }
                                else {
                                    reject("Password Not Matching");
                                }
                            })
                        }
                        else {
                            reject("Error processing request");
                        }

                    })
            } catch (error) {

                reject("Error processing request");
            }
        });
    },

    verifyPhone: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await db.get()
                    .collection(COLLECTION.EMPLOYEES)
                    .updateOne(
                        { $and: [{ _id: ObjectID(details._id) }, { code: details.code }] },
                        {
                            $set: {
                                code: 0
                            },
                        }
                    );

                if (result.modifiedCount === 1) {
                    let token = jwt.sign({ phone: details.phone, _id: details._id }, config.key);
                    resolve(token);
                } else {
                    reject("Code not match");
                }
            } catch (error) {

                reject("Error processing request");
            }
        });
    },
    EMPLOYEESignUp: async (details) => {

        return new Promise(async (resolve, reject) => {
            try {
                var pass = await bcrypt.hash(details.password, 8);
                const result = await db.get()
                    .collection(COLLECTION.EMPLOYEES)
                    .updateOne(
                        { _id: ObjectID(details._id) },
                        {
                            $set: {
                                name: details.name,
                                email: details.email,
                                gender: details.gender,
                                city: details.city,
                                address: details.address,
                                dob: details.dob,
                                image: details.image,
                                password: pass,
                                profession: details.profession,
                                status: "active",
                                pets:[],
                                location: {
                                    type: "Point",
                                    coordinates: [
                                        parseFloat(details.latitude),
                                        parseFloat(details.longtitude),
                                    ]
                                }
                            },
                        }
                    );
            
                db.get()
                    .collection(COLLECTION.USERORDER)
                    .insertOne(
                        {
                            _id: ObjectID(details._id)
                        }
                    );
                if (result.modifiedCount === 1) {
                    resolve("User Created successful");
                } else {
                    reject("Error processing request");
                }
            } catch (error) {
                reject("Error processing request");
            }
        });
    },

    forgetPassword: async (id) => {
     
        return new Promise(async (resolve, reject) => {
            var code = Math.floor(1000 + Math.random() * 9000)
            await db.get()
                .collection(COLLECTION.EMPLOYEES)
                .findOneAndUpdate(
                    { _id: ObjectId(id) },
                    {
                        $set: {
                            code: code,
                        },
                    },
                    async (err, profile) => {
                       
                        if (profile) {
                            request.get('https://www.fast2sms.com/dev/bulkV2?authorization=' + process.env.API_KEY + '&route=otp&variables_values=' + (code) + '&flash=0&numbers=' + (profile.value.phone), function (err, ress, body) {
                                return resolve("msg Send")
                            })
                        }
                        else {
                            reject("No Account ")
                        }
                    })
        })
    },
    resetPassword: async (details) => {
        return new Promise(async (resolve, reject) => {
            var pass = await bcrypt.hash(details.password, 8);
            try {
                const result = await db.get()
                    .collection(COLLECTION.EMPLOYEES)
                    .updateOne(
                        { $and: [{ _id: ObjectID(details._id) }, { code: details.code }] },
                        {
                            $set: {
                                code: 0,
                                password: pass
                            },
                        }
                    );

                if (result.modifiedCount === 1) {
                    resolve("Password Updated");
                } else {
                    reject("Code not match");
                }
            } catch (error) {
                reject("Error processing request");
            }
        });
    },
    uploadProfileImage: async (file, id) => {
        return new Promise(async (resolve, reject) => {
            try {
                let image = file
            
                ensureDirectoryExists('./uploads/ProfilePhoto');
                ensureDirectoryExists('./uploads/ProfilePhoto/thumbnail');
                await sharp(image.data)
                    .webp()
                    .toFile('./uploads/ProfilePhoto/' + id + ".webp");
                await sharp(image.data)
                    .resize({ width: 250, height: 250 })
                    .webp()
                    .toFile('./uploads/ProfilePhoto/thumbnail/' + id + ".webp");
                resolve('success')
            } catch (error) {
                reject("Error processing request");
            }
        });
    },
    basicUserDeatils: (user_id) => {
        return new Promise(async (resolve) => {
            resolve(await db.get().collection(COLLECTION.EMPLOYEES)
                .aggregate([
                    {
                        $match: {
                            "_id": ObjectId(user_id)
                        }
                    },
                    {
                        $lookup: {
                            from: "petProfile",
                            localField: "pets",
                            foreignField: "_id",
                            as: "petDetails"
                        }
                    },
                    {
                        $unwind: "$petDetails"
                    },

                    {
                        $project: {
                            "_id": 0,
                            order_id: "$petDetails._id",
                            order_titile: "$petDetails.title",
                            order_status: "$petDetails.status",
                            order_time: "$petDetails.timestamp",

                        }
                    }

                ]).toArray()
            );
        })
    },

}