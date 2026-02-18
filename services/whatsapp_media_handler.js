
// services/whatsapp_media_handler.js
// WhatsApp Media Handler - Matching Project Style

var db = require('../config/connection');
var fs = require('fs').promises;
var path = require('path');
var crypto = require('crypto');
const { ObjectId } = require('mongodb');

const COLLECTION = {
    WHATSAPP_MESSAGES: 'whatsapp_messages'
};

class WhatsAppMediaHandler {
    constructor(config = {}) {
        this.config = {
            uploadsDir: config.uploadsDir || process.env.WHATSAPP_UPLOADS_DIR || 'uploads/whatsapp_media',
            maxFileSize: config.maxFileSize || 16 * 1024 * 1024, // 16MB
            allowedImageTypes: config.allowedImageTypes || ['image/jpeg', 'image/png', 'image/webp'],
            allowedAudioTypes: config.allowedAudioTypes || ['audio/ogg', 'audio/mpeg', 'audio/amr', 'audio/mp4'],
            allowedVideoTypes: config.allowedVideoTypes || ['video/mp4', 'video/3gpp'],
            allowedDocTypes: config.allowedDocTypes || [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ]
        };
        
        this.ensureUploadDir();
    }

    async ensureUploadDir() {
        try {
            await fs.mkdir(this.config.uploadsDir, { recursive: true });
        } catch (err) {
            console.error('Error creating upload directory:', err);
        }
    }


    async saveFileToDisk(buffer, mimeType, originalName = null) {
        try {
            const timestamp = Date.now();
            const randomHash = crypto.randomBytes(8).toString('hex');
            const extension = getExtensionFromMimeType(mimeType);
            
            const filename = originalName 
                ? `${timestamp}_${sanitizeFilename(originalName)}`
                : `${timestamp}_${randomHash}${extension}`;

            const filePath = path.join(this.config.uploadsDir, filename);

            await fs.writeFile(filePath, buffer);

            return filePath;
        } catch (error) {
            console.error('Error saving file to disk:', error);
            throw error;
        }
    }

    /**
     * Process and store incoming media from WhatsApp
     */
    async processIncomingMedia(mediaBuffer, mediaData, metadata) {
        
        let filePath = null;
        try {
            const { type, mime_type, caption, filename, from, sender_name, message_id } = mediaData;

            if (!mediaBuffer || !type) {
                throw new Error("Missing required fields for media upload.");
            }

            // Validate file size
            if (mediaBuffer.length > this.config.maxFileSize) {
                throw new Error(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
            }

            // Validate MIME type
            validateMimeType(type, mime_type, this.config);

            const collection = db.get().collection(COLLECTION.WHATSAPP_MESSAGES);

            // Save file to disk
            filePath = await this.saveFileToDisk(mediaBuffer, mime_type, filename);

            // Prepare document for database
            const messageDoc = {
                message_id: message_id,
                from: from,
                sender_name: sender_name || 'Unknown',
                type: type,
                mime_type: mime_type,
                file_path: filePath,
                file_size: mediaBuffer.length,
                caption: caption || null,
                filename: filename || null,
                timestamp: new Date(metadata.timestamp * 1000),
                received_at: new Date(),
                status: 'received',
                direction: 'incoming',
                metadata: {
                    original_name: filename,
                    is_group: from.endsWith('@g.us'),
                    push_name: sender_name
                }
            };

            // Insert into database
            const result = await collection.insertOne(messageDoc);

            if (!result.insertedId) {
                // Rollback uploaded file if DB insert fails
                if (filePath) {
                    await fs.unlink(path.resolve(filePath)).catch(() => {});
                }
                throw new Error('Failed to store message in database.');
            }

            return {
                success: true,
                _id: result.insertedId,
                file_path: filePath,
                file_size: mediaBuffer.length,
                ...messageDoc
            };

        } catch (err) {
            console.log("Error occurred while processing media:", err);
            // Rollback uploaded file if error
            if (filePath) {
                await fs.unlink(path.resolve(filePath)).catch(() => {});
            }
            throw new Error("Error processing media: " + (err.message || err));
        }
    }


}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType) {
    const extensions = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'audio/ogg': '.ogg',
        'audio/mpeg': '.mp3',
        'audio/amr': '.amr',
        'audio/mp4': '.m4a',
        'video/mp4': '.mp4',
        'video/3gpp': '.3gp',
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
    };

    return extensions[mimeType] || '';
}

