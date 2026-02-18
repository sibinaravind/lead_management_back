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

function toBooleanOrNull(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }
    return null;
}

function normalizeViewMessage(message) {
    return {
        id: message?._id?.toString?.() || null,
        message_id: message?.message_id || null,
        phone: message?.phone || null,
        message_text: message?.message_text || '',
        has_media: !!message?.has_media,
        media_path: message?.media_path || null,
        outgoing: !!message?.outgoing,
        direction: message?.direction || (message?.outgoing ? 'outgoing' : 'incoming'),
        is_viewed: !!message?.is_viewed,
        timestamp: message?.timestamp || message?.created_at || null,
        lead_id: message?.lead_id || null,
        user: message?.user || null,
    };
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
            value.direction = value.outgoing ? 'outgoing' : 'incoming';
            value.is_viewed = value.outgoing ? true : !!value.is_viewed;
          
          
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

    getMessageById: async (messageId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const query = ObjectId.isValid(messageId)
                    ? { _id: new ObjectId(messageId) }
                    : { message_id: messageId };

                const message = await collection.findOne(query);
                if (!message) return reject('Message not found');

                resolve(message);
            } catch (err) {
                console.error('Error fetching message:', err);
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
                if (phone) query.phone = normalizePhone(phone);

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

                const query = ObjectId.isValid(messageId)
                    ? { _id: new ObjectId(messageId) }
                    : { message_id: messageId };

                const result = await collection.updateOne(
                    query,
                    { $set: { is_viewed: true, viewed_at: new Date() } }
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
                const cleanPhone = normalizePhone(phone);
                const result = await collection.updateMany(
                    { phone: cleanPhone, is_viewed: false, outgoing: false },
                    { $set: { is_viewed: true, viewed_at: new Date() } }
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
                    has_media,
                    search
                } = filters;

                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                // Build query
                const query = {};
                if (direction) {
                    query.direction = direction;
                    query.outgoing = direction === 'outgoing';
                }
                if (phone) query.phone = phone;
                const viewedFilter = toBooleanOrNull(is_viewed);
                if (viewedFilter !== null) query.is_viewed = viewedFilter;
                const mediaFilter = toBooleanOrNull(has_media);
                if (mediaFilter !== null) query.has_media = mediaFilter;
                if (search && String(search).trim()) {
                    query.message_text = { $regex: String(search).trim(), $options: 'i' };
                }

                // Get total count
                const total = await collection.countDocuments(query);

                // Get paginated results
                const messages = await collection
                    .find(query)
                    .sort({ timestamp: -1 })
                    .skip((page - 1) * parseInt(limit))
                    .limit(parseInt(limit))
                    .toArray();

                const phones = [...new Set(messages.map(m => m.phone).filter(Boolean))];
                let leadMap = new Map();
                if (phones.length > 0) {
                    const leads = await dbInstance.collection(COLLECTION.LEADS).find(
                        { $or: [{ phone: { $in: phones } }, { whatsapp: { $in: phones.map(p => `+91 ${p}`) } }] },
                        { projection: { _id: 1, name: 1, phone: 1, whatsapp: 1, email: 1 } }
                    ).toArray();

                    leadMap = new Map(leads.map(l => [normalizePhone(l.phone || l.whatsapp || ''), l]));
                }

                const normalized = messages.map((m) => {
                    const lead = leadMap.get(normalizePhone(m.phone));
                    return normalizeViewMessage({
                        ...m,
                        user: lead
                            ? {
                                lead_id: lead._id,
                                name: lead.name || 'Unknown',
                                phone: lead.phone || m.phone,
                                whatsapp: lead.whatsapp || null,
                                email: lead.email || null,
                            }
                            : {
                                lead_id: m.lead_id || null,
                                name: m.sender_name || 'Unknown',
                                phone: m.phone,
                                whatsapp: null,
                                email: null,
                            },
                    });
                });

                resolve({
                    data: normalized,
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

    getThreadSummaries: async (filters = {}) => {
        return new Promise(async (resolve, reject) => {
            try {
                const {
                    page = 1,
                    limit = 50,
                    unread_only,
                    search
                } = filters;

                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const query = {};
                const unreadOnly = toBooleanOrNull(unread_only) === true;
                if (search && String(search).trim()) {
                    const s = String(search).trim();
                    const digits = s.replace(/\D/g, '');
                    query.$or = [
                        { message_text: { $regex: s, $options: 'i' } }
                    ];
                    if (digits) {
                        query.$or.push({ phone: { $regex: digits, $options: 'i' } });
                    }
                }

                const aggregate = [
                    { $match: query },
                    { $sort: { timestamp: -1 } },
                    {
                        $group: {
                            _id: '$phone',
                            last_message: { $first: '$$ROOT' },
                            unread_count: {
                                $sum: {
                                    $cond: [
                                        { $and: [{ $eq: ['$outgoing', false] }, { $eq: ['$is_viewed', false] }] },
                                        1,
                                        0
                                    ]
                                }
                            },
                            total_messages: { $sum: 1 },
                        }
                    },
                    ...(unreadOnly ? [{ $match: { unread_count: { $gt: 0 } } }] : []),
                    { $sort: { 'last_message.timestamp': -1 } },
                ];

                const allThreads = await collection.aggregate(aggregate).toArray();
                const total = allThreads.length;
                const start = (parseInt(page) - 1) * parseInt(limit);
                const pagedThreads = allThreads.slice(start, start + parseInt(limit));

                const phones = [...new Set(pagedThreads.map(t => t._id).filter(Boolean))];
                let leadMap = new Map();
                if (phones.length > 0) {
                    const leads = await dbInstance.collection(COLLECTION.LEADS).find(
                        { $or: [{ phone: { $in: phones } }, { whatsapp: { $in: phones.map(p => `+91 ${p}`) } }] },
                        { projection: { _id: 1, name: 1, phone: 1, whatsapp: 1, email: 1 } }
                    ).toArray();

                    leadMap = new Map(leads.map(l => [normalizePhone(l.phone || l.whatsapp || ''), l]));
                }

                const threads = pagedThreads.map((t) => {
                    const phone = t._id;
                    const lead = leadMap.get(normalizePhone(phone));
                    const last = t.last_message || {};

                    return {
                        thread_id: phone,
                        phone,
                        unread_count: t.unread_count || 0,
                        total_messages: t.total_messages || 0,
                        last_message: normalizeViewMessage(last),
                        user: lead
                            ? {
                                lead_id: lead._id,
                                name: lead.name || 'Unknown',
                                phone: lead.phone || phone,
                                whatsapp: lead.whatsapp || null,
                                email: lead.email || null,
                            }
                            : {
                                lead_id: last.lead_id || null,
                                name: last.sender_name || 'Unknown',
                                phone,
                                whatsapp: null,
                                email: null,
                            }
                    };
                });

                const unreadConversations = allThreads.filter(t => (t.unread_count || 0) > 0).length;
                const unreadMessages = allThreads.reduce((sum, t) => sum + (t.unread_count || 0), 0);

                resolve({
                    data: threads,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / parseInt(limit)),
                    },
                    summary: {
                        unread_conversations: unreadConversations,
                        unread_messages: unreadMessages,
                        total_conversations: total,
                    }
                });
            } catch (err) {
                console.error('Error fetching thread summaries:', err);
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
module.exports.normalizePhone = normalizePhone;
module.exports.toBooleanOrNull = toBooleanOrNull;
