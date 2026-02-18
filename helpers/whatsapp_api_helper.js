
const crypto = require('crypto');
const https = require('https');
const WhatsAppMediaHandler = require('../services/whatsapp_media_handler');
const { WhatsAppReplyHandler } = require('../services/whatsapp_reply_handler');
const whatsappHelpers = require('../helpers/whatsapp_data_helper');
const { getIO } = require('../services/socket_server');
const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v22.0';

let mediaHandler;

function initMediaHandler() {
    if (!mediaHandler) {
        mediaHandler = new WhatsAppMediaHandler({
            uploadsDir: process.env.WHATSAPP_UPLOADS_DIR || 'uploads/whatsapp_media',
            collection: 'whatsapp_messages',
            accessToken: process.env.ACCESS_TOKEN,
            maxFileSize: 16 * 1024 * 1024,
            allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
            allowedAudioTypes: ['audio/ogg', 'audio/mpeg', 'audio/amr', 'audio/mp4'],
            allowedVideoTypes: ['video/mp4', 'video/3gpp'],
            allowedDocTypes: [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ],
        });
    }
    return mediaHandler;
}

// const replyHandler = new WhatsAppReplyHandler({
//     companyName: 'Alead Solutions',
//     supportEmail: 'support@aleadsolutions.com',
//     supportPhone: '+91 8301031955',
//     businessHours: 'Mon-Fri, 9AM - 6PM IST',
//     websiteUrl: 'www.aleadsolutions.com',
// });

// replyHandler.registerHandler(
//     'special_offer',
//     /offer|discount|promo/i,
//     async () => ({
//         type: 'text',
//         text:
//             `🎉 *Special Offers*\n\n` +
//             `• 20% off Premium\n` +
//             `• Buy 2 Get 1\n` +
//             `• First-time Discount\n\n` +
//             `Type *contact* to claim`,
//     })
// );


// ══════════════════════════════════════════════════════════════════════════════
// CORE HTTP – replaces node-fetch (works on all Node versions)
// ══════════════════════════════════════════════════════════════════════════════
function callGraphApi(phoneId, payload) {
    return new Promise((resolve, reject) => {
        console.log('📤 Calling Graph API with payload:', payload);
         console.log('📤 Calling Graph API with payload:', payload);
        const body = JSON.stringify(payload);
        const options = {
            hostname: 'graph.facebook.com',
            path: `/${GRAPH_API_VERSION}/${phoneId}/messages`,
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log('✅ Message sent successfully');
                        resolve({ success: true, data: parsed });
                    } else {
                        console.error('❌ Graph API error:', parsed.error);
                        resolve({ success: false, error: parsed.error });
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Graph API response'));
                }
            });
        });
        req.on('error', (error) => {
            console.error('❌ Network error:', error);
            resolve({ success: false, error: error.message });
        });
        req.write(body);
        req.end();
    });
}