/**
 * Sanitize filename
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 100);
}

/**
 * Validate MIME type
 */
function validateMimeType(type, mimeType, config) {
    const allowedTypes = {
        'image': config.allowedImageTypes,
        'audio': config.allowedAudioTypes,
        'video': config.allowedVideoTypes,
        'document': config.allowedDocTypes
    };

    if (allowedTypes[type] && !allowedTypes[type].includes(mimeType)) {
        throw new Error(`MIME type ${mimeType} not allowed for ${type}`);
    }
}

module.exports = WhatsAppMediaHandler;


    // /**
    //  * Get message by ID
    //  */


    // async getMessages(filters = {}) {
    //     try {
    //         const collection = db.get().collection(COLLECTION.WHATSAPP_MESSAGES);
    //         const query = {};
    //         // Apply filters
    //         if (filters.from) query.from = filters.from;
    //         if (filters.to) query.to = filters.to;
    //         if (filters.type) query.type = filters.type;
    //         if (filters.startDate || filters.endDate) {
    //             query.timestamp = {};
    //             if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
    //             if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
    //         }

    //         const messages = await collection
    //             .find(query)
    //             .sort({ timestamp: -1 })
    //             .limit(filters.limit || 100)
    //             .skip(filters.skip || 0)
    //             .toArray();

    //         return messages;

    //     } catch (error) {
    //         console.error('Error retrieving messages:', error);
    //         throw error;
    //     }
    // }

    // async getMessageById(id) {
    //     try {
    //         const collection = db.get().collection(COLLECTION.WHATSAPP_MESSAGES);
    //         const message = await collection.findOne({ _id: ObjectId(id) });
            
    //         if (!message) {
    //             throw new Error('Message not found');
    //         }

    //         return message;

    //     } catch (error) {
    //         console.error('Error retrieving message by ID:', error);
    //         throw error;
    //     }
    // }

    // /**
    //  * Get file for a message
    //  */
    // async getMessageFile(id) {
    //     try {
    //         const message = await this.getMessageById(id);
            
    //         if (!message.file_path) {
    //             throw new Error('No file associated with this message');
    //         }

    //         const fileBuffer = await fs.readFile(message.file_path);

    //         return {
    //             buffer: fileBuffer,
    //             mimeType: message.mime_type,
    //             filename: message.filename || path.basename(message.file_path),
    //             size: fileBuffer.length
    //         };

    //     } catch (error) {
    //         console.error('Error retrieving message file:', error);
    //         throw error;
    //     }
    // }

    // /**
    //  * Delete message and associated file
    //  */
    // async deleteMessage(id) {
    //     try {
    //         const collection = db.get().collection(COLLECTION.WHATSAPP_MESSAGES);
    //         const message = await this.getMessageById(id);

    //         // Delete file from disk
    //         if (message.file_path) {
    //             await fs.unlink(path.resolve(message.file_path)).catch(err => 
    //                 console.warn('Failed to delete file:', err.message)
    //             );
    //         }

    //         // Delete from database
    //         const result = await collection.deleteOne({ _id: ObjectId(id) });

    //         return {
    //             success: result.deletedCount > 0,
    //             deletedCount: result.deletedCount
    //         };

    //     } catch (error) {
    //         console.error('Error deleting message:', error);
    //         throw error;
    //     }
    // }

    // /**
    //  * Get conversation between two numbers
    //  */
    // async getConversation(number1, number2, options = {}) {
    //     try {
    //         const collection = db.get().collection(COLLECTION.WHATSAPP_MESSAGES);
            
    //         const query = {
    //             $or: [
    //                 { from: number1, to: number2 },
    //                 { from: number2, to: number1 }
    //             ]
    //         };

    //         const messages = await collection
    //             .find(query)
    //             .sort({ timestamp: options.ascending ? 1 : -1 })
    //             .limit(options.limit || 100)
    //             .skip(options.skip || 0)
    //             .toArray();

    //         return messages;

    //     } catch (error) {
    //         console.error('Error retrieving conversation:', error);
    //         throw error;
    //     }
    // }
