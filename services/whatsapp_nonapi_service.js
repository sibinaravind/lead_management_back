const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const whatsappHelpers = require('../helpers/whatsapp_data_helper');
const { extractPhoneNumber } = require('../helpers/whatsapp_data_helper');
const { replyHandler } = require('./whatsapp_reply_handler');
const { getIO } = require('./socket_server');

class WhatsAppNonApiService {
    constructor() {
        this.sock = null;
        this.isConnected = false;
        this.qrCode = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.messageHandlers = [];
        this.isManualDisconnect = false;

        this.mediaDir = process.env.WHATSAPP_UPLOADS_DIR || 'uploads/whatsapp_media';
        this.maxFileSize = 16 * 1024 * 1024; // 16MB

        this.ensureDirectories();
    }

    getMediaBaseUrl() {
        const configuredBaseUrl = process.env.MEDIA_BASE_URL
            || process.env.DOMAIN_URL
            || process.env.APP_URL;
        if (configuredBaseUrl) {
            return configuredBaseUrl.replace(/\/+$/, '');
        }
        const port = process.env.PORT || 3000;
        return `http://localhost:${port}`;
    }

    toPublicMediaUrl(mediaPath) {
        if (!mediaPath) return null;
        if (/^https?:\/\//i.test(mediaPath)) return mediaPath;
        const normalizedPath = String(mediaPath).replace(/^\/+/, '');
        return `${this.getMediaBaseUrl()}/uploads/whatsapp_media/${normalizedPath}`;
    }

    emitSocketMessage(payload = {}) {
        const eventPayload = {
            ...payload,
            media_url: this.toPublicMediaUrl(payload.media_path),
        };
        getIO()?.emit('new_message', eventPayload);
    }

    ensureDirectories() {
        const dirs = [
            this.mediaDir,
            path.join(this.mediaDir, 'images'),
            path.join(this.mediaDir, 'videos'),
            path.join(this.mediaDir, 'audios'),
            path.join(this.mediaDir, 'documents')
        ];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });
    }

    async initialize() {
        try {
            const authPath = path.join(__dirname, '../auth_info_baileys');
            if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

            const { state, saveCreds } = await useMultiFileAuthState(authPath);
            const customLogger = pino({ level: 'silent' });

            this.sock = makeWASocket({
                version,
                auth: state,
                logger: customLogger,
                browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
                defaultQueryTimeoutMs: undefined,
            });

            this.sock.ev.on('creds.update', async () => {
                try {
                    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });
                    await saveCreds();
                } catch (saveError) {
                    if (saveError?.code === 'ENOENT') {
                        try {
                            fs.mkdirSync(authPath, { recursive: true });
                            await saveCreds();
                        } catch (retryError) {
                            console.error('Failed to save creds after retry:', retryError);
                        }
                    } else {
                        console.error('Failed to save creds:', saveError);
                    }
                }
            });
            this.sock.ev.on('connection.update', async (update) => {
                await this.handleConnectionUpdate(update);
            });
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                for (const msg of messages) {
                    await this.handleIncomingMessage(msg);
                }
            });

        } catch (error) {
            console.error('❌ WhatsApp initialization error:', error);
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                setTimeout(() => this.initialize(), 5000);
            }
        }
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            this.qrCode = qr;
            console.log('📱 QR Code available');
            getIO()?.emit('wa_qr', { qr });
        }

        if (connection === 'close') {
            this.isConnected = false;
            getIO()?.emit('wa_status', { connected: false });
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error;

            if (reason?.message?.includes('conflict')) {
                if (this.sock) await this.sock.end();
                setTimeout(() => {
                    const authPath = path.join(__dirname, '../auth_info_baileys');
                    if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
                    process.exit(1);
                }, 2000);
                return;
            }

            if (statusCode === DisconnectReason.loggedOut) {
                this.qrCode = null;
                if (!this.isManualDisconnect) {
                    const authPath = path.join(__dirname, '../auth_info_baileys');
                    if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
                }
                return;
            }

            if (statusCode !== DisconnectReason.loggedOut && this.retryCount < this.maxRetries) {
                this.retryCount++;
                setTimeout(() => this.initialize(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Connected');
            this.isConnected = true;
            this.qrCode = null;
            this.retryCount = 0;
            getIO()?.emit('wa_status', { connected: true });
        }
    }

    async handleIncomingMessage(msg) {
        try {
            console.log('Received message:', msg.key.id, 'from', msg.key.remoteJid);
            if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
            const messageType = Object.keys(msg.message)[0];

            const ignoredTypes = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'];
            if (ignoredTypes.includes(messageType)) return;

            const sender = msg.key.remoteJidAlt || msg.key.remoteJid;

            if (sender.includes('@lid')) {
                console.log('⏩ Skipping business API message from:', sender);
                return;
            }

            const direction = msg.key.fromMe ? 'outgoing' : 'incoming';
            const isFromGroup = sender.endsWith('@g.us');
            if (isFromGroup) return;

            const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date();

            let messageText = '';
            let mediaPath = null;
            let hasMedia = false;

            switch (messageType) {
                case 'conversation':
                    messageText = msg.message.conversation;
                    break;
                case 'extendedTextMessage':
                    messageText = msg.message.extendedTextMessage.text;
                    break;
                case 'imageMessage':
                    messageText = msg.message.imageMessage.caption || '';
                    mediaPath = await this.saveMedia(msg, 'image');
                    hasMedia = true;
                    break;
                case 'videoMessage':
                    messageText = msg.message.videoMessage.caption || '';
                    mediaPath = await this.saveMedia(msg, 'video');
                    hasMedia = true;
                    break;
                case 'audioMessage':
                    messageText = '';
                    mediaPath = await this.saveMedia(msg, 'audio');
                    hasMedia = true;
                    break;
                case 'documentMessage':
                    messageText = msg.message.documentMessage.caption || '';
                    mediaPath = await this.saveMedia(msg, 'document');
                    hasMedia = true;
                    break;
                case 'reactionMessage':
                    messageText = `Reacted ${msg.message.reactionMessage.text || '❤️'}`;
                    break;
                default:
                    return;
            }

            try {
                const cleanPhone = extractPhoneNumber(sender);
                await whatsappHelpers.saveMessage({
                    message_id: msg.key.id,
                    outgoing: direction === 'outgoing',
                    phone: cleanPhone,
                    isFromGroup,
                    message_text: messageText,
                    has_media: hasMedia,
                    media_path: mediaPath,
                    is_viewed: direction === 'outgoing',
                    timestamp,
                });
                console.log('Saved message to DB:', msg.key.id);
                 if (direction === 'incoming') {
                        const eventPayload = {
                            message_id: msg.key.id,
                            outgoing: direction === 'outgoing',
                            phone: cleanPhone,
                            isFromGroup,
                            message_text: messageText,
                            has_media: hasMedia,
                            media_path: mediaPath,
                            is_viewed: direction === 'outgoing',
                            timestamp,
                        };
                        this.emitSocketMessage(eventPayload);
                        console.log('Emitted new_message event to clients:', msg.key.id);

                        for (const handler of this.messageHandlers) {
                            await handler(eventPayload);
                        }
        
                        
                            await this.processAutoReply(sender, messageText);
                }
            } catch (dbError) {
                if (!dbError?.includes?.('already exists')) {
                    console.error('DB error:', dbError);
                }
            }

        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    // ─── Save incoming media (from Baileys msg) ───────────────────────────────
    async saveMedia(msg, mediaType) {
        try {
            const mediaBuffer = await downloadMediaMessage(
                msg, 'buffer', {},
                { logger: pino({ level: 'silent' }), reuploadRequest: this.sock.updateMediaMessage }
            );

            if (!mediaBuffer || mediaBuffer.length > this.maxFileSize) return null;

            const timestamp = Date.now();
            const ext = this.getExtension(mediaType);
            const filename = `${mediaType}_${timestamp}${ext}`;
            const relativePath = path.join(mediaType + 's', filename);
            const fullPath = path.join(this.mediaDir, relativePath);

            fs.writeFileSync(fullPath, mediaBuffer);
            return relativePath;

        } catch (error) {
            console.error(`Error saving ${mediaType}:`, error);
            return null;
        }
    }

    // ─── Save outgoing media buffer to disk ───────────────────────────────────
    async saveOutgoingMedia(buffer, mediaType, ext) {
        const timestamp = Date.now();
        const filename = `${mediaType}_${timestamp}${ext}`;
        const relativePath = path.join(mediaType + 's', filename);
        const fullPath = path.join(this.mediaDir, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, buffer);
        return relativePath;
    }

    // ─── Parse base64 data URI → { buffer, mimeType, mediaType, ext } ────────
    // Accepts:  "data:image/jpeg;base64,/9j/4AAQ..."
    //           "data:application/pdf;base64,JVBERi..."
    //           "data:audio/ogg;base64,T2dnUw..."
    parseBase64Attach(attach, filename) {
        const match = attach.match(/^data:([^;]+);base64,(.+)$/s);
        if (!match) throw new Error('Invalid attach. Expected: data:<mime>;base64,<data>');

        const mimeType = match[1];
        const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');

        if (buffer.length > this.maxFileSize) {
            throw new Error(`File too large. Max ${this.maxFileSize / 1024 / 1024}MB`);
        }

        let mediaType, ext;

        if (mimeType.startsWith('image/')) {
            mediaType = 'image';
            ext = '.' + mimeType.split('/')[1].replace('jpeg', 'jpg');
        } else if (mimeType.startsWith('video/')) {
            mediaType = 'video';
            ext = '.' + mimeType.split('/')[1];
        } else if (mimeType.startsWith('audio/')) {
            mediaType = 'audio';
            ext = mimeType.includes('ogg') ? '.ogg'
                : mimeType.includes('mpeg') ? '.mp3'
                : '.m4a';
        } else {
            mediaType = 'document';
            const docExts = {
                'application/pdf': '.pdf',
                'application/msword': '.doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                'application/vnd.ms-excel': '.xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
                'application/zip': '.zip',
                'text/plain': '.txt',
            };
            ext = docExts[mimeType] || (filename ? path.extname(filename) : '.bin');
        }

        return { buffer, mimeType, mediaType, ext };
    }

    // ─── Send plain text ──────────────────────────────────────────────────────
    async sendText(recipient, text) {
        try {
            if (!this.isConnected) return { success: false, error: 'Not connected' };

            const jid = this._toJid(recipient);
            const result = await this.sock.sendMessage(jid, { text });

            await this._saveOutgoingToDb({
                messageId: result.key.id,
                phone: extractPhoneNumber(jid),
                messageText: text,
                hasMedia: false,
                mediaPath: null,
            });
        
            // this.emitSocketMessage({
            //     message_id: result.key.id,
            //     outgoing: true,
            //     phone: extractPhoneNumber(jid),
            //     isFromGroup: false,
            //     message_text: text,
            //     has_media: false,
            //     media_path: null,
            //     is_viewed: true,
            //     timestamp: new Date(),
            // });

            return { success: true, result };
        } catch (error) {
            console.error('sendText error:', error);
            return { success: false, error: error.message };
        }
    }

    // ─── Send media from base64 data URI ─────────────────────────────────────
    async sendMedia(recipient, { attach, caption = '', filename }) {
        try {
            if (!this.isConnected) return { success: false, error: 'Not connected' };

            const jid = this._toJid(recipient);
            const { buffer, mimeType, mediaType, ext } = this.parseBase64Attach(attach, filename);

            const payload = {
                [mediaType]: buffer,        // image/video/audio/document key
                mimetype: mimeType,
                ...(caption                           && { caption }),
                ...(mediaType === 'document'          && { fileName: filename || `file${ext}` }),
                ...(mediaType === 'audio'             && { ptt: false }), // true = voice note
            };

            const result = await this.sock.sendMessage(jid, payload);

            // Save buffer to disk
            const mediaPath = await this.saveOutgoingMedia(buffer, mediaType, ext);

            // Save to DB
            await this._saveOutgoingToDb({
                messageId: result.key.id,
                phone: extractPhoneNumber(jid),
                messageText: caption,
                hasMedia: true,
                mediaPath,
            });

            // this.emitSocketMessage({
            //     message_id: result.key.id,
            //     outgoing: true,
            //     phone: extractPhoneNumber(jid),
            //     isFromGroup: false,
            //     message_text: caption,
            //     has_media: true,
            //     media_path: mediaPath,
            //     is_viewed: true,
            //     timestamp: new Date(),
            // });

            return { success: true, result };
        } catch (error) {
            console.error('sendMedia error:', error);
            return { success: false, error: error.message };
        }
    }

    // ─── Internal: save outgoing message to DB ────────────────────────────────
    async _saveOutgoingToDb({ messageId, phone, messageText, hasMedia, mediaPath }) {
        try {
            await whatsappHelpers.saveMessage({
                message_id: messageId,
                outgoing: true,
                phone,
                isFromGroup: false,
                message_text: messageText,
                has_media: hasMedia,
                media_path: mediaPath,
                is_viewed: true,
                timestamp: new Date(),
            });
        } catch (dbError) {
            if (!dbError?.includes?.('already exists')) {
                console.error('DB error (outgoing):', dbError);
            }
        }
    }

    // ─── Internal: normalize phone/JID ───────────────────────────────────────
    _toJid(recipient) {
        if (recipient.includes('@')) return recipient;
        let phone = recipient.replace(/[^0-9]/g, '');
        if (!phone.startsWith('91') && phone.length === 10) phone = '91' + phone;
        return `${phone}@s.whatsapp.net`;
    }

    async processAutoReply(recipient, message) {
        try {
            const reply = await replyHandler.processMessage(message, { senderId: recipient });
            if (reply && reply.text) {
                await this.sendText(recipient, reply.text);
            }
        } catch (error) {
            console.error('Auto-reply error:', error);
        }
    }

    getExtension(mediaType) {
        const ext = { image: '.jpg', video: '.mp4', audio: '.ogg', document: '.pdf' };
        return ext[mediaType] || '';
    }

    onMessage(handler) { this.messageHandlers.push(handler); }
    getQRCode() { return this.qrCode; }
    getConnectionStatus() { return this.isConnected; }
    async disconnect(reinitialize = true) {
        this.isManualDisconnect = true;
        try {
            if (this.sock) {
                if (reinitialize) {
                    this.sock.end(undefined); // graceful close, keeps session
                } else {
                    await this.sock.logout(); // full logout, wipes session
                }
            }
        } finally {
            this.sock = null;
            this.isConnected = false;
            this.qrCode = null;
            this.retryCount = 0;
            getIO()?.emit('wa_status', { connected: false });

            // Remove Baileys auth files to force fresh QR (like after restart)
            try {
                const authPath = require('path').join(__dirname, '../auth_info_baileys');
                const fs = require('fs');
                if (fs.existsSync(authPath)) {
                    fs.rmSync(authPath, { recursive: true, force: true });
                }
            } catch (err) {
                console.error('Failed to remove auth_info_baileys:', err);
            }

            setTimeout(() => {
                this.isManualDisconnect = false;
                this.initialize().catch((err) => {
                    console.error('Reinitialize after disconnect failed:', err);
                });
            }, 500);
        }
    }
}

const whatsappService = new WhatsAppNonApiService();
module.exports = whatsappService;





// const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
// const pino = require('pino');
// const fs = require('fs');
// const path = require('path');
// const whatsappHelpers = require('../helpers/whatsapp_data_helper');
// const { extractPhoneNumber } = require('../helpers/whatsapp_data_helper');
// const { replyHandler } = require('./whatsapp_reply_handler');


// class WhatsAppService {
//     constructor() {
//         this.sock = null;
//         this.isConnected = false;
//         this.qrCode = null;
//         this.retryCount = 0;
//         this.maxRetries = 5;
//         this.messageHandlers = [];
        
//         // Storage configuration
//         this.mediaDir = process.env.WHATSAPP_UPLOADS_DIR || 'uploads/whatsapp_media';
//         this.maxFileSize = 16 * 1024 * 1024; // 16MB
        
//         this.ensureDirectories();
//     }

//     ensureDirectories() {
//         const dirs = [
//             this.mediaDir,
//             path.join(this.mediaDir, 'images'),
//             path.join(this.mediaDir, 'videos'),
//             path.join(this.mediaDir, 'audio'),
//             path.join(this.mediaDir, 'documents')
//         ];

//         dirs.forEach(dir => {
//             if (!fs.existsSync(dir)) {
//                 fs.mkdirSync(dir, { recursive: true });
//             }
//         });
//     }

//     async initialize() {
//         try {
//             const authPath = path.join(__dirname, '../auth_info_baileys');
            
//             if (!fs.existsSync(authPath)) {
//                 fs.mkdirSync(authPath, { recursive: true });
//             }

//             const { version, isLatest } = await fetchLatestBaileysVersion();
//             console.log(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

//             const { state, saveCreds } = await useMultiFileAuthState(authPath);
//             const customLogger = pino({ level: 'silent' });

//             this.sock = makeWASocket({
//                 version,
//                 auth: state,
//                 logger: customLogger,
//                 browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
//                 defaultQueryTimeoutMs: undefined,
//             });

//             this.sock.ev.on('creds.update', saveCreds);
//             this.sock.ev.on('connection.update', async (update) => {
//                 await this.handleConnectionUpdate(update);
//             });

//             this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
//                 if (type !== 'notify') return;
//                 for (const msg of messages) {
//                     await this.handleIncomingMessage(msg);
//                 }
//             });

//         } catch (error) {
//             console.error('❌ WhatsApp initialization error:', error);
//             if (this.retryCount < this.maxRetries) {
//                 this.retryCount++;
//                 setTimeout(() => this.initialize(), 5000);
//             }
//         }
//     }

//     async handleConnectionUpdate(update) {
//         const { connection, lastDisconnect, qr } = update;

//         if (qr) {
//             this.qrCode = qr;
//             console.log('📱 QR Code available');
//         }

//         if (connection === 'close') {
//             this.isConnected = false;
//             const statusCode = lastDisconnect?.error?.output?.statusCode;
//             const reason = lastDisconnect?.error;

//             if (reason?.message?.includes('conflict')) {
//                 if (this.sock) await this.sock.end();
//                 setTimeout(() => {
//                     const authPath = path.join(__dirname, '../auth_info_baileys');
//                     if (fs.existsSync(authPath)) {
//                         fs.rmSync(authPath, { recursive: true, force: true });
//                     }
//                     process.exit(1);
//                 }, 2000);
//                 return;
//             }

//             if (statusCode === DisconnectReason.loggedOut) {
//                 this.qrCode = null;
//                 const authPath = path.join(__dirname, '../auth_info_baileys');
//                 if (fs.existsSync(authPath)) {
//                     fs.rmSync(authPath, { recursive: true, force: true });
//                 }
//                 return;
//             }

//             if (statusCode !== DisconnectReason.loggedOut && this.retryCount < this.maxRetries) {
//                 this.retryCount++;
//                 setTimeout(() => this.initialize(), 5000);
//             }
//         }
//         else if (connection === 'open') {
//             console.log('✅ WhatsApp Connected');
//             this.isConnected = true;
//             this.qrCode = null;
//             this.retryCount = 0;
//         }
//     }

//     async handleIncomingMessage(msg) {
//         try {
//             if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
//             const messageType = Object.keys(msg.message)[0];
            
//             // Skip internal WhatsApp messages
//             const ignoredTypes = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'];
//             if (ignoredTypes.includes(messageType)) return;

//             const sender = msg.key.remoteJidAlt || msg.key.remoteJid;

//             console.log(msg);
//             // Skip WhatsApp Business API / @lid messages (optional - comment out if you want to save them)
//             if (sender.includes('@lid')) {
//                 console.log('⏩ Skipping business API message from:', sender);
//                 return;
//             }
            
//             // Determine direction based on msg.key.fromMe
//             const direction = msg.key.fromMe ? 'outgoing' : 'incoming';
//             // Check if it's from a group
//             const isFromGroup = sender.endsWith('@g.us');
//             if(isFromGroup) {
//                 return; // Skip group messages if you only want personal chats
//             }

//             const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date();

//             let messageText = '';
//             let mediaPath = null;
//             let hasMedia = false;

//             // Extract message text and handle media
//             switch (messageType) {
//                 case 'conversation':
//                     messageText = msg.message.conversation;
//                     break;

//                 case 'extendedTextMessage':
//                     messageText = msg.message.extendedTextMessage.text;
//                     break;

//                 case 'imageMessage':
//                     messageText = msg.message.imageMessage.caption || '';
//                     mediaPath = await this.saveMedia(msg, 'image');
//                     hasMedia = true;
//                     break;

//                 case 'videoMessage':
//                     messageText = msg.message.videoMessage.caption || '';
//                     mediaPath = await this.saveMedia(msg, 'video');
//                     hasMedia = true;
//                     break;

//                 case 'audioMessage':
//                     messageText = '';
//                     mediaPath = await this.saveMedia(msg, 'audio');
//                     hasMedia = true;
//                     break;

//                 case 'documentMessage':
//                     messageText = msg.message.documentMessage.caption || '';
//                     mediaPath = await this.saveMedia(msg, 'document');
//                     hasMedia = true;
//                     break;

//                 case 'reactionMessage':
//                     messageText = `Reacted ${msg.message.reactionMessage.text || '❤️'}`;
//                     break;

//                 default:
//                     return;
//             }

//             // Save to database - minimal data
//             try {
//                 const cleanPhone = extractPhoneNumber(sender);
                
//                 await whatsappHelpers.saveMessage({
//                     message_id: msg.key.id,
//                     outgoing: direction === 'outgoing' ? true : false,
//                     phone: cleanPhone,
//                     isFromGroup: isFromGroup,
//                     message_text: messageText,
//                     has_media: hasMedia,
//                     media_path: mediaPath,
//                     is_viewed: direction === 'outgoing' ? true : false,
//                     timestamp: timestamp
//                 });
//                 // Auto-reply only for incoming messages (not our own messages)
//                 if (direction === 'incoming') {
//                     await this.processAutoReply(sender, messageText);
//                 }

//                 // // Custom handlers
//                 // for (const handler of this.messageHandlers) {
//                 //     await handler({ 
//                 //         phone: cleanPhone, 
//                 //         messageText, 
//                 //         hasMedia, 
//                 //         mediaPath,
//                 //         outgoing: direction === 'outgoing' ? true : false,
//                 //         isFromGroup
//                 //     });
//                 // }

//             } catch (dbError) {
//                 if (!dbError.includes('already exists')) {
//                     console.error('DB error:', dbError);
//                 }
//             }

//         } catch (error) {
//             console.error('Error handling message:', error);
//         }
//     }

//     async saveMedia(msg, mediaType) {
//         try {
//             const mediaBuffer = await downloadMediaMessage(
//                 msg,
//                 'buffer',
//                 {},
//                 {
//                     logger: pino({ level: 'silent' }),
//                     reuploadRequest: this.sock.updateMediaMessage
//                 }
//             );

//             if (!mediaBuffer || mediaBuffer.length > this.maxFileSize) return null;

//             const timestamp = Date.now();
//             const ext = this.getExtension(mediaType);
//             const filename = `${mediaType}_${timestamp}${ext}`;
//             const relativePath = path.join(mediaType + 's', filename);
//             const fullPath = path.join(this.mediaDir, relativePath);

//             fs.writeFileSync(fullPath, mediaBuffer);
//             return relativePath;

//         } catch (error) {
//             console.error(`Error saving ${mediaType}:`, error);
//             return null;
//         }
//     }

//     async processAutoReply(recipient, message) {
//         try {
//             const reply = await replyHandler.processMessage(message, {});
//             if (reply && reply.text) {
//                 await this.sendMessage(recipient, { text: reply.text });
//             }
//         } catch (error) {
//             console.error('Auto-reply error:', error);
//         }
//     }

//     async sendMessage(recipient, content) {
//         try {
//             if (!this.isConnected) {
//                 return { success: false, error: 'Not connected' };
//             }
//             if (!recipient.includes('@')) {
//                 recipient = `${recipient}@s.whatsapp.net`;
//             }

//             const result = await this.sock.sendMessage(recipient, content);
            
//             // Save outgoing message
//             try {
//                 const cleanPhone = extractPhoneNumber(recipient);
//                 const isFromGroup = recipient.endsWith('@g.us');
                
//                 await whatsappHelpers.saveMessage({
//                     message_id: result.key.id,
//                     direction: 'outgoing',
//                     phone: cleanPhone,
//                     isFromGroup: isFromGroup,
//                     message_text: content.text || content.caption || '',
//                     has_media: !!(content.image || content.document || content.video),
//                     media_path: null,
//                     is_viewed: true, // Outgoing messages are "viewed" by default
//                     timestamp: new Date()
//                 });
//             } catch (dbError) {
//                 // Continue even if DB save fails
//             }

//             return { success: true, result };

//         } catch (error) {
//             console.error('Error sending message:', error);
//             return { success: false, error: error.message };
//         }
//     }

//     async sendImage(recipient, imagePath, caption = '') {
//         try {
//             if (!fs.existsSync(imagePath)) {
//                 throw new Error('Image not found');
//             }

//             const imageBuffer = fs.readFileSync(imagePath);
//             return await this.sendMessage(recipient, { image: imageBuffer, caption });

//         } catch (error) {
//             return { success: false, error: error.message };
//         }
//     }

//     getExtension(mediaType) {
//         const ext = {
//             'image': '.jpg',
//             'video': '.mp4',
//             'audio': '.ogg',
//             'document': '.pdf'
//         };
//         return ext[mediaType] || '';
//     }

//     onMessage(handler) {
//         this.messageHandlers.push(handler);
//     }

//     getQRCode() {
//         return this.qrCode;
//     }

//     getConnectionStatus() {
//         return this.isConnected;
//     }

//     async disconnect() {
//         try {
//             if (this.client) {
//                     await this.client.logout();
//                     await this.client.destroy();
//                     this.client = null;
//                     this.qr = null;
//                     this.connected = false;
//             }
//             if (this.sock) {
//                 await this.sock.logout();
//                 this.isConnected = false;
//             }
//         } catch (error) {
//             console.error('Error disconnecting:', error);
//         }
//     }
// }

// const whatsappService = new WhatsAppService();

// module.exports = whatsappService;