function fetchGraphJson(pathname) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'graph.facebook.com',
            path: pathname,
            method: 'GET',
            headers: {
                Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let parsed = {};
                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch (parseError) {
                    return reject(new Error('Failed to parse Graph API JSON response'));
                }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    return resolve(parsed);
                }

                return reject(new Error(parsed?.error?.message || `Graph API request failed (${res.statusCode})`));
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function fetchBinaryWithAuth(url) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    return resolve({
                        buffer: Buffer.concat(chunks),
                        contentType: res.headers['content-type'],
                    });
                }
                return reject(new Error(`Failed to download media (${res.statusCode})`));
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function downloadIncomingMedia(message) {
    const mediaType = message.type;
    const mediaObject = message[mediaType] || {};
    const mediaId = mediaObject.id;

    if (!mediaId) {
        throw new Error(`Missing media id for ${mediaType} message`);
    }

    const mediaMeta = await fetchGraphJson(`/${GRAPH_API_VERSION}/${mediaId}`);
    if (!mediaMeta?.url) {
        throw new Error(`Missing download URL for media id ${mediaId}`);
    }

    const fileResponse = await fetchBinaryWithAuth(mediaMeta.url);

    return {
        mediaId,
        mediaType,
        buffer: fileResponse.buffer,
        mimeType: mediaMeta.mime_type || mediaObject.mime_type || fileResponse.contentType || 'application/octet-stream',
        caption: mediaObject.caption || '',
        filename: mediaObject.filename || null,
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// DB + SOCKET HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function saveAndEmit({ messageId, phone, messageText, hasMedia, mediaPath, outgoing, timestamp }) {
    try {
        await whatsappHelpers.saveMessage({
            message_id: messageId,
            outgoing,
            phone,
            isFromGroup: false,
            message_text: messageText,
            has_media: hasMedia,
            media_path: mediaPath,
            is_viewed: outgoing,
            timestamp: timestamp || new Date(),
        });

        getIO()?.emit('new_message', {
            message_id: messageId,
            outgoing,
            phone,
            isFromGroup: false,
            message_text: messageText,
            has_media: hasMedia,
            media_path: mediaPath,
            is_viewed: outgoing,
            timestamp: timestamp || new Date(),
        });

        console.log(`💾 Saved ${outgoing ? 'outgoing' : 'incoming'} message: ${messageId}`);
    } catch (dbError) {
        if (!dbError?.message?.includes('already exists')) {
            console.error('DB error:', dbError);
        }
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK VERIFY  →  GET /webhook
// ══════════════════════════════════════════════════════════════════════════════

exports.verifyWebhook = (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        console.log('✅ Webhook Verified');
        return res.status(200).send(challenge);
    }

    console.log('❌ Verification failed');
    return res.sendStatus(403);
};


// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK RECEIVER  →  POST /webhook
// ══════════════════════════════════════════════════════════════════════════════

exports.receiveWebhook = async (req, res) => {
    const body = req.body;
    console.log('📨 Incoming Webhook:', JSON.stringify(body, null, 2));

    if (!verifySignature(req, body)) {
        console.log('❌ Invalid signature');
        return res.sendStatus(401);
    }

    if (body.object !== 'whatsapp_business_account') {
        return res.sendStatus(404);
    }

    body.entry?.forEach(entry => {
        entry.changes?.forEach(change => {
            if (change.field === 'messages') {
                processMessages(change.value);
            }
        });
    });

    res.sendStatus(200);
};


// ══════════════════════════════════════════════════════════════════════════════
// INCOMING MESSAGE PROCESSOR
// ══════════════════════════════════════════════════════════════════════════════

function processMessages(value) {
    if (value.messages) {
        value.messages.forEach(msg => handleMessage(msg, value));
    }
    if (value.statuses) {
        value.statuses.forEach(status => {
            console.log(`📊 Status: ${status.status} - ${status.id}`);
        });
    }
}

async function handleMessage(message, value) {
    const phoneId   = value?.metadata?.phone_number_id;
    const from      = message.from;
    const messageId = message.id;
    const timestamp = new Date(message.timestamp * 1000);

    console.log(`📞 From: ${from} | ID: ${messageId} | Time: ${timestamp.toISOString()}`);

    try {
        switch (message.type) {
            case 'text':
                await handleText(message, phoneId, from, timestamp);
                break;
            case 'image':
            case 'video':
            case 'audio':
            case 'document':
            case 'sticker':
                await handleMedia(message, phoneId, from, value, timestamp);
                break;
            case 'location':
                await handleLocation(message, phoneId, from, timestamp);
                break;
            case 'contacts':
                await handleContacts(message, phoneId, from, timestamp);
                break;
            case 'interactive':
                await handleInteractive(message, phoneId, from, timestamp);
                break;
            default:
                console.log(`❓ Unknown type: ${message.type}`);
                await exports.sendText(phoneId, from, 'Message type not supported yet.');
        }
    } catch (err) {
        console.error('❌ Handler error:', err);
        await exports.sendText(phoneId, from, '❌ Error processing your message. Please try again or contact support.');
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// INCOMING TYPE HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

async function handleText(message, phoneId, from, timestamp) {
    const text = message.text.body;

    // Save incoming to DB + emit socket
    await saveAndEmit({
        messageId:   message.id,
        phone:       from,
        messageText: text,
        hasMedia:    false,
        mediaPath:   null,
        outgoing:    false,
        timestamp,
    });

    // Auto-reply
    const replyData = await replyHandler.processMessage(text, { from, phoneId, messageId: message.id });
    if (replyData?.text) {
        await exports.sendText(phoneId, from, replyData.text);
    }
}

async function handleMedia(message, phoneId, from, value, timestamp) {
    const handler   = initMediaHandler();
    const mediaType = message.type;
    const caption   = message[mediaType]?.caption || '';

    console.log(`📎 Processing ${mediaType.toUpperCase()}...`);

    try {
        const mediaPayload = await downloadIncomingMedia(message);
        const normalizedType = mediaType === 'sticker' ? 'image' : mediaType;

        const result = await handler.processIncomingMedia(mediaPayload.buffer, {
            type: normalizedType,
            mime_type: mediaPayload.mimeType,
            caption: mediaPayload.caption,
            filename: mediaPayload.filename,
            from,
            sender_name: value?.contacts?.[0]?.profile?.name || 'Unknown',
            message_id: message.id,
        }, {
            timestamp: Math.floor(timestamp.getTime() / 1000),
        });

        console.log(`✅ Media stored: ID=${result._id}, path=${result.file_path}`);

        await saveAndEmit({
            messageId:   message.id,
            phone:       from,
            messageText: caption,
            hasMedia:    true,
            mediaPath:   result.file_path,
            outgoing:    false,
            timestamp,
        });

        await exports.sendText(phoneId, from, generateMediaResponse(message, result));

    } catch (error) {
        console.error(`❌ Media error (${mediaType}):`, error);

        let errorMsg = `❌ Sorry, there was an error processing your ${mediaType}.\n\n`;
        if (error.message.includes('File size exceeds'))    errorMsg += `⚠️ File too large. Max 16MB.\n\n`;
        else if (error.message.includes('MIME type'))       errorMsg += `⚠️ File type not supported.\n\n`;
        else if (error.message.includes('Failed to download')) errorMsg += `⚠️ Could not download file.\n\n`;
        else errorMsg += `Error: ${error.message}\n\n`;
        errorMsg += `Please try again or contact support.`;

        await exports.sendText(phoneId, from, errorMsg);
    }
}

async function handleLocation(message, phoneId, from, timestamp) {
    const { latitude, longitude, name, address } = message.location;

    await saveAndEmit({
        messageId:   message.id,
        phone:       from,
        messageText: `📍 Location: ${latitude}, ${longitude}`,
        hasMedia:    false,
        mediaPath:   null,
        outgoing:    false,
        timestamp,
    });

    await exports.sendText(phoneId, from,
        `📍 *Location Received!*\n\n` +
        `Latitude: ${latitude}\nLongitude: ${longitude}\n` +
        (name    ? `Name: ${name}\n`       : '') +
        (address ? `Address: ${address}\n` : '') +
        `\nThank you! Type *menu* if you need assistance.`
    );
}

async function handleContacts(message, phoneId, from, timestamp) {
    const contacts = message.contacts;

    await saveAndEmit({
        messageId:   message.id,
        phone:       from,
        messageText: `👤 Shared ${contacts.length} contact(s)`,
        hasMedia:    false,
        mediaPath:   null,
        outgoing:    false,
        timestamp,
    });

    await exports.sendText(phoneId, from,
        `👤 *Contact Information Received!*\n\n` +
        `Number of contacts: ${contacts.length}\n\n` +
        `Thank you! Type *menu* for options.`
    );
}

async function handleInteractive(message, phoneId, from, timestamp) {
    const interactive  = message.interactive;
    let selectedOption = '';

    if (interactive.type === 'button_reply') {
        selectedOption = interactive.button_reply.title;
    } else if (interactive.type === 'list_reply') {
        selectedOption = interactive.list_reply.title;
    }

    await saveAndEmit({
        messageId:   message.id,
        phone:       from,
        messageText: `🔘 Selected: ${selectedOption}`,
        hasMedia:    false,
        mediaPath:   null,
        outgoing:    false,
        timestamp,
    });

    await exports.sendText(phoneId, from,
        `✅ *Selection Received!*\n\nYou selected: *${selectedOption}*\n\nType *menu* for more options.`
    );
}


// ══════════════════════════════════════════════════════════════════════════════
// SEND – OUTGOING (all exported, callable from routes)
// ══════════════════════════════════════════════════════════════════════════════

// ─── Send plain text ──────────────────────────────────────────────────────────
exports.sendText = async (phoneId, to, text) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
    });
    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: text,
            hasMedia:    false,
            mediaPath:   null,
            outgoing:    true,
        });
    }

    return result;
};