// // WhatsApp Media Handler Utility
// const fs = require('fs').promises;
// const path = require('path');
// const crypto = require('crypto');
// const { ObjectId } = require('mongodb');

// class WhatsAppMediaHandler {
//     constructor(db, config = {}) {
//         this.db = db;
//         this.config = {
//             uploadsDir: config.uploadsDir || 'uploads/whatsapp_media',
//             collection: config.collection || 'whatsapp_messages',
//             accessToken: config.accessToken || process.env.WHATSAPP_ACCESS_TOKEN,
//             maxFileSize: config.maxFileSize || 16 * 1024 * 1024, // 16MB default
//             allowedImageTypes: config.allowedImageTypes || ['image/jpeg', 'image/png', 'image/webp'],
//             allowedDocTypes: config.allowedDocTypes || ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
//             allowedAudioTypes: config.allowedAudioTypes || ['audio/ogg', 'audio/mpeg', 'audio/amr', 'audio/mp4'],
//             allowedVideoTypes: config.allowedVideoTypes || ['video/mp4', 'video/3gpp']
//         };
        
//         this.ensureUploadDir();
//     }

//     /**
//      * Ensure upload directory exists
//      */
//     async ensureUploadDir() {
//         try {
//             await fs.mkdir(this.config.uploadsDir, { recursive: true });
//         } catch (err) {
//             console.error('Error creating upload directory:', err);
//         }
//     }

//     /**
//      * Download media from WhatsApp API
//      * @param {string} mediaId - WhatsApp media ID
//      * @returns {Promise<Buffer>} - File buffer
//      */
//     async downloadMediaFromWhatsApp(mediaId) {
//         try {
//             // Step 1: Get media URL
//             const response = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
//                 headers: {
//                     'Authorization': `Bearer ${this.config.accessToken}`
//                 }
//             });

//             if (!response.ok) {
//                 throw new Error(`Failed to get media URL: ${response.statusText}`);
//             }

//             const mediaData = await response.json();
            
//             // Step 2: Download the actual file
//             const fileResponse = await fetch(mediaData.url, {
//                 headers: {
//                     'Authorization': `Bearer ${this.config.accessToken}`
//                 }
//             });

//             if (!fileResponse.ok) {
//                 throw new Error(`Failed to download media: ${fileResponse.statusText}`);
//             }

//             const arrayBuffer = await fileResponse.arrayBuffer();
//             return Buffer.from(arrayBuffer);

//         } catch (error) {
//             console.error('Error downloading media from WhatsApp:', error);
//             throw error;
//         }
//     }

//     /**
//      * Save file to disk
//      * @param {Buffer} buffer - File buffer
//      * @param {string} mimeType - MIME type
//      * @param {string} originalName - Original filename (optional)
//      * @returns {Promise<string>} - Saved file path
//      */
//     async saveFileToDisk(buffer, mimeType, originalName = null) {
//         try {
//             // Generate unique filename
//             const timestamp = Date.now();
//             const randomHash = crypto.randomBytes(8).toString('hex');
//             const extension = this.getExtensionFromMimeType(mimeType);
            
//             const filename = originalName 
//                 ? `${timestamp}_${this.sanitizeFilename(originalName)}`
//                 : `${timestamp}_${randomHash}${extension}`;

//             const filePath = path.join(this.config.uploadsDir, filename);

//             // Save file
//             await fs.writeFile(filePath, buffer);

//             return filePath;
//         } catch (error) {
//             console.error('Error saving file to disk:', error);
//             throw error;
//         }
//     }

//     /**
//      * Process and store incoming media message
//      * @param {Object} message - WhatsApp message object
//      * @param {Object} metadata - Message metadata (phone_number_id, from, etc.)
//      * @returns {Promise<Object>} - Stored message document
//      */
//     async processIncomingMedia(message, metadata) {
//         const { type } = message;
//         const fromNumber = metadata.from || message.from;
//         const phoneNumberId = metadata.phone_number_id;
        
