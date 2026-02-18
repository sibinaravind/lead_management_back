// WhatsApp Media API Routes
const express = require('express');
const router = express.Router();
const WhatsAppMediaHandler = require('./whatsapp_media_handler');
const { getDb } = require('../config/database');

let mediaHandler;

// Middleware to ensure media handler is initialized
const ensureMediaHandler = (req, res, next) => {
    if (!mediaHandler) {
        const db = getDb();
        mediaHandler = new WhatsAppMediaHandler(db, {
            uploadsDir: process.env.WHATSAPP_UPLOADS_DIR || 'uploads/whatsapp_media',
            collection: 'whatsapp_messages',
            accessToken: process.env.WHATSAPP_ACCESS_TOKEN
        });
    }
    next();
};

router.use(ensureMediaHandler);

// ==================== RETRIEVAL APIs ====================

/**
 * GET /api/whatsapp/messages
 * Retrieve messages with optional filters
 * Query params: from, to, type, startDate, endDate, limit, skip
 */
router.get('/messages', async (req, res) => {
    try {
        const filters = {
            from: req.query.from,
            to: req.query.to,
            type: req.query.type,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            limit: parseInt(req.query.limit) || 100,
            skip: parseInt(req.query.skip) || 0
        };

        const messages = await mediaHandler.getMessages(filters);

        res.status(200).json({
            success: true,
            count: messages.length,
            messages: messages
        });

    } catch (error) {
        console.error('Error retrieving messages:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to retrieve messages'
        });
    }
});

/**
 * GET /api/whatsapp/messages/:id
 * Get a specific message by ID
 */
router.get('/messages/:id', async (req, res) => {
    try {
        const message = await mediaHandler.getMessageById(req.params.id);

        res.status(200).json({
            success: true,
            message: message
        });

    } catch (error) {
        console.error('Error retrieving message:', error);
        res.status(404).json({
            success: false,
            error: error.message || 'Message not found'
        });
    }
});

/**
 * GET /api/whatsapp/messages/:id/file
 * Download file associated with a message
 */
router.get('/messages/:id/file', async (req, res) => {
    try {
        const fileData = await mediaHandler.getMessageFile(req.params.id);

        res.set({
            'Content-Type': fileData.mimeType,
            'Content-Disposition': `attachment; filename="${fileData.filename}"`,
            'Content-Length': fileData.size
        });

        res.send(fileData.buffer);

    } catch (error) {
        console.error('Error retrieving file:', error);
        res.status(404).json({
            success: false,
            error: error.message || 'File not found'
        });
    }
});

/**
 * GET /api/whatsapp/messages/:id/download
 * Get file download URL (serves inline for preview)
 */
router.get('/messages/:id/download', async (req, res) => {
    try {
        const fileData = await mediaHandler.getMessageFile(req.params.id);

        res.set({
            'Content-Type': fileData.mimeType,
            'Content-Disposition': `inline; filename="${fileData.filename}"`,
            'Content-Length': fileData.size
        });

        res.send(fileData.buffer);

    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(404).json({
            success: false,
            error: error.message || 'File not found'
        });
    }
});

/**
 * GET /api/whatsapp/conversation/:number1/:number2
 * Get conversation between two numbers
 * Query params: limit, skip, ascending
 */
router.get('/conversation/:number1/:number2', async (req, res) => {
    try {
        const { number1, number2 } = req.params;
        const options = {
            limit: parseInt(req.query.limit) || 100,
            skip: parseInt(req.query.skip) || 0,
            ascending: req.query.ascending === 'true'
        };

        const conversation = await mediaHandler.getConversation(number1, number2, options);

        res.status(200).json({
            success: true,
            count: conversation.length,
            messages: conversation
        });

    } catch (error) {
        console.error('Error retrieving conversation:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to retrieve conversation'
        });
    }
});

/**
 * GET /api/whatsapp/media/types
 * Get media messages grouped by type
 * Query params: from, to, startDate, endDate
 */
