const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
    constructor() {
        this.sock = null;
        this.isConnected = false;
        this.qrCode = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.messageHandlers = []; // For custom message handlers
    }

    async initialize() {
        try {
            console.log('🔄 Initializing WhatsApp...');

            const authPath = path.join(__dirname, '../auth_info_baileys');

            // Create auth directory if it doesn't exist
            if (!fs.existsSync(authPath)) {
                fs.mkdirSync(authPath, { recursive: true });
                console.log('📁 Created auth directory');
            }

            // Get latest Baileys version
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

            const { state, saveCreds } = await useMultiFileAuthState(authPath);

            this.sock = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }), // Change to 'debug' for troubleshooting
                browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
                defaultQueryTimeoutMs: undefined,
            });

            // Save credentials whenever updated
            this.sock.ev.on('creds.update', saveCreds);

            // Connection updates
            // In the connection.update event handler
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.qrCode = qr;
                    console.log('📱 QR Code received! Visit http://localhost:3000/whatsapp/qr to scan');
                }

                if (connection === 'close') {
                    this.isConnected = false;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error;

                    console.log('❌ Connection closed');
                    console.log('Status code:', statusCode);
                    console.log('Reason:', reason?.message);

                    // CRITICAL: Handle conflict - DO NOT auto-reconnect
                    // In the connection.update handler, update the conflict section:

                    if (reason?.message?.includes('conflict')) {
                        console.log('\n⚠️ ========================================');
                        console.log('⚠️  CONFLICT ERROR DETECTED');
                        console.log('⚠️ ========================================');
                        console.log('⚠️  Multiple WhatsApp connections detected!');
                        console.log('⚠️ ========================================');
                        console.log('⚠️  SOLUTION:');
                        console.log('⚠️  1. On your phone: Settings → Linked Devices');
                        console.log('⚠️  2. Remove ALL linked devices');
                        console.log('⚠️  3. Restart this server');
                        console.log('⚠️ ========================================\n');

                        // Mark as not connected
                        this.isConnected = false;
                        this.qrCode = null;

                        // Close the socket properly before deleting auth
                        try {
                            if (this.sock) {
                                await this.sock.end();
                                this.sock = null;
                            }
                        } catch (err) {
                            console.log('Error closing socket:', err.message);
                        }

                        // Wait a moment, then delete auth files
                        setTimeout(() => {
                            const authPath = path.join(__dirname, '../auth_info_baileys');
                            if (fs.existsSync(authPath)) {
                                try {
                                    fs.rmSync(authPath, { recursive: true, force: true });
                                    console.log('🗑️  Auth files deleted - will need new QR scan');
                                } catch (err) {
                                    console.log('Error deleting auth:', err.message);
                                }
                            }
                        }, 1000);

                        // STOP reconnecting on conflict
                        console.log('🛑 Stopped auto-reconnect. Please restart server manually.');
                        this.retryCount = this.maxRetries;

                        // Exit the process to force clean restart
                        setTimeout(() => {
                            console.log('🛑 Exiting process. Please restart manually.');
                            process.exit(1);
                        }, 2000);

                        return;
                    }

                    // Handle logout
                    if (statusCode === DisconnectReason.loggedOut) {
                        console.log('⚠️ Device logged out. Please scan QR code again.');
                        this.qrCode = null;
                        const authPath = path.join(__dirname, '../auth_info_baileys');
                        if (fs.existsSync(authPath)) {
                            fs.rmSync(authPath, { recursive: true, force: true });
                        }
                        // Don't retry on logout
                        return;
                    }

                    // Only reconnect for other errors (network issues, etc.)
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect && this.retryCount < this.maxRetries) {
                        this.retryCount++;
                        console.log(`🔄 Reconnecting... (Attempt ${this.retryCount}/${this.maxRetries})`);
                        setTimeout(() => this.initialize(), 5000);
                    } else if (this.retryCount >= this.maxRetries) {
                        console.log('❌ Max retry attempts reached. Please restart manually.');
                    }
                }
                else if (connection === 'connecting') {
                    console.log('🔄 Connecting to WhatsApp...');
                }
                else if (connection === 'open') {
                    console.log('✅ WhatsApp Connected Successfully!');
                    this.isConnected = true;
                    this.qrCode = null;
                    this.retryCount = 0;
                }
            });
            // Listen for incoming messages
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                for (const msg of messages) {
                    await this.handleIncomingMessage(msg);
                }
            });

            // // Handle message status updates
            // this.sock.ev.on('messages.update', (updates) => {
            //     for (const update of updates) {
            //         // console.log('📨 Message update:', update);
            //     }
            // });

        } catch (error) {
            console.error('❌ WhatsApp initialization error:', error);
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`🔄 Retrying initialization... (${this.retryCount}/${this.maxRetries})`);
                setTimeout(() => this.initialize(), 5000);
            }
        }
    }

    async handleIncomingMessage(msg) {
        try {
            // Ignore if no message or if it's from status broadcast
            if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

            // Ignore own messages
            if (msg.key.fromMe) return;

            // Extract message content
            const messageType = Object.keys(msg.message)[0];
            let messageText = '';
            let mediaData = null;

            switch (messageType) {
                case 'conversation':
                    messageText = msg.message.conversation;
                    break;
                case 'extendedTextMessage':
                    messageText = msg.message.extendedTextMessage.text;
                    break;
                case 'imageMessage':
                    messageText = msg.message.imageMessage.caption || '';
                    mediaData = { type: 'image', message: msg.message.imageMessage };
                    break;
                case 'videoMessage':
                    messageText = msg.message.videoMessage.caption || '';
                    mediaData = { type: 'video', message: msg.message.videoMessage };
                    break;
                case 'documentMessage':
                    messageText = msg.message.documentMessage.caption || '';
                    mediaData = { type: 'document', message: msg.message.documentMessage };
                    break;
                default:
                   
                    return;
            }

            const sender = msg.key.remoteJid;
            const senderName = msg.pushName || 'Unknown';
            const isGroup = sender.endsWith('@g.us');

            console.log('\n📩 New Message Received:');
            console.log(`   From: ${senderName} (${sender})`);
            console.log(`   Type: ${isGroup ? 'Group' : 'Personal'}`);
            console.log(`   Message: ${messageText}`);
            if (mediaData) console.log(`   Media: ${mediaData.type}`);
            await this.processAutoReply(sender, messageText, msg, mediaData);
            for (const handler of this.messageHandlers) {
                await handler({ sender, senderName, messageText, messageType, msg, mediaData });
            }

        } catch (error) {
            console.error('❌ Error handling message:', error);
        }
    }

    async processAutoReply(recipient, message, originalMsg, mediaData) {
        const lowerMsg = message.toLowerCase().trim();

        try {
            // Welcome message
            if (lowerMsg === 'hi' || lowerMsg === 'hello' || lowerMsg === 'hey' || lowerMsg === 'start') {
                await this.sendMessage(recipient, {
                    text: `👋 *Hello! Welcome!*\n\n` +
                        `I'm your automated assistant. How can I help you today?\n\n` +
                        `Type *menu* to see all available options.`
                });
            }
            // Menu
            else if (lowerMsg === 'menu' || lowerMsg === 'help') {
                await this.sendMessage(recipient, {
                    text: `📋 *Main Menu*\n\n` +
                        `*1.* Products 🛍️\n` +
                        `*2.* Bookings 📅\n` +
                        `*3.* Lead/Inquiry 💼\n` +
                        `*4.* Contact Support 📞\n` +
                        `*5.* About Us ℹ️\n\n` +
                        `Just type the option name or number!`
                });
            }
            // Products
            else if (lowerMsg.includes('product') || lowerMsg === '1') {
                await this.sendMessage(recipient, {
                    text: `🛍️ *Our Products*\n\n` +
                        `We offer a wide range of quality products.\n\n` +
                        `Visit our website or type *contact* to speak with our sales team.`
                });
            }
            // Booking
            else if (lowerMsg.includes('booking') || lowerMsg.includes('book') || lowerMsg === '2') {
                await this.sendMessage(recipient, {
                    text: `📅 *Make a Booking*\n\n` +
                        `To book our services, please provide:\n` +
                        `• Your full name\n` +
                        `• Preferred date & time\n` +
                        `• Service required\n\n` +
                        `Or visit our website to book online instantly!`
                });
            }
            // Lead/Inquiry
            else if (lowerMsg.includes('lead') || lowerMsg.includes('inquiry') || lowerMsg === '3') {
                await this.sendMessage(recipient, {
                    text: `💼 *Submit Your Inquiry*\n\n` +
                        `Please share:\n` +
                        `• Your name\n` +
                        `• Email/Phone\n` +
                        `• Your requirements\n\n` +
                        `Our team will contact you within 24 hours!`
                });
            }
            // Contact
            else if (lowerMsg.includes('contact') || lowerMsg.includes('support') || lowerMsg === '4') {
                await this.sendMessage(recipient, {
                    text: `📞 *Contact Information*\n\n` +
                        `📧 Email: support@yourcompany.com\n` +
                        `📱 Phone: +91 830 103 1955\n` +
                        `🕒 Hours: Mon-Fri, 9 AM - 6 PM IST\n\n` +
                        `We're here to help! 😊`
                });
            }
            // About
            else if (lowerMsg.includes('about') || lowerMsg === '5') {
                await this.sendMessage(recipient, {
                    text: `ℹ️ *About Us*\n\n` +
                        `We are a leading service provider committed to excellence.\n\n` +
                        `Type *contact* to learn more or speak with our team.`
                });
            }
            // Thank you
            else if (lowerMsg.includes('thank') || lowerMsg.includes('thanks')) {
                await this.sendMessage(recipient, {
                    text: `You're welcome! 😊\n\nIs there anything else I can help you with?\n\nType *menu* for options.`
                });
            }
            // Default response
            else {
                await this.sendMessage(recipient, {
                    text: `Thank you for your message! 🙏\n\n` +
                        `I'll make sure someone gets back to you soon.\n\n` +
                        `Type *menu* to see what I can help you with right now.`
                });
            }
        } catch (error) {
            console.error('❌ Error in auto-reply:', error);
        }
    }

    // Add custom message handler
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }

    async sendMessage(recipient, content) {
        try {
            if (!this.isConnected) {
                console.log('❌ WhatsApp not connected. Cannot send message.');
                return { success: false, error: 'Not connected' };
            }

            // Ensure recipient has proper format
            if (!recipient.includes('@')) {
                recipient = `${recipient}@s.whatsapp.net`;
            }

            console.log(`📤 Sending message to ${recipient}`);
            const result = await this.sock.sendMessage(recipient, content);
            console.log('✅ Message sent successfully');
            return { success: true, result };

        } catch (error) {
            console.error('❌ Error sending message:', error);
            return { success: false, error: error.message };
        }
    }

    async sendImage(recipient, imagePath, caption = '') {
        try {
            if (!fs.existsSync(imagePath)) {
                throw new Error('Image file not found');
            }

            const imageBuffer = fs.readFileSync(imagePath);

            return await this.sendMessage(recipient, {
                image: imageBuffer,
                caption: caption
            });
        } catch (error) {
            console.error('❌ Error sending image:', error);
            return { success: false, error: error.message };
        }
    }

    async sendDocument(recipient, documentPath, fileName) {
        try {
            if (!fs.existsSync(documentPath)) {
                throw new Error('Document file not found');
            }

            const documentBuffer = fs.readFileSync(documentPath);

            return await this.sendMessage(recipient, {
                document: documentBuffer,
                fileName: fileName,
                mimetype: 'application/pdf' // Adjust based on file type
            });
        } catch (error) {
            console.error('❌ Error sending document:', error);
            return { success: false, error: error.message };
        }
    }

    async sendBulkMessage(recipients, message, delay = 3000) {
        const results = [];

        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            console.log(`📤 Sending to ${i + 1}/${recipients.length}: ${recipient}`);

            try {
                const result = await this.sendMessage(recipient, { text: message });
                results.push({ recipient, status: 'sent', ...result });

                // Delay to avoid rate limiting (except for last message)
                if (i < recipients.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (error) {
                console.error(`❌ Failed to send to ${recipient}:`, error.message);
                results.push({ recipient, status: 'failed', error: error.message });
            }
        }

        return results;
    }

    getQRCode() {
        return this.qrCode;
    }

    getConnectionStatus() {
        return this.isConnected;
    }

    async disconnect() {
        try {
            if (this.sock) {
                await this.sock.logout();
                this.isConnected = false;
                console.log('👋 WhatsApp disconnected');
            }
        } catch (error) {
            console.error('❌ Error disconnecting:', error);
        }
    }

    // Download media from message
    async downloadMedia(msg) {
        try {
            const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                {
                    logger: pino({ level: 'silent' }),
                    reuploadRequest: this.sock.updateMediaMessage
                }
            );
            return buffer;
        } catch (error) {
            console.error('❌ Error downloading media:', error);
            return null;
        }
    }
}

// Singleton instance
const whatsappService = new WhatsAppService();

module.exports = whatsappService;