//         let mediaData = null;
//         let filePath = null;
//         let fileBuffer = null;

//         try {
//             // Extract media details based on type
//             switch (type) {
//                 case 'image':
//                     mediaData = message.image;
//                     break;
//                 case 'audio':
//                     mediaData = message.audio;
//                     break;
//                 case 'video':
//                     mediaData = message.video;
//                     break;
//                 case 'document':
//                     mediaData = message.document;
//                     break;
//                 case 'sticker':
//                     mediaData = message.sticker;
//                     break;
//                 default:
//                     throw new Error(`Unsupported media type: ${type}`);
//             }

//             if (!mediaData || !mediaData.id) {
//                 throw new Error('Invalid media data');
//             }

//             // Validate file size (if available)
//             if (mediaData.file_size && mediaData.file_size > this.config.maxFileSize) {
//                 throw new Error(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
//             }

//             // Validate MIME type
//             this.validateMimeType(type, mediaData.mime_type);

//             // Download media from WhatsApp
//             fileBuffer = await this.downloadMediaFromWhatsApp(mediaData.id);

//             // Save to disk
//             filePath = await this.saveFileToDisk(
//                 fileBuffer, 
//                 mediaData.mime_type,
//                 mediaData.filename || null
//             );

//             // Store in database
//             const messageDoc = {
//                 message_id: message.id,
//                 from: fromNumber,
//                 phone_number_id: phoneNumberId,
//                 type: type,
//                 media_id: mediaData.id,
//                 mime_type: mediaData.mime_type,
//                 file_path: filePath,
//                 file_size: fileBuffer.length,
//                 caption: mediaData.caption || null,
//                 filename: mediaData.filename || null,
//                 sha256: mediaData.sha256 || null,
//                 // Additional metadata
//                 is_forwarded: message.context?.forwarded || false,
//                 timestamp: new Date(message.timestamp * 1000),
//                 received_at: new Date(),
//                 status: 'received',
//                 metadata: {
//                     original_name: mediaData.filename,
//                     duration: mediaData.duration || null, // for audio/video
//                     voice: mediaData.voice || false, // for voice notes
//                 }
//             };

//             const collection = this.db.collection(this.config.collection);
//             const result = await collection.insertOne(messageDoc);

//             return {
//                 success: true,
//                 _id: result.insertedId,
//                 file_path: filePath,
//                 ...messageDoc
//             };

//         } catch (error) {
//             console.error('Error processing incoming media:', error);
            
//             // Cleanup: Remove file if DB insert fails
//             if (filePath) {
//                 await fs.unlink(filePath).catch(err => 
//                     console.warn('Failed to cleanup file:', err.message)
//                 );
//             }

//             throw error;
//         }
//     }

//     /**
//      * Store outgoing media message record
//      * @param {Object} params - Message parameters
//      * @returns {Promise<Object>} - Stored message document
//      */
//     async storeOutgoingMedia(params) {
//         const { 
//             to, 
//             type, 
//             mediaId, 
//             filePath, 
//             mimeType, 
//             caption, 
//             filename,
//             phoneNumberId 
//         } = params;

//         try {
//             const messageDoc = {
//                 to: to,
//                 phone_number_id: phoneNumberId,
//                 type: type,
//                 media_id: mediaId,
//                 mime_type: mimeType,
//                 file_path: filePath,
//                 caption: caption || null,
//                 filename: filename || null,
//                 timestamp: new Date(),
//                 sent_at: new Date(),
//                 status: 'sent',
//                 direction: 'outgoing'
//             };

//             const collection = this.db.collection(this.config.collection);
//             const result = await collection.insertOne(messageDoc);

//             return {
//                 success: true,
//                 _id: result.insertedId,
//                 ...messageDoc
//             };

//         } catch (error) {
//             console.error('Error storing outgoing media:', error);
//             throw error;
//         }
//     }

//     /**
//      * Upload media to WhatsApp and get media ID
//      * @param {string} filePath - Local file path
//      * @param {string} mimeType - MIME type
//      * @param {string} phoneNumberId - Phone number ID
//      * @returns {Promise<string>} - Media ID from WhatsApp
//      */
//     async uploadMediaToWhatsApp(filePath, mimeType, phoneNumberId) {
//         try {
//             const fileBuffer = await fs.readFile(filePath);
//             const blob = new Blob([fileBuffer], { type: mimeType });
            
