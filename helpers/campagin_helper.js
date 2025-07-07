var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const ObjectId = require('mongodb').ObjectId
const fileUploader = require('../utils/fileUploader');
const fs = require('fs');
module.exports = {

    createCampaign: async ( title, startDate, image ) => {
        const collection = db.get().collection(COLLECTION.CAMPAIGNS);
        let imagePath = '';

        try {
            // 2. Handle base64 image upload
            if (image?.base64) {
                imagePath = await fileUploader.processAndStoreBase64File({
                    base64Data: image.base64,
                    originalName: image.name || 'campaign',
                    uploadsDir: './uploads/campaign_images'
                });
            }

            const result = await collection.insertOne({
                title,
                startDate: startDate ? new Date(startDate) : null,
                image: imagePath || null,
                createdAt: new Date()
            });
            return result.insertedId;
        } catch (err) {
            // 🧹 Cleanup uploaded file if insertion fails
            if (imagePath && fs.existsSync(imagePath)) {
                try {
                    await fs.promises.unlink(imagePath);
                    console.error(`Failed to upload`);
                } catch (unlinkErr) {
                    console.error(`Failed to upload`);
                }
            }
            throw err; // rethrow the original error
        }
    },
    deleteCampaign: async (campaignId) => {
        const collection = db.get().collection(COLLECTION.CAMPAIGNS);
        let campaign = null;
        try {
            campaign = await collection.findOne({ _id: new ObjectId(campaignId) });
        } catch (err) {
            campaign = null;
        }

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        // Delete associated image file if exists
        if (campaign.image) {
            if (fs.existsSync(campaign.image)) {
                try {
                    await fs.promises.unlink(campaign.image);
                } catch (err) {
                    console.error('Failed to delete campaign image:', err);
                }
            }
        }

        const result = await collection.deleteOne({ _id: new ObjectId(campaignId) });
        return result.deletedCount > 0;
    },
    getCampaignsList: async () => {
        const collection = db.get().collection(COLLECTION.CAMPAIGNS);
        return await collection.find({}).toArray();
    },

}