router.get('/media/types', async (req, res) => {
    try {
        const db = getDb();
        const collection = db.collection('whatsapp_messages');

        const matchStage = { type: { $in: ['image', 'audio', 'video', 'document'] } };
        
        if (req.query.from) matchStage.from = req.query.from;
        if (req.query.to) matchStage.to = req.query.to;
        if (req.query.startDate || req.query.endDate) {
            matchStage.timestamp = {};
            if (req.query.startDate) matchStage.timestamp.$gte = new Date(req.query.startDate);
            if (req.query.endDate) matchStage.timestamp.$lte = new Date(req.query.endDate);
        }

        const result = await collection.aggregate([
            { $match: matchStage },
            { 
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    totalSize: { $sum: '$file_size' },
                    messages: { $push: '$$ROOT' }
                }
            },
            { $sort: { count: -1 } }
        ]).toArray();

        res.status(200).json({
            success: true,
            mediaTypes: result
        });

    } catch (error) {
        console.error('Error retrieving media types:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to retrieve media types'
        });
    }
});

// ==================== SEND APIs ====================

/**
 * POST /api/whatsapp/send-media
 * Send media message
 * Body: { phoneNumberId, to, type, filePath, mimeType, caption?, filename? }
 */
router.post('/send-media', async (req, res) => {
    try {
        const { phoneNumberId, to, type, filePath, mimeType, caption, filename } = req.body;

        if (!phoneNumberId || !to || !type || !filePath || !mimeType) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: phoneNumberId, to, type, filePath, mimeType'
            });
        }

        const result = await mediaHandler.sendMedia({
            phoneNumberId,
            to,
            type,
            filePath,
            mimeType,
            caption,
            filename
        });

        res.status(200).json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error sending media:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send media'
        });
    }
});

/**
 * POST /api/whatsapp/upload-base64
 * Upload base64 media and send
 * Body: { phoneNumberId, to, type, base64, mimeType, caption?, filename? }
 */
router.post('/upload-base64', async (req, res) => {
    try {
        const { phoneNumberId, to, type, base64, mimeType, caption, filename } = req.body;

        if (!phoneNumberId || !to || !type || !base64 || !mimeType) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: phoneNumberId, to, type, base64, mimeType'
            });
        }

        // Decode base64 and save to temporary file
        const buffer = Buffer.from(base64, 'base64');
        const tempFilePath = await mediaHandler.saveFileToDisk(buffer, mimeType, filename);

        // Send the media
        const result = await mediaHandler.sendMedia({
            phoneNumberId,
            to,
            type,
            filePath: tempFilePath,
            mimeType,
            caption,
            filename
        });

        res.status(200).json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error uploading and sending base64 media:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to upload and send media'
        });
    }
});

// ==================== DELETE APIs ====================

/**
 * DELETE /api/whatsapp/messages/:id
 * Delete a message and its associated file
 */
router.delete('/messages/:id', async (req, res) => {
    try {
        const result = await mediaHandler.deleteMessage(req.params.id);

        res.status(200).json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete message'
        });
    }
});

/**
 * DELETE /api/whatsapp/conversation/:number1/:number2
 * Delete entire conversation between two numbers
 */
router.delete('/conversation/:number1/:number2', async (req, res) => {
    try {
        const { number1, number2 } = req.params;
        const conversation = await mediaHandler.getConversation(number1, number2);

        let deletedCount = 0;
        for (const message of conversation) {
            await mediaHandler.deleteMessage(message._id.toString());
            deletedCount++;
        }

        res.status(200).json({
            success: true,
            deletedCount: deletedCount
        });

    } catch (error) {
        console.error('Error deleting conversation:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete conversation'
        });
    }
});

// ==================== STATS APIs ====================

/**
 * GET /api/whatsapp/stats
 * Get statistics about messages
 */
router.get('/stats', async (req, res) => {
    try {
        const db = getDb();
        const collection = db.collection('whatsapp_messages');

        const stats = await collection.aggregate([
            {
                $facet: {
                    totalMessages: [{ $count: 'count' }],
                    byType: [
                        { $group: { _id: '$type', count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ],
                    totalStorage: [
                        { $group: { _id: null, totalBytes: { $sum: '$file_size' } } }
                    ],
                    recentMessages: [
                        { $sort: { timestamp: -1 } },
                        { $limit: 10 },
                        { $project: { from: 1, type: 1, timestamp: 1, caption: 1 } }
                    ]
                }
            }
        ]).toArray();

        const result = stats[0];

        res.status(200).json({
            success: true,
            stats: {
                totalMessages: result.totalMessages[0]?.count || 0,
                messagesByType: result.byType,
                totalStorageBytes: result.totalStorage[0]?.totalBytes || 0,
                recentMessages: result.recentMessages
            }
        });

    } catch (error) {
        console.error('Error retrieving stats:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to retrieve stats'
        });
    }
});

module.exports = router;