//             const formData = new FormData();
//             formData.append('file', blob, path.basename(filePath));
//             formData.append('messaging_product', 'whatsapp');
//             formData.append('type', mimeType);

//             const response = await fetch(
//                 `https://graph.facebook.com/v18.0/${phoneNumberId}/media`,
//                 {
//                     method: 'POST',
//                     headers: {
//                         'Authorization': `Bearer ${this.config.accessToken}`
//                     },
//                     body: formData
//                 }
//             );

//             if (!response.ok) {
//                 const error = await response.json();
//                 throw new Error(`Failed to upload media: ${JSON.stringify(error)}`);
//             }

//             const result = await response.json();
//             return result.id; // Media ID

//         } catch (error) {
//             console.error('Error uploading media to WhatsApp:', error);
//             throw error;
//         }
//     }

//     /**
//      * Send media message
//      * @param {Object} params - Send parameters
//      * @returns {Promise<Object>} - Send result
//      */
//     async sendMedia(params) {
//         const { 
//             phoneNumberId, 
//             to, 
//             type, 
//             filePath, 
//             mimeType, 
//             caption, 
//             filename 
//         } = params;

//         try {
//             // Upload media to WhatsApp first
//             const mediaId = await this.uploadMediaToWhatsApp(filePath, mimeType, phoneNumberId);

//             // Prepare message payload
//             const payload = {
//                 messaging_product: 'whatsapp',
//                 recipient_type: 'individual',
//                 to: to,
//                 type: type
//             };

//             // Add media object based on type
//             const mediaObject = { id: mediaId };
            
//             if (caption && (type === 'image' || type === 'video' || type === 'document')) {
//                 mediaObject.caption = caption;
//             }
            
//             if (filename && type === 'document') {
//                 mediaObject.filename = filename;
//             }

//             payload[type] = mediaObject;

//             // Send message
//             const response = await fetch(
//                 `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
//                 {
//                     method: 'POST',
//                     headers: {
//                         'Authorization': `Bearer ${this.config.accessToken}`,
//                         'Content-Type': 'application/json'
//                     },
//                     body: JSON.stringify(payload)
//                 }
//             );

//             if (!response.ok) {
//                 const error = await response.json();
//                 throw new Error(`Failed to send media: ${JSON.stringify(error)}`);
//             }

//             const result = await response.json();

//             // Store outgoing message in DB
//             await this.storeOutgoingMedia({
//                 to,
//                 type,
//                 mediaId,
//                 filePath,
//                 mimeType,
//                 caption,
//                 filename,
//                 phoneNumberId
//             });

//             return {
//                 success: true,
//                 message_id: result.messages[0].id,
//                 media_id: mediaId
//             };

//         } catch (error) {
//             console.error('Error sending media:', error);
//             throw error;
//         }
//     }

//     /**
//      * Retrieve messages from DB
//      * @param {Object} filters - Query filters
//      * @returns {Promise<Array>} - Array of messages
//      */
//     async getMessages(filters = {}) {
//         try {
//             const collection = this.db.collection(this.config.collection);
//             const query = {};

//             // Apply filters
//             if (filters.from) query.from = filters.from;
//             if (filters.to) query.to = filters.to;
//             if (filters.type) query.type = filters.type;
//             if (filters.startDate || filters.endDate) {
//                 query.timestamp = {};
//                 if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
//                 if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
//             }

//             const messages = await collection
//                 .find(query)
//                 .sort({ timestamp: -1 })
//                 .limit(filters.limit || 100)
//                 .skip(filters.skip || 0)
//                 .toArray();

//             return messages;

//         } catch (error) {
//             console.error('Error retrieving messages:', error);
//             throw error;
//         }
//     }

//     /**
//      * Get message by ID
//      * @param {string} id - Message document ID
//      * @returns {Promise<Object>} - Message document
//      */
//     async getMessageById(id) {
//         try {
//             const collection = this.db.collection(this.config.collection);
//             const message = await collection.findOne({ _id: ObjectId(id) });
            
