const db = require('../config/connection');
const Joi = require('joi');
const { ObjectId } = require('mongodb');
const COLLECTION = require('../config/collections');
const { messageSchema } = require("../validations/whatsappValidation");
const { formatJoiErrors } = require("../utils/validatePartial");

function extractPhoneNumber(jid) {
    // Extract phone number from JID
    // Examples:
    // "919876543210@s.whatsapp.net" -> "919876543210"
    // "188158255861827@lid" -> "188158255861827"
    if (!jid) return null;
    return jid.split('@')[0];
}
function normalizePhone(phone) {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('00')) {
        digits = digits.slice(2);
    }
    const countryCodes = [
        '971', // UAE
        '966', // Saudi
        '965', // Kuwait
        '91',  // India
        '92',  // Pakistan
        '1',   // USA/Canada
        '44',  // UK
        '61',  // Australia
        '49',  // Germany
        '81'   // Japan
    ];

    // Sort longest first (important!)
    countryCodes.sort((a, b) => b.length - a.length);

    // Remove country code only if number looks valid after removing
    for (const code of countryCodes) {
        if (
            digits.startsWith(code) &&
            digits.length > code.length + 6 // keep at least 7 digits
        ) {
            digits = digits.slice(code.length);
            break;
        }
    }

    return digits;
}

function addCountryCodeFormatted(phone, defaultCode = '91') {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, '');
    const countryCodes = [
        '971', // UAE
        '966', // Saudi
        '965', // Kuwait
        '91',  // India
        '92',  // Pakistan
        '1',   // USA
        '44',  // UK
        '61',  // Australia
    ];
    countryCodes.sort((a, b) => b.length - a.length);

    let code = null;
    let number = digits;
    for (const c of countryCodes) {
        if (digits.startsWith(c) && digits.length > c.length + 7) {
            code = c;
            number = digits.slice(c.length);
            break;
        }
    }

    // If no code found → use default
    if (!code) {
        code = defaultCode;
    }

    // Keep last 10 digits (safety for India-style numbers)
    if (number.length > 10) {
        number = number.slice(-10);
    }

    return `+${code} ${number}`;
}

