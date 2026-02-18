const express = require('express');
const router = express.Router();

let whatsappHelper=require('../../helpers/whatsapp_api_helper');
const PHONE_ID = process.env.PHONE_NUMBER_ID;

const missingFields = (res, ...fields) => {
    return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${fields.join(', ')}`,
    });
};

const ensurePhoneId = (res) => {
    if (PHONE_ID) return true;
    res.status(500).json({
        success: false,
        message: 'PHONE_NUMBER_ID is not configured',
    });
    return false;
};

const isDataUri = (value) => typeof value === 'string' && value.startsWith('data:') && value.includes(';base64,');

const inferMediaTypeFromMime = (mimeType = '') => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
};

const inferMediaTypeFromDataUri = (dataUri) => {
    const match = dataUri.match(/^data:([^;]+);base64,/i);
    if (!match) return null;
    return inferMediaTypeFromMime(match[1].toLowerCase());
};

// Webhook verification
router.get('/webhook', whatsappHelper.verifyWebhook);

// Webhook receiver
router.post('/webhook', whatsappHelper.receiveWebhook);


router.post('/text', async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) return missingFields(res, 'to', 'message');
    if (!ensurePhoneId(res)) return;

    const result = await whatsappHelper.sendText(PHONE_ID, to, message);
    return res.status(result.success ? 200 : 500).json(result);
});

router.post('/send', async (req, res) => {
    if (!ensurePhoneId(res)) return;

    const {
        to,
        phone,
        message,
        attach,
        mimeType,
        caption,
        filename,
    } = req.body;

    const recipient = to || phone;
    if (!recipient) return missingFields(res, 'to or phone');

    const attachIsDataUri = isDataUri(attach);
    const normalizedMime = (mimeType || '').toLowerCase();
    const normalizedType = attachIsDataUri
        ? inferMediaTypeFromDataUri(attach)
        : (normalizedMime ? inferMediaTypeFromMime(normalizedMime) : 'document');
    const mediaText = message || caption || '';

    try {
        let result;

        if (attach) {
            if (attachIsDataUri) {
                result = await whatsappHelper.sendMediaFromBinary(PHONE_ID, recipient, {
                    mediaType: normalizedType,
                    fileBase64: attach,
                    mimeType: normalizedMime || undefined,
                    filename,
                    caption: mediaText,
                });
            } else {
                if (normalizedType === 'image') {
                    result = await whatsappHelper.sendImage(PHONE_ID, recipient, { link: attach, caption: mediaText });
                } else if (normalizedType === 'video') {
                    result = await whatsappHelper.sendVideo(PHONE_ID, recipient, { link: attach, caption: mediaText });
                } else if (normalizedType === 'audio') {
                    result = await whatsappHelper.sendAudio(PHONE_ID, recipient, { link: attach });
                } else {
                    result = await whatsappHelper.sendDocument(PHONE_ID, recipient, {
                        link: attach,
                        filename,
                        caption: mediaText,
                    });
                }
            }
        } else {
            if (!message) return missingFields(res, 'message');
            result = await whatsappHelper.sendText(PHONE_ID, recipient, message);
        }

        return res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

router.post('/template', async (req, res) => {
    if (!ensurePhoneId(res)) return;

    const {
        to,
        phone,
        templateName,
        languageCode = 'en_US',
        components = [],
    } = req.body;

    const recipient = to || phone;
    if (!recipient) return missingFields(res, 'to or phone');
    if (!templateName) return missingFields(res, 'templateName');

    try {
        const result = await whatsappHelper.sendTemplate(PHONE_ID, recipient, {
            templateName,
            languageCode,
            components,
        });
        return res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});


module.exports = router;