//             if (!message) {
//                 throw new Error('Message not found');
//             }

//             return message;

//         } catch (error) {
//             console.error('Error retrieving message by ID:', error);
//             throw error;
//         }
//     }

//     /**
//      * Get file for a message
//      * @param {string} id - Message document ID
//      * @returns {Promise<Object>} - File data and metadata
//      */
//     async getMessageFile(id) {
//         try {
//             const message = await this.getMessageById(id);
            
//             if (!message.file_path) {
//                 throw new Error('No file associated with this message');
//             }

//             const fileBuffer = await fs.readFile(message.file_path);

//             return {
//                 buffer: fileBuffer,
//                 mimeType: message.mime_type,
//                 filename: message.filename || path.basename(message.file_path),
//                 size: fileBuffer.length
//             };

//         } catch (error) {
//             console.error('Error retrieving message file:', error);
//             throw error;
//         }
//     }

//     /**
//      * Delete message and associated file
//      * @param {string} id - Message document ID
//      * @returns {Promise<Object>} - Delete result
//      */
//     async deleteMessage(id) {
//         try {
//             const collection = this.db.collection(this.config.collection);
//             const message = await this.getMessageById(id);

//             // Delete file from disk
//             if (message.file_path) {
//                 await fs.unlink(message.file_path).catch(err => 
//                     console.warn('Failed to delete file:', err.message)
//                 );
//             }

//             // Delete from database
//             const result = await collection.deleteOne({ _id: ObjectId(id) });

//             return {
//                 success: result.deletedCount > 0,
//                 deletedCount: result.deletedCount
//             };

//         } catch (error) {
//             console.error('Error deleting message:', error);
//             throw error;
//         }
//     }

//     /**
//      * Get conversation history between two numbers
//      * @param {string} number1 - First phone number
//      * @param {string} number2 - Second phone number
//      * @param {Object} options - Query options
//      * @returns {Promise<Array>} - Conversation messages
//      */
//     async getConversation(number1, number2, options = {}) {
//         try {
//             const collection = this.db.collection(this.config.collection);
            
//             const query = {
//                 $or: [
//                     { from: number1, to: number2 },
//                     { from: number2, to: number1 }
//                 ]
//             };

//             const messages = await collection
//                 .find(query)
//                 .sort({ timestamp: options.ascending ? 1 : -1 })
//                 .limit(options.limit || 100)
//                 .skip(options.skip || 0)
//                 .toArray();

//             return messages;

//         } catch (error) {
//             console.error('Error retrieving conversation:', error);
//             throw error;
//         }
//     }

//     // ==================== HELPER METHODS ====================

//     /**
//      * Get file extension from MIME type
//      */
//     getExtensionFromMimeType(mimeType) {
//         const extensions = {
//             'image/jpeg': '.jpg',
//             'image/png': '.png',
//             'image/webp': '.webp',
//             'image/gif': '.gif',
//             'audio/ogg': '.ogg',
//             'audio/mpeg': '.mp3',
//             'audio/amr': '.amr',
//             'audio/mp4': '.m4a',
//             'video/mp4': '.mp4',
//             'video/3gpp': '.3gp',
//             'application/pdf': '.pdf',
//             'application/msword': '.doc',
//             'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
//             'application/vnd.ms-excel': '.xls',
//             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
//         };

//         return extensions[mimeType] || '';
//     }

//     /**
//      * Sanitize filename
//      */
//     sanitizeFilename(filename) {
//         return filename
//             .replace(/[^a-zA-Z0-9._-]/g, '_')
//             .substring(0, 100);
//     }

//     /**
//      * Validate MIME type
//      */
//     validateMimeType(type, mimeType) {
//         const allowedTypes = {
//             'image': this.config.allowedImageTypes,
//             'audio': this.config.allowedAudioTypes,
//             'video': this.config.allowedVideoTypes,
//             'document': this.config.allowedDocTypes
//         };

//         if (allowedTypes[type] && !allowedTypes[type].includes(mimeType)) {
//             throw new Error(`MIME type ${mimeType} not allowed for ${type}`);
//         }
//     }
// }

// module.exports = WhatsAppMediaHandler;