const whatsappHelpers = {

    saveMessage: async (details) => {
        try {
           
            const { error, value } = messageSchema.validate(details, {
                abortEarly: false,
                stripUnknown: true
            });

            if (error) {
                const cleanErrors = formatJoiErrors(error, details);
                throw new Error("Validation failed: " + cleanErrors.join(", "));
            }
            const cleanPhone = normalizePhone(value.phone);
            const formattedPhone = addCountryCodeFormatted(cleanPhone);

            value.phone = cleanPhone;
          
          
            const dbInstance = db.get();
            const lead = await dbInstance
                .collection(COLLECTION.LEADS)
                .findOne({
                    $or: [
                        { phone: cleanPhone },
                        { whatsapp: formattedPhone }
                    ]
                });
            if (lead) {
                value.lead_id = lead._id;
            }
            const result = await dbInstance.collection(
                COLLECTION.WHATSAPP_MESSAGES
            ).updateOne(
                { message_id: value.message_id },
                { $setOnInsert: value },
                { upsert: true }
            );
            if (result.matchedCount > 0) {
                throw new Error("Message already exists");
            }
            return {
                _id: result.upsertedId,
                ...value
            };
        } catch (err) {
            console.error("❌ Error saving message:", err);
            throw err;
        }
    },

    getMessagesByPhone: async (phone, limit = 50) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const messages = await collection
                    .find({ phone: phone })
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .toArray();

                resolve(messages);

            } catch (err) {
                console.error('Error fetching messages:', err);
                reject(err);
            }
        });
    },

    /**
     * Get unviewed messages
     */
    getUnviewedMessages: async (phone = null) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const query = { is_viewed: false };
                if (phone) query.phone = phone;

                const messages = await collection
                    .find(query)
                    .sort({ timestamp: -1 })
                    .toArray();

                resolve(messages);

            } catch (err) {
                console.error('Error fetching unviewed messages:', err);
                reject(err);
            }
        });
    },

    /**
     * Mark message as viewed
     */
    markAsViewed: async (messageId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const result = await collection.updateOne(
                    { _id: new ObjectId(messageId) },
                    { $set: { is_viewed: true } }
                );

                if (result.matchedCount === 0) {
                    return reject("Message not found");
                }

                resolve({ success: true });

            } catch (err) {
                console.error('Error marking message as viewed:', err);
                reject(err);
            }
        });
    },

    /**
     * Mark all messages from phone as viewed
     */
    markAllAsViewed: async (phone) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const result = await collection.updateMany(
                    { phone: phone, is_viewed: false },
                    { $set: { is_viewed: true } }
                );

                resolve({ success: true, count: result.modifiedCount });

            } catch (err) {
                console.error('Error marking messages as viewed:', err);
                reject(err);
            }
        });
    },

    /**
     * Get messages with filters
     */
    getMessages: async (filters = {}) => {
        return new Promise(async (resolve, reject) => {
            try {
                const {
                    page = 1,
                    limit = 50,
                    direction,
                    phone,
                    is_viewed,
                    has_media
                } = filters;

                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                // Build query
                const query = {};
                if (direction) query.direction = direction;
                if (phone) query.phone = phone;
                if (typeof is_viewed !== 'undefined') query.is_viewed = is_viewed;
                if (typeof has_media !== 'undefined') query.has_media = has_media;

                // Get total count
                const total = await collection.countDocuments(query);

                // Get paginated results
                const messages = await collection
                    .find(query)
                    .sort({ timestamp: -1 })
                    .skip((page - 1) * parseInt(limit))
                    .limit(parseInt(limit))
                    .toArray();

                resolve({
                    data: messages,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / parseInt(limit))
                    }
                });

            } catch (err) {
                console.error('Error fetching messages:', err);
                reject(err);
            }
        });
    },

    /**
     * Get statistics
     */
    getStats: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const stats = await collection.aggregate([
                    {
                        $facet: {
                            total: [{ $count: 'count' }],
                            incoming: [
                                { $match: { direction: 'incoming' } },
                                { $count: 'count' }
                            ],
                            outgoing: [
                                { $match: { direction: 'outgoing' } },
                                { $count: 'count' }
                            ],
                            unviewed: [
                                { $match: { is_viewed: false, direction: 'incoming' } },
                                { $count: 'count' }
                            ],
                            withMedia: [
                                { $match: { has_media: true } },
                                { $count: 'count' }
                            ]
                        }
                    }
                ]).toArray();

                const result = {
                    total: stats[0].total[0]?.count || 0,
                    incoming: stats[0].incoming[0]?.count || 0,
                    outgoing: stats[0].outgoing[0]?.count || 0,
                    unviewed: stats[0].unviewed[0]?.count || 0,
                    withMedia: stats[0].withMedia[0]?.count || 0
                };

                resolve(result);

            } catch (err) {
                console.error('Error fetching stats:', err);
                reject(err);
            }
        });
    },

    /**
     * Delete message
     */
    deleteMessage: async (messageId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const result = await collection.deleteOne({
                    _id: new ObjectId(messageId)
                });

                if (result.deletedCount === 0) {
                    return reject("Message not found");
                }

                resolve({ success: true });

            } catch (err) {
                console.error('Error deleting message:', err);
                reject(err);
            }
        });
    },

    /**
     * Search messages
     */
    searchMessages: async (query, limit = 50) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const results = await collection
                    .find({
                        message_text: { $regex: query, $options: 'i' }
                    })
                    .sort({ timestamp: -1 })
                    .limit(parseInt(limit))
                    .toArray();

                resolve(results);

            } catch (err) {
                console.error('Error searching messages:', err);
                reject(err);
            }
        });
    }

};

module.exports = whatsappHelpers;
module.exports.extractPhoneNumber = extractPhoneNumber;