var db = require('../config/connection');
let COLLECTION = require('../config/collections');
const announcementValidation = require('../validations/announcementValidation'); 
const validatePartial = require("../utils/validatePartial");
const ObjectId = require('mongodb').ObjectId
module.exports = {
    getAnnouncements: async () => {
        const collection = db.get().collection(COLLECTION.ANNOUNCEMENTS);
        try {
            return await collection.find({}).toArray();
        } catch (err) {
            throw err;
        }
    },
   

    createAnnouncement: async (title, content, expire_on) => {
    const collection = db.get().collection(COLLECTION.ANNOUNCEMENTS);
    try {
        const { error, value } = announcementValidation.validate({ title, content, expire_on });
        if (error) {
        throw new Error("Validation failed: " + error.details[0].message);
        }

        const result = await collection.insertOne({
        title: value.title.trim(),
        content: value.content.trim(),
        expire_on: value.expire_on, // already parsed to Date
        createdAt: new Date()
        });

        return result.insertedId;

    } catch (err) {
        throw err;
    }
    },

    deleteAnnouncement: async (announcementId) => {     
        const collection = db.get().collection(COLLECTION.ANNOUNCEMENTS);
        try {
            const result = await collection.deleteOne({ _id: new ObjectId(announcementId) });
            if (result.deletedCount === 0) {
                throw new Error('Announcement not found');
            }
            return true;
        } catch (err) {
            throw err;
        }
    },
    updateAnnouncement: async (announcementId, data) => {
        console.log("Updating announcement with ID:", announcementId);
        const validatedData = validatePartial(announcementValidation, data);
        console.log("Validated data:", validatedData);
        try {
            const result = await db.get().collection(COLLECTION.ANNOUNCEMENTS).updateOne(
                { _id: new ObjectId(announcementId) },
                { $set: { ...validatedData, updatedAt: new Date() } }
            );
            if (result.matchedCount === 0) {
                throw new Error('Announcement not found');
            }
            return true;
        } catch (err) {
            throw err;
        }                   

    }

}