// ─── Send image ───────────────────────────────────────────────────────────────
// { link, caption? }  OR  { id, caption? }
exports.sendImage = async (phoneId, to, { link, id, caption }) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: { ...(link ? { link } : { id }), caption },
    });

    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: caption || '',
            hasMedia:    true,
            mediaPath:   link || id,
            outgoing:    true,
        });
    }

    return result;
};

// ─── Send video ───────────────────────────────────────────────────────────────
exports.sendVideo = async (phoneId, to, { link, id, caption }) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'video',
        video: { ...(link ? { link } : { id }), caption },
    });

    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: caption || '',
            hasMedia:    true,
            mediaPath:   link || id,
            outgoing:    true,
        });
    }

    return result;
};

// ─── Send audio ───────────────────────────────────────────────────────────────
exports.sendAudio = async (phoneId, to, { link, id }) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'audio',
        audio: { ...(link ? { link } : { id }) },
    });

    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: '',
            hasMedia:    true,
            mediaPath:   link || id,
            outgoing:    true,
        });
    }

    return result;
};

// ─── Send document ────────────────────────────────────────────────────────────
exports.sendDocument = async (phoneId, to, { link, id, filename, caption }) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: { ...(link ? { link } : { id }), filename, caption },
    });

    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: caption || '',
            hasMedia:    true,
            mediaPath:   link || id,
            outgoing:    true,
        });
    }

    return result;
};

function parseBase64Payload(input) {
    if (!input || typeof input !== 'string') {
        throw new Error('fileBase64 must be a base64 string');
    }

    const match = input.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
        return { mimeTypeFromDataUri: match[1], rawBase64: match[2] };
    }

    return { mimeTypeFromDataUri: null, rawBase64: input };
}

