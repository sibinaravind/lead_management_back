const express = require('express');
const router = express.Router();
const whatsappHelpers = require('../../helpers/whatsapp_data_helper');
const whatsappService = require('../../services/whatsapp_nonapi_service');
let middleware = require("../../middleware");
function resolveBaseUrl(req) {
    return req.query.domain || `${req.protocol}://${req.get('host')}`;
}

router.get('/threads', middleware.checkToken, async (req, res) => {
    try {
        const result = await whatsappHelpers.getThreadSummaries({
            page: req.query.page,
            limit: req.query.limit,
            unread_only: req.query.unread_only ?? req.query.unreadOnly,
            search: req.query.search,
            employee: req.query.employee,
            base_url: resolveBaseUrl(req),
        },req.decoded);

        return res.status(200).json({
            success: true,
            data: {
                threads: result.data,
                pagination: result.pagination,
                summary: result.summary,
            },
        });
    } catch (error) {
        console.error('Error retrieving WhatsApp threads:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to retrieve threads',
        });
    }
});

router.get('/messages', async (req, res) => {
    try {
        const result = await whatsappHelpers.getMessages({
            page: req.query.page,
            limit: req.query.limit,
            phone: req.query.phone,
            direction: req.query.direction,
            is_viewed: req.query.is_viewed,
            has_media: req.query.has_media,
            search: req.query.search,
            base_url: resolveBaseUrl(req),
        });

        return res.status(200).json({
            success: true,
            data: {
                messages: result.data,
                pagination: result.pagination,
            },
        });
    } catch (error) {
        console.error('Error retrieving WhatsApp messages:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to retrieve messages',
        });
    }
});

router.get('/messages/:id', async (req, res) => {
    try {
        const message = await whatsappHelpers.getMessageById(req.params.id, {
            base_url: resolveBaseUrl(req),
        });
        return res.status(200).json({ success: true, data: message });
    } catch (error) {
        return res.status(404).json({
            success: false,
            message: error.message || 'Message not found',
        });
    }
});

router.get('/conversation/:phone', async (req, res) => {
    try {
        const result = await whatsappHelpers.getMessages({
            page: req.query.page,
            limit: req.query.limit,
            phone: req.params.phone,
            base_url: resolveBaseUrl(req),
        });

        return res.status(200).json({
            success: true,
            data: {
                phone: req.params.phone,
                messages: result.data,
                pagination: result.pagination,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to retrieve conversation',
        });
    }
});

router.patch('/messages/:id/view', async (req, res) => {
    try {
        await whatsappHelpers.markAsViewed(req.params.id);
        return res.status(200).json({
            success: true,
            data: { message: 'Message marked as viewed' },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to mark message as viewed',
        });
    }
});

router.patch('/threads/:phone/view', async (req, res) => {
    try {
    
        const result = await whatsappHelpers.markAllAsViewed(req.params.phone);
        return res.status(200).json({
            success: true,
            data: {
                phone: req.params.phone,
                updated_count: result.count || 0,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to mark conversation as viewed',
        });
    }
});

router.get('/stats', async (_req, res) => {
    try {
        const stats = await whatsappHelpers.getStats();
        return res.status(200).json({ success: true, data: stats });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to retrieve stats',
        });
    }
});

router.delete('/messages/:id', async (req, res) => {
    try {
        await whatsappHelpers.deleteMessage(req.params.id);
        return res.status(200).json({
            success: true,
            data: { message: 'Message deleted' },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete message',
        });
    }
});

router.post('/send', async (req, res) => {
    try {
        const { phone, message, attach, caption, filename } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: 'phone is required' });
        }

        if (!message && !attach) {
            return res.status(400).json({ success: false, message: 'message or attach is required' });
        }

        let result;
        if (attach) {
            result = await whatsappService.sendMedia(phone, {
                attach,
                caption: caption || message || '',
                filename,
            });
        } else {
            result = await whatsappService.sendText(phone, message);
        }

        if (!result.success) {
            return res.status(500).json(result);
        }

        return res.status(200).json({
            success: true,
            data: { message_id: result.result?.key?.id || null },
        });
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
