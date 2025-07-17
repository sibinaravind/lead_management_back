var db = require('../config/connection');
let COLLECTION = require('../config/collections')

module.exports = {
    getAnnouncements: async () => {
        const collection = db.get().collection(COLLECTION.ANNOUNCEMENTS);
        try {
            return await collection.find({}).toArray();
        } catch (err) {
            throw err;
        }
    }
    ,
    createAnnouncement: async (title, content,expire_on) => { 
        const collection = db.get().collection(COLLECTION.ANNOUNCEMENTS);
        try {
            const result = await collection.insertOne({
                title,
                content,
                expire_on,
                createdAt: new Date()
            });
            return result.insertedId;
        } catch (err) {
        
            throw err;
        }
    }
    ,
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
    }
    ,
    updateAnnouncement: async (announcementId, title, content) => {
        const collection = db.get().collection(COLLECTION.ANNOUNCEMENTS);
        try {
            const result = await collection.updateOne(
                { _id: new ObjectId(announcementId) },
                { $set: { title, content, updatedAt: new Date() } }
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