async function uploadMediaFromBase64(phoneId, { fileBase64, mimeType, filename }) {
    const { mimeTypeFromDataUri, rawBase64 } = parseBase64Payload(fileBase64);
    const resolvedMimeType = mimeType || mimeTypeFromDataUri || 'application/octet-stream';
    const cleanBase64 = rawBase64.replace(/\s/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (!buffer.length) {
        throw new Error('Decoded media is empty');
    }

    if (buffer.length > 16 * 1024 * 1024) {
        throw new Error('File size exceeds 16MB WhatsApp limit');
    }

    const form = new FormData();
    const safeFilename = filename || `upload_${Date.now()}`;
    form.append('file', new Blob([buffer], { type: resolvedMimeType }), safeFilename);
    form.append('messaging_product', 'whatsapp');
    form.append('type', resolvedMimeType);

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/media`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
        body: form,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to upload media to WhatsApp');
    }

    if (!data?.id) {
        throw new Error('Media upload succeeded but media id was not returned');
    }

    return { mediaId: data.id, mimeType: resolvedMimeType };
}

exports.sendMediaFromBinary = async (phoneId, to, { mediaType, fileBase64, mimeType, filename, caption }) => {
    const normalizedType = (mediaType || '').toLowerCase();
    const { mediaId } = await uploadMediaFromBase64(phoneId, { fileBase64, mimeType, filename });

    switch (normalizedType) {
        case 'image':
            return exports.sendImage(phoneId, to, { id: mediaId, caption });
        case 'video':
            return exports.sendVideo(phoneId, to, { id: mediaId, caption });
        case 'audio':
            return exports.sendAudio(phoneId, to, { id: mediaId });
        case 'document':
            return exports.sendDocument(phoneId, to, { id: mediaId, filename, caption });
        default:
            throw new Error('Unsupported mediaType for binary send. Use image, video, audio, or document.');
    }
};

// ─── Send location pin ────────────────────────────────────────────────────────
exports.sendLocation = async (phoneId, to, { latitude, longitude, name = '', address = '' }) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'location',
        location: { latitude, longitude, name, address },
    });

    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: `📍 Location: ${latitude}, ${longitude}`,
            hasMedia:    false,
            mediaPath:   null,
            outgoing:    true,
        });
    }

    return result;
};

// ─── Send approved template ───────────────────────────────────────────────────
exports.sendTemplate = async (phoneId, to, { templateName, languageCode = 'en_US', components = [] }) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            components,
        },
    });

    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: `[Template: ${templateName}]`,
            hasMedia:    false,
            mediaPath:   null,
            outgoing:    true,
        });
    }

    return result;
};

// ─── Send interactive buttons ─────────────────────────────────────────────────
// buttons: [{ id, title }]  max 3
exports.sendButtons = async (phoneId, to, { bodyText, buttons, headerText, footerText }) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
            type: 'button',
            ...(headerText && { header: { type: 'text', text: headerText } }),
            body: { text: bodyText },
            ...(footerText && { footer: { text: footerText } }),
            action: {
                buttons: buttons.map(btn => ({
                    type: 'reply',
                    reply: { id: btn.id, title: btn.title },
                })),
            },
        },
    });

    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: bodyText,
            hasMedia:    false,
            mediaPath:   null,
            outgoing:    true,
        });
    }

    return result;
};

// ─── Send interactive list ────────────────────────────────────────────────────
// sections: [{ title, rows: [{ id, title, description? }] }]
exports.sendList = async (phoneId, to, { bodyText, buttonText, sections, headerText, footerText }) => {
    const result = await callGraphApi(phoneId, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
            type: 'list',
            ...(headerText && { header: { type: 'text', text: headerText } }),
            body: { text: bodyText },
            ...(footerText && { footer: { text: footerText } }),
            action: { button: buttonText, sections },
        },
    });

    if (result.success) {
        await saveAndEmit({
            messageId:   result.data?.messages?.[0]?.id,
            phone:       to,
            messageText: bodyText,
            hasMedia:    false,
            mediaPath:   null,
            outgoing:    true,
        });
    }

    return result;
};


// ══════════════════════════════════════════════════════════════════════════════
// EXISTING EXPORTS (unchanged, for backward compatibility)
// ══════════════════════════════════════════════════════════════════════════════

exports.getMediaHandler = () => initMediaHandler();

exports.sendMediaMessage = async (phoneId, to, mediaParams) => {
    const handler = initMediaHandler();
    return await handler.sendMedia({ phoneNumberId: phoneId, to, ...mediaParams });
};

exports.getUserMessages = async (phoneNumber, filters = {}) => {
    const handler = initMediaHandler();
    return await handler.getMessages({ from: phoneNumber, ...filters });
};

exports.getConversation = async (userNumber, businessNumber, options = {}) => {
    const handler = initMediaHandler();
    return await handler.getConversation(userNumber, businessNumber, options);
};


// ══════════════════════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function verifySignature(req, body) {
    const sig = req.headers['x-hub-signature-256'];
    if (!sig) {
        console.log('⚠️ No signature header found');
        return false;
    }

    const hash = crypto
        .createHmac('sha256', process.env.APP_SECRET)
        .update(JSON.stringify(body))
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(hash),
            Buffer.from(sig.replace('sha256=', ''))
        );
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

function generateMediaResponse(message, result) {
    const type      = message.type;
    const mediaData = message[type];
    let response    = '';

    switch (type) {
        case 'image':
            response  = `✅ *Image Received & Saved!*\n\n`;
            response += `📸 File ID: ${result._id}\n`;
            response += `💾 Size: ${(result.file_size / 1024).toFixed(2)} KB\n`;
            if (mediaData.caption) response += `📝 Caption: "${mediaData.caption}"\n`;
            response += `\n_Image stored securely._\n\nType *menu* for options.`;
            break;

        case 'audio':
            const isVoice = mediaData.voice || false;
            response  = `✅ *${isVoice ? 'Voice Note' : 'Audio'} Received & Saved!*\n\n`;
            response += `🎵 File ID: ${result._id}\n`;
            response += `💾 Size: ${(result.file_size / 1024).toFixed(2)} KB\n`;
            if (mediaData.duration) response += `⏱️ Duration: ${formatDuration(mediaData.duration)}\n`;
            response += `\n_${isVoice ? 'Voice note' : 'Audio'} stored securely._\n\nType *menu* for options.`;
            break;

        case 'video':
            response  = `✅ *Video Received & Saved!*\n\n`;
            response += `🎥 File ID: ${result._id}\n`;
            response += `💾 Size: ${(result.file_size / 1024 / 1024).toFixed(2)} MB\n`;
            if (mediaData.duration) response += `⏱️ Duration: ${formatDuration(mediaData.duration)}\n`;
            if (mediaData.caption)  response += `📝 Caption: "${mediaData.caption}"\n`;
            response += `\n_Video stored securely._\n\nType *menu* for options.`;
            break;

        case 'document':
            response  = `✅ *Document Received & Saved!*\n\n`;
            response += `📄 Filename: ${mediaData.filename || 'Unknown'}\n`;
            response += `📋 File ID: ${result._id}\n`;
            response += `💾 Size: ${(result.file_size / 1024).toFixed(2)} KB\n`;
            if (mediaData.caption) response += `📝 Caption: "${mediaData.caption}"\n`;
            response += `\n_Document stored securely._\n\nType *menu* for options.`;
            break;

        case 'sticker':
            response  = `✅ *Sticker Received!*\n\n`;
            response += `😄 File ID: ${result._id}\n`;
            response += `\nThanks for the sticker!\n\nType *menu* for options.`;
            break;

        default:
            response = `✅ Media received and saved!\n\nFile ID: ${result._id}`;
    }

    return response;
}

function formatDuration(seconds) {
    if (seconds < 60)   return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// const crypto = require('crypto');
// const fetch = require('node-fetch');
// const WhatsAppMediaHandler = require('../services/whatsapp_media_handler');
// const { getDb } = require('../config/connection');
// const { WhatsAppReplyHandler } = require('../services/whatsapp_reply_handler');
// let mediaHandler;


// function initMediaHandler() {
//     if (!mediaHandler) {
//         const db = getDb();
//         mediaHandler = new WhatsAppMediaHandler(db, {
//             uploadsDir: process.env.WHATSAPP_UPLOADS_DIR || 'uploads/whatsapp_media',
//             collection: 'whatsapp_messages',
//             accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
//             maxFileSize: 16 * 1024 * 1024, // 16MB
//             allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
//             allowedAudioTypes: ['audio/ogg', 'audio/mpeg', 'audio/amr', 'audio/mp4'],
//             allowedVideoTypes: ['video/mp4', 'video/3gpp'],
//             allowedDocTypes: [
//                 'application/pdf',
//                 'application/msword',
//                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
//                 'application/vnd.ms-excel',
//                 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//             ]
//         });
//     }
//     return mediaHandler;
// }
// const replyHandler = new WhatsAppReplyHandler({
//     companyName: 'Alead Solutions',
//     supportEmail: 'support@aleadsolutions.com',
//     supportPhone: '+91 8301031955',
//     businessHours: 'Mon-Fri, 9AM - 6PM IST',
//     websiteUrl: 'www.aleadsolutions.com'
// });

// replyHandler.registerHandler(
//     'special_offer',
//     /offer|discount|promo/i,
//     async () => ({
//         type: 'text',
//         text:
//             `🎉 *Special Offers*\n\n` +
//             `• 20% off Premium\n` +
//             `• Buy 2 Get 1\n` +
//             `• First-time Discount\n\n` +
//             `Type *contact* to claim`
//     })
// );


// // ==============================
// // WEBHOOK VERIFY
// // ==============================

// exports.verifyWebhook = (req, res) => {
//     const mode = req.query['hub.mode'];
//     const token = req.query['hub.verify_token'];
//     const challenge = req.query['hub.challenge'];
    
//     if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
//         console.log('✅ Webhook Verified');
//         return res.status(200).send(challenge);
//     }

//     console.log('❌ Verification failed');
//     return res.sendStatus(403);
// };


// // ==============================
// // WEBHOOK RECEIVER
// // ==============================

// exports.receiveWebhook = async (req, res) => {

//     const body = req.body;

//     console.log('📨 Incoming Webhook:', JSON.stringify(body, null, 2));

//     // Verify webhook signature
//     if (!verifySignature(req, body)) {
//         console.log('❌ Invalid signature');
//         return res.sendStatus(401);
//     }

//     if (body.object !== 'whatsapp_business_account') {
//         return res.sendStatus(404);
//     }

//     // Process all entries
//     body.entry?.forEach(entry => {
//         entry.changes?.forEach(change => {
//             if (change.field === 'messages') {
//                 processMessages(change.value);
//             }
//         });
//     });

//     res.sendStatus(200);
// };

// // ==============================
// // MESSAGE PROCESSOR
// // ==============================

// function processMessages(value) {

//     // Handle incoming messages
//     if (value.messages) {
//         value.messages.forEach(msg => {
//             handleMessage(msg, value.metadata);
//         });
//     }

//     // Handle message statuses
//     if (value.statuses) {
//         value.statuses.forEach(status => {
//             console.log(`📊 Message Status: ${status.status} - ${status.id}`);
//         });
//     }
// }


// async function handleMessage(message, meta) {

//     const phoneId = meta.phone_number_id;
//     const from = message.from;
//     const messageId = message.id;

//     console.log(`📞 Message from: ${from}`);
//     console.log(`📋 Message ID: ${messageId}`);
//     console.log(`⏰ Timestamp: ${new Date(message.timestamp * 1000).toISOString()}`);

//     try {

//         switch (message.type) {

//             case 'text':
//                 await handleText(message, phoneId, from);
//                 break;

//             case 'image':
//             case 'video':
//             case 'audio':
//             case 'document':
//             case 'sticker':
//                 await handleMedia(message, phoneId, from, meta);
//                 break;

//             case 'location':
//                 await handleLocation(message, phoneId, from);
//                 break;

//             case 'contacts':
//                 await handleContacts(message, phoneId, from);
//                 break;

//             case 'interactive':
//                 await handleInteractive(message, phoneId, from);
//                 break;

//             default:
//                 console.log(`❓ Unknown message type: ${message.type}`);
//                 await reply(phoneId, from, 'Message type not supported yet.');
//         }

//     } catch (err) {

//         console.error('❌ Handler error:', err);

//         await reply(
//             phoneId,
//             from,
//             '❌ Error processing your message. Please try again or contact support.'
//         );
//     }
// }


// // ==============================
// // TEXT HANDLER
// // ==============================

// async function handleText(message, phoneId, from) {

//     const text = message.text.body;

//     const replyData = await replyHandler.processMessage(text, {
//         from,
//         phoneId,
//         messageId: message.id
//     });

//     if (replyData?.text) {
//         await reply(phoneId, from, replyData.text);
//     }
// }


// // ==============================
// // MEDIA HANDLER (Enhanced)
// // ==============================

// async function handleMedia(message, phoneId, from, meta) {

//     const handler = initMediaHandler();
//     const mediaType = message.type;

//     console.log(`📎 Processing ${mediaType.toUpperCase()} message...`);

//     try {
//         // Process and store media
//         const result = await handler.processIncomingMedia(message, {
//             phone_number_id: phoneId,
//             from: from
//         });

//         console.log(`✅ Media stored successfully!`);
//         console.log(`   - Database ID: ${result._id}`);
//         console.log(`   - File Path: ${result.file_path}`);
//         console.log(`   - File Size: ${(result.file_size / 1024).toFixed(2)} KB`);

//         // Generate response based on media type
//         let responseText = generateMediaResponse(message, result);

//         await reply(phoneId, from, responseText);

//     } catch (error) {
//         console.error(`❌ Error processing ${mediaType}:`, error);

//         // Send user-friendly error message
//         let errorMsg = `❌ Sorry, there was an error processing your ${mediaType}.\n\n`;

//         if (error.message.includes('File size exceeds')) {
//             errorMsg += `⚠️ File is too large. Maximum size is 16MB.\n\n`;
//         } else if (error.message.includes('MIME type')) {
//             errorMsg += `⚠️ File type not supported.\n\n`;
//         } else if (error.message.includes('Failed to download')) {
//             errorMsg += `⚠️ Could not download the file from WhatsApp.\n\n`;
//         } else {
//             errorMsg += `Error: ${error.message}\n\n`;
//         }

//         errorMsg += `Please try again or contact support.`;

//         await reply(phoneId, from, errorMsg);
//     }
// }


// // ==============================
// // GENERATE MEDIA RESPONSE
// // ==============================

// function generateMediaResponse(message, result) {
//     const type = message.type;
//     const mediaData = message[type];
//     let response = '';

//     switch (type) {
//         case 'image':
//             response = `✅ *Image Received & Saved!*\n\n`;
//             response += `📸 File ID: ${result._id}\n`;
//             response += `💾 Size: ${(result.file_size / 1024).toFixed(2)} KB\n`;
//             if (mediaData.caption) {
//                 response += `📝 Caption: "${mediaData.caption}"\n`;
//             }
//             response += `\n_Image has been stored securely._\n\n`;
//             response += `Type *menu* for options.`;
//             break;

//         case 'audio':
//             const isVoiceNote = mediaData.voice || false;
//             response = `✅ *${isVoiceNote ? 'Voice Note' : 'Audio'} Received & Saved!*\n\n`;
//             response += `🎵 File ID: ${result._id}\n`;
//             response += `💾 Size: ${(result.file_size / 1024).toFixed(2)} KB\n`;
//             if (mediaData.duration) {
//                 response += `⏱️ Duration: ${formatDuration(mediaData.duration)}\n`;
//             }
//             response += `\n_${isVoiceNote ? 'Voice note' : 'Audio'} has been stored securely._\n\n`;
//             response += `Type *menu* for options.`;
//             break;

//         case 'video':
//             response = `✅ *Video Received & Saved!*\n\n`;
//             response += `🎥 File ID: ${result._id}\n`;
//             response += `💾 Size: ${(result.file_size / 1024 / 1024).toFixed(2)} MB\n`;
//             if (mediaData.duration) {
//                 response += `⏱️ Duration: ${formatDuration(mediaData.duration)}\n`;
//             }
//             if (mediaData.caption) {
//                 response += `📝 Caption: "${mediaData.caption}"\n`;
//             }
//             response += `\n_Video has been stored securely._\n\n`;
//             response += `Type *menu* for options.`;
//             break;

//         case 'document':
//             response = `✅ *Document Received & Saved!*\n\n`;
//             response += `📄 Filename: ${mediaData.filename || 'Unknown'}\n`;
//             response += `📋 File ID: ${result._id}\n`;
//             response += `💾 Size: ${(result.file_size / 1024).toFixed(2)} KB\n`;
//             if (mediaData.caption) {
//                 response += `📝 Caption: "${mediaData.caption}"\n`;
//             }
//             response += `\n_Document has been stored securely._\n\n`;
//             response += `Type *menu* for options.`;
//             break;

//         case 'sticker':
//             response = `✅ *Sticker Received!*\n\n`;
//             response += `😄 File ID: ${result._id}\n`;
//             response += `\nThanks for the sticker!\n\n`;
//             response += `Type *menu* for options.`;
//             break;

//         default:
//             response = `✅ Media received and saved!\n\nFile ID: ${result._id}`;
//     }

//     return response;
// }


// // ==============================
// // OTHER MESSAGE HANDLERS
// // ==============================

// async function handleLocation(message, phoneId, from) {
//     const location = message.location;
    
//     console.log(`📍 Location received:`);
//     console.log(`   - Latitude: ${location.latitude}`);
//     console.log(`   - Longitude: ${location.longitude}`);
//     console.log(`   - Name: ${location.name || 'Unknown'}`);
//     console.log(`   - Address: ${location.address || 'No address'}`);

//     const response = 
//         `📍 *Location Received!*\n\n` +
//         `Latitude: ${location.latitude}\n` +
//         `Longitude: ${location.longitude}\n` +
//         (location.name ? `Name: ${location.name}\n` : '') +
//         (location.address ? `Address: ${location.address}\n` : '') +
//         `\nThank you! Type *menu* if you need assistance.`;

//     await reply(phoneId, from, response);
// }


// async function handleContacts(message, phoneId, from) {
//     const contacts = message.contacts;
    
//     console.log(`👤 Contact(s) received: ${contacts.length}`);
    
//     contacts.forEach((contact, index) => {
//         console.log(`   ${index + 1}. ${contact.name.formatted_name}`);
//         if (contact.phones?.[0]) {
//             console.log(`      Phone: ${contact.phones[0].phone}`);
//         }
//     });

//     const response = 
//         `👤 *Contact Information Received!*\n\n` +
//         `Number of contacts: ${contacts.length}\n\n` +
//         `Thank you! Type *menu* for options.`;

//     await reply(phoneId, from, response);
// }


// async function handleInteractive(message, phoneId, from) {
//     const interactive = message.interactive;
    
//     console.log(`🔘 Interactive message:`);
//     console.log(`   - Type: ${interactive.type}`);

//     let selectedOption = '';

//     if (interactive.type === 'button_reply') {
//         selectedOption = interactive.button_reply.title;
//         console.log(`   - Button: ${interactive.button_reply.id} - ${selectedOption}`);
//     } else if (interactive.type === 'list_reply') {
//         selectedOption = interactive.list_reply.title;
//         console.log(`   - List: ${interactive.list_reply.id} - ${selectedOption}`);
//     }

//     const response = 
//         `✅ *Selection Received!*\n\n` +
//         `You selected: *${selectedOption}*\n\n` +
//         `Type *menu* for more options.`;

//     await reply(phoneId, from, response);
// }


// // ==============================
// // SIGNATURE VERIFY
// // ==============================

// function verifySignature(req, body) {

//     const sig = req.headers['x-hub-signature-256'];

//     if (!sig) {
//         console.log('⚠️ No signature header found');
//         return false;
//     }

//     const hash = crypto
//         .createHmac('sha256', process.env.APP_SECRET)
//         .update(JSON.stringify(body))
//         .digest('hex');

//     try {
//         return crypto.timingSafeEqual(
//             Buffer.from(hash),
//             Buffer.from(sig.replace('sha256=', ''))
//         );
//     } catch (error) {
//         console.error('Signature verification error:', error);
//         return false;
//     }
// }


// // ==============================
// // SEND MESSAGE
// // ==============================

// async function reply(phoneId, to, text) {

//     const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

//     try {
//         const res = await fetch(url, {
//             method: 'POST',
//             headers: {
//                 Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify({
//                 messaging_product: 'whatsapp',
//                 recipient_type: 'individual',
//                 to,
//                 type: 'text',
//                 text: { body: text }
//             })
//         });

//         const data = await res.json();

//         if (!res.ok) {
//             console.error('❌ Send error:', data.error);
//             return { success: false, error: data.error };
//         }

//         console.log('✅ Message sent successfully');
//         return { success: true, data };

//     } catch (error) {
//         console.error('❌ Network error:', error);
//         return { success: false, error: error.message };
//     }
// }


// // ==============================
// // HELPER FUNCTIONS
// // ==============================

// /**
//  * Format duration in seconds to readable format
//  */
// function formatDuration(seconds) {
//     if (seconds < 60) {
//         return `${seconds}s`;
//     } else if (seconds < 3600) {
//         const mins = Math.floor(seconds / 60);
//         const secs = seconds % 60;
//         return `${mins}m ${secs}s`;
//     } else {
//         const hours = Math.floor(seconds / 3600);
//         const mins = Math.floor((seconds % 3600) / 60);
//         return `${hours}h ${mins}m`;
//     }
// }


// // ==============================
// // ADDITIONAL EXPORTS
// // ==============================

// /**
//  * Get media handler instance (useful for other modules)
//  */
// exports.getMediaHandler = () => {
//     return initMediaHandler();
// };

// /**
//  * Send media message (can be called from other modules)
//  */
// exports.sendMediaMessage = async (phoneId, to, mediaParams) => {
//     const handler = initMediaHandler();
//     return await handler.sendMedia({
//         phoneNumberId: phoneId,
//         to,
//         ...mediaParams
//     });
// };

// /**
//  * Get messages for a user (can be called from other modules)
//  */
// exports.getUserMessages = async (phoneNumber, filters = {}) => {
//     const handler = initMediaHandler();
//     return await handler.getMessages({
//         from: phoneNumber,
//         ...filters
//     });
// };

// /**
//  * Get conversation between business and user
//  */
// exports.getConversation = async (userNumber, businessNumber, options = {}) => {
//     const handler = initMediaHandler();
//     return await handler.getConversation(userNumber, businessNumber, options);
// };





// // const VERIFY_TOKEN = 'sibin_webhook_secret_123';  // "2177092386053668"
// // const APP_SECRET = '9a1fb39b49e523baf3532fde848113ff';
// // const PHONE_NUMBER_ID= "1007480929108644";  
// // const WABA_ID = "2352673638530036";
// // const ACCESS_TOKEN = 'EAARfQyz8MTYBQmqR1QONtHhREomIT45Ris5C6B5ZASBGuwix8g6nYzQgueitFy6FNWNAG9vH8hdMGVKYkJ22mzeSZBJziBZBEywQKLwsAavHxnV439lxyLx15PZC2NZBMDkviYI2kJY6Os2iy42X7YyV0gfwjNOJ3ZBVghZB0493IBikv7xZC1RbBl5LwJMsuwZDZD';
// // // const ACCESS_TOKEN ="EAARfQyz8MTYBQkGDlVGSj3XSt6HBYrl2ytZCWWL2hsFl3c9ORZA2eoYYrrGsRhFEkMauzIXKP3UpYX42Jq5Hr8gRZCFGflFLrLAR5xUiFwGG2Kd8vHoIrls3bZBllZAqZCgeAhJ3StyozUEg6gD1cZCDwIMOytXtZCzYuOa1EjPajjVNKVoU3d80ZAduncHba93h1aVSS9xOboNZB7GWSahHZApoYtoHdaiAOqCrFYPLlwrSBZBu9RvbF8RKYCRfhpubXYD6XJWxL48ZAZBhbQWZAQAwl3S"
