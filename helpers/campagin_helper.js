var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const ObjectId = require('mongodb').ObjectId
const fileUploader = require('../utils/fileUploader');
const fs = require('fs');
const Joi = require('joi');
const campaignValidation = require('../validations/campaginValidation');

module.exports = {
    createCampaign: async ( title, startDate, image ) => {
        // Validate input
        const { error } = campaignValidation.validate({ title, startDate, image });
        if (error) {
            throw new Error('Validation error: ' + error.details[0].message);
        }
        const collection = db.get().collection(COLLECTION.CAMPAIGNS);
        let imagePath = '';
        try {
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
            if (imagePath && fs.existsSync(imagePath)) {
                try {
                    await fs.promises.unlink(imagePath);
                    console.error(`Failed to upload`);
                } catch (unlinkErr) {
                    console.error(`Failed to upload`);
                }
            }
            throw err;
        }
    },
    deleteCampaign: async (campaignId) => {
        if (!ObjectId.isValid(campaignId)) {
            throw new Error('Invalid campaignId');
        }
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