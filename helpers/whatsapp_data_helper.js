const db = require('../config/connection');
const Joi = require('joi');
const { ObjectId } = require('mongodb');
const COLLECTION = require('../config/collections');
const { messageSchema } = require("../validations/whatsappValidation");
const { formatJoiErrors } = require("../utils/validatePartial");
const { safeObjectId } = require('../utils/safeObjectId');
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

function buildMediaUrl(mediaPath, baseUrl = null) {
    if (!mediaPath) return null;
    if (/^https?:\/\//i.test(mediaPath)) return mediaPath;
    const cleanBaseUrl = String(baseUrl || process.env.MEDIA_BASE_URL || process.env.DOMAIN_URL || process.env.APP_URL || '').replace(/\/+$/, '');
    if (!cleanBaseUrl) return null;
    const normalizedPath = String(mediaPath).replace(/^\/+/, '');
    return `${cleanBaseUrl}/uploads/whatsapp_media/${normalizedPath}`;
}

function normalizeViewMessage(message, options = {}) {
    const mediaUrl = buildMediaUrl(message?.media_path, options.baseUrl);
    return {
        id: message?._id?.toString?.() || null,
        message_id: message?.message_id || null,
        phone: message?.phone || null,
        message_text: message?.message_text || '',
        has_media: !!message?.has_media,
        media_path: message?.media_path || null,
        media_url: mediaUrl,
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

    getMessageById: async (messageId, options = {}) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                const query = ObjectId.isValid(messageId)
                    ? { _id: new ObjectId(messageId) }
                    : { message_id: messageId };

                const message = await collection.findOne(query);
                if (!message) return reject('Message not found');

                resolve(normalizeViewMessage(message, { baseUrl: options.base_url }));
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

    markAllAsViewed: async (phone) => {
        return new Promise(async (resolve, reject) => {
            try {
                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                let query = {
                    is_viewed: false,
                    outgoing: false,
                };

                // If input is valid ObjectId → treat as lead_id
                if (phone && ObjectId.isValid(phone) && String(phone).length === 24) {

                    query.lead_id = new ObjectId(phone);
                }
                // Else treat as phone number
                else if (phone) {

                    const cleanPhone = normalizePhone(phone);
                    query.phone = cleanPhone;
                }

                const result = await collection.updateMany(
                    query,
                    {
                        $set: {
                            is_viewed: true,
                            viewed_at: new Date(),
                        },
                    }
                );

                resolve({
                    success: true,
                    count: result.modifiedCount,
                });

            } catch (err) {
                console.error("Error marking messages as viewed:", err);
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
                    search,
                    base_url
                } = filters;

                const dbInstance = db.get();
                const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

                // Build query
                const query = {};
                if (direction) {
                    query.direction = direction;
                    query.outgoing = direction === 'outgoing';
                }
                if (phone) {
                    // If phone is a valid Mongo ObjectId, search by lead_id
                    if (ObjectId.isValid(phone) && String(phone).length === 24) {
                        query.lead_id = new ObjectId(phone);
                    } else {
                        query.phone = phone;
                    }
                }
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
                    }, { baseUrl: base_url });
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

    getThreadSummaries: async (filters = {}, decoded) => {
        try {
            const {
                page = 1,
                limit = 50,
                unread_only,
                search,
                base_url,
                employee
            } = filters;

            const dbInstance = db.get();
            const collection =
                dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);

            const unreadOnly =
                toBooleanOrNull(unread_only) === true;

            /* -----------------------------------
               Officer Access (Same as Leads)
            ----------------------------------- */

            const isAdmin =
                Array.isArray(decoded?.designation) &&
                decoded.designation.includes('ADMIN');

            let officerIdList = [];

            if (!isAdmin) {
                officerIdList = Array.isArray(decoded?.officers)
                    ? decoded.officers
                        .map(o => safeObjectId(o?.officer_id))
                        .filter(Boolean)
                    : [];
            }

            let officerFilter = null;

            if (employee) {
                officerFilter = safeObjectId(employee);
            }
            else if (!isAdmin && officerIdList.length) {
                officerFilter = {
                    $in: [
                        safeObjectId(decoded?._id),
                        ...officerIdList
                    ]
                };
            }
            else if (!isAdmin) {
                officerFilter = safeObjectId(decoded?._id);
            }

            /* -----------------------------------
               Search Filter
            ----------------------------------- */

            const matchQuery = {};

            if (search && search.trim()) {
                const s = search.trim();
                const digits = s.replace(/\D/g, '');

                matchQuery.$or = [
                    { message_text: { $regex: s, $options: 'i' } },
                    { sender_name: { $regex: s, $options: 'i' } },
                    {phone: { $regex: s, $options: 'i' } }
                ];

                if (digits) {
                    matchQuery.$or.push({
                        phone: { $regex: digits, $options: 'i' }
                    });
                }
            }

            /* -----------------------------------
               Aggregation Pipeline
            ----------------------------------- */

            const pipeline = [

                /* 1️⃣ Filter Early */
                { $match: matchQuery },

                /* 2️⃣ Sort for Latest */
                { $sort: { timestamp: -1 } },

                /* 3️⃣ Group Threads */
                {
                    $group: {
                        _id: { $ifNull: ['$lead_id', '$phone'] },

                        lead_id: { $first: '$lead_id' },

                        last_message: { $first: '$$ROOT' },

                        unread_count: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ['$outgoing', false] },
                                            { $eq: ['$is_viewed', false] }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },

                        total_messages: { $sum: 1 }
                    }
                },

                /* 4️⃣ Unread Only */
                ...(unreadOnly
                    ? [{ $match: { unread_count: { $gt: 0 } } }]
                    : []),

                /* 5️⃣ Join Leads */
                {
                    $lookup: {
                        from: COLLECTION.LEADS,
                        localField: 'lead_id',
                        foreignField: '_id',
                        as: 'lead'
                    }
                },

                {
                    $unwind: {
                        path: '$lead',
                        preserveNullAndEmptyArrays: true
                    }
                },

                /* 6️⃣ Officer Filter EARLY */
                ...(officerFilter
                    ? [{
                        $match: {
                            'lead.officer_id': officerFilter
                        }
                    }]
                    : []),

                /* 7️⃣ Join Officer (Lightweight) */
                {
                    $lookup: {
                        from: COLLECTION.OFFICERS,
                        let: { oid: '$lead.officer_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ['$_id', '$$oid'] }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    officer_id: 1
                                }
                            }
                        ],
                        as: 'officer'
                    }
                },

                {
                    $unwind: {
                        path: '$officer',
                        preserveNullAndEmptyArrays: true
                    }
                },

                /* 8️⃣ Reduce Payload */
                {
                    $project: {

                        lead_id: 1,

                        unread_count: 1,
                        total_messages: 1,

                        last_message: {
                            phone: 1,
                            message_text: 1,
                            timestamp: 1,
                            outgoing: 1,
                            sender_name: 1,
                            lead_id: 1
                        },

                        lead: {
                            _id: 1,
                            name: 1,
                            phone: 1,
                            whatsapp: 1,
                            email: 1,
                            client_id: 1,
                            officer_id: 1
                        },

                        officer: 1
                    }
                },

                /* 9️⃣ Sort Again */
                { $sort: { 'last_message.timestamp': -1 } },

                /* 🔟 Pagination + Stats */
                {
                    $facet: {

                        data: [
                            { $skip: (pageNum - 1) * limitNum },
                            { $limit: limitNum }
                        ],

                        totalCount: [
                            { $count: 'count' }
                        ],

                        unreadSummary: [
                            {
                                $group: {
                                    _id: null,

                                    unread_conversations: {
                                        $sum: {
                                            $cond: [
                                                { $gt: ['$unread_count', 0] },
                                                1,
                                                0
                                            ]
                                        }
                                    },

                                    unread_messages: {
                                        $sum: '$unread_count'
                                    }
                                }
                            }
                        ]
                    }
                }
            ];

            /* -----------------------------------
               Execute
            ----------------------------------- */

            const result = await collection
                .aggregate(pipeline, { allowDiskUse: true })
                .toArray();

            const facet = result[0] || {};

            const rows = facet.data || [];

            const total =
                facet.totalCount?.[0]?.count || 0;

            const unreadSummary =
                facet.unreadSummary?.[0] || {};

            /* -----------------------------------
               Format
            ----------------------------------- */

            const threads = rows.map(t => {

                const last = t.last_message || {};
                const lead = t.lead || {};
                const officer = t.officer || {};

                return {

                    threadId: String(t._id),

                    phone: last.phone || lead.phone || '',

                    unreadCount: t.unread_count || 0,

                    totalMessages: t.total_messages || 0,

                    lastMessage: last
                        ? normalizeViewMessage(last, {
                            baseUrl: base_url
                        })
                        : null,

                    leadId: lead?._id
                        ? String(lead._id)
                        : null,

                    clientGenId: lead.client_id || null,

                    name: lead.name || last.sender_name || 'Unknown',

                    whatsapp: lead.whatsapp || null,

                    email: lead.email || null,

                    officerId: officer?._id
                        ? String(officer._id)
                        : null,

                    officerGenId: officer?.officer_id || null,

                    officerName: officer?.name || null
                };
            });

            /* -----------------------------------
               Response
            ----------------------------------- */

            return {

                data: threads,

                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum)
                },

                summary: {
                    unread_conversations:
                        unreadSummary.unread_conversations || 0,

                    unread_messages:
                        unreadSummary.unread_messages || 0,

                    total_conversations: total
                }
            };

        } catch (err) {
            console.error('Thread summary error:', err);
            throw err;
        }
    },
    // getThreadSummaries: async (filters = {}) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             const {
    //                 page = 1,
    //                 limit = 50,
    //                 unread_only,
    //                 search,
    //                 base_url
    //             } = filters;

    //             const dbInstance = db.get();
    //             const collection = dbInstance.collection(COLLECTION.WHATSAPP_MESSAGES);

    //             const pageNum = parseInt(page);
    //             const limitNum = parseInt(limit);

    //             const unreadOnly = toBooleanOrNull(unread_only) === true;

    //             /* -----------------------------------
    //                Build Match Query
    //             ----------------------------------- */
    //             const query = {};

    //             if (search && String(search).trim()) {
    //                 const s = String(search).trim();
    //                 const digits = s.replace(/\D/g, '');

    //                 query.$or = [
    //                     { message_text: { $regex: s, $options: 'i' } },
    //                     { sender_name: { $regex: s, $options: 'i' } }
    //                 ];

    //                 if (digits) {
    //                     query.$or.push({ phone: { $regex: digits, $options: 'i' } });
    //                 }
    //             }

    //             /* -----------------------------------
    //                Aggregation Pipeline
    //             ----------------------------------- */
    //             const pipeline = [
    //                 // Filter first
    //                 { $match: query },

    //                 // Latest messages first
    //                 { $sort: { timestamp: -1 } },

    //                 // Group by lead_id OR phone
    //                 {
    //                     $group: {
    //                         _id: {
    //                             $ifNull: ['$lead_id', '$phone']
    //                         },

    //                         lead_id: { $first: '$lead_id' },

    //                         last_message: { $first: '$$ROOT' },

    //                         unread_count: {
    //                             $sum: {
    //                                 $cond: [
    //                                     {
    //                                         $and: [
    //                                             { $eq: ['$outgoing', false] },
    //                                             { $eq: ['$is_viewed', false] }
    //                                         ]
    //                                     },
    //                                     1,
    //                                     0
    //                                 ]
    //                             }
    //                         },

    //                         total_messages: { $sum: 1 }
    //                     }
    //                 },

    //                 // Only unread if needed
    //                 ...(unreadOnly
    //                     ? [{ $match: { unread_count: { $gt: 0 } } }]
    //                     : []),

    //                 // Join leads using lead_id
    //                 {
    //                     $lookup: {
    //                         from: COLLECTION.LEADS,
    //                         localField: 'lead_id',
    //                         foreignField: '_id',
    //                         as: 'lead'
    //                     }
    //                 },

    //                 // Convert lead array → object
    //                 {
    //                     $unwind: {
    //                         path: '$lead',
    //                         preserveNullAndEmptyArrays: true
    //                     }
    //                 },

    //                 // Sort again by latest msg
    //                 { $sort: { 'last_message.timestamp': -1 } },

    //                 // Pagination + Count + Summary
    //                 {
    //                     $facet: {
    //                         data: [
    //                             { $skip: (pageNum - 1) * limitNum },
    //                             { $limit: limitNum }
    //                         ],

    //                         totalCount: [
    //                             { $count: 'count' }
    //                         ],

    //                         unreadSummary: [
    //                             {
    //                                 $group: {
    //                                     _id: null,

    //                                     unread_conversations: {
    //                                         $sum: {
    //                                             $cond: [
    //                                                 { $gt: ['$unread_count', 0] },
    //                                                 1,
    //                                                 0
    //                                             ]
    //                                         }
    //                                     },

    //                                     unread_messages: {
    //                                         $sum: '$unread_count'
    //                                     }
    //                                 }
    //                             }
    //                         ]
    //                     }
    //                 }
    //             ];

    //             /* -----------------------------------
    //                Execute
    //             ----------------------------------- */
    //             const result = await collection
    //                 .aggregate(pipeline, { allowDiskUse: true })
    //                 .toArray();

    //             const facet = result[0] || {};

    //             const rows = facet.data || [];

    //             const total =
    //                 facet.totalCount?.[0]?.count || 0;

    //             const unreadSummary =
    //                 facet.unreadSummary?.[0] || {};

    //             /* -----------------------------------
    //                Format for Flutter
    //             ----------------------------------- */
    //             const threads = rows.map(t => {
    //                 const last = t.last_message || {};
    //                 const lead = t.lead || null;

    //                 return {
    //                     // Flutter: threadId
    //                     threadId: String(t._id),

    //                     // Flutter: phone
    //                     phone: last.phone || lead?.phone || '',

    //                     // Flutter: unreadCount
    //                     unreadCount: t.unread_count || 0,

    //                     // Flutter: totalMessages
    //                     totalMessages: t.total_messages || 0,

    //                     // Flutter: lastMessage
    //                     lastMessage: last
    //                         ? normalizeViewMessage(last, {
    //                             baseUrl: base_url
    //                         })
    //                         : null,

    //                     // Flutter: leadId
    //                     leadId: lead?._id
    //                         ? String(lead._id)
    //                         : last.lead_id
    //                             ? String(last.lead_id)
    //                             : null,

    //                     // Flutter: name
    //                     name: lead?.name || last.sender_name || 'Unknown',

    //                     // Flutter: whatsapp
    //                     whatsapp: lead?.whatsapp || null,

    //                     // Flutter: email
    //                     email: lead?.email || null
    //                 };
    //             });

    //             /* -----------------------------------
    //                Response
    //             ----------------------------------- */
    //             resolve({
    //                 data: threads,

    //                 pagination: {
    //                     page: pageNum,
    //                     limit: limitNum,
    //                     total,
    //                     pages: Math.ceil(total / limitNum)
    //                 },

    //                 summary: {
    //                     unread_conversations:
    //                         unreadSummary.unread_conversations || 0,

    //                     unread_messages:
    //                         unreadSummary.unread_messages || 0,

    //                     total_conversations: total
    //                 }
    //             });

    //         } catch (err) {
    //             console.error('Error fetching thread summaries:', err);
    //             reject(err);
    //         }
    //     });
    // },
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
