const router = require('express').Router();
const whatsappService = require('../../services/whatsapp-service');
const qrcode = require('qrcode');

// Store received messages in memory (use DB in production)
let receivedMessages = [];

// Add message listener
whatsappService.onMessage(async ({ sender, senderName, messageText, messageType, mediaData }) => {
    receivedMessages.unshift({
        sender,
        senderName,
        messageText,
        messageType,
        mediaData: mediaData ? mediaData.type : null,
        timestamp: new Date()
    });
    
    // Keep only last 100 messages
    if (receivedMessages.length > 100) {
        receivedMessages = receivedMessages.slice(0, 100);
    }
});

// View received messages
router.get('/messages', (req, res) => {
    res.json({
        success: true,
        count: receivedMessages.length,
        messages: receivedMessages
    });
});

// Clear received messages
router.delete('/messages', (req, res) => {
    receivedMessages = [];
    res.json({ success: true, message: 'Messages cleared' });
});

// Get QR Code for scanning
router.get('/qr', async (req, res) => {
    try {
        const qr = whatsappService.getQRCode();
        const isConnected = whatsappService.getConnectionStatus();
        
        if (isConnected) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WhatsApp Connected</title>
                    <style>
                        body { 
                            font-family: Arial; 
                            text-align: center; 
                            padding: 50px; 
                            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                            color: white;
                        }
                        .container {
                            background: white;
                            color: #333;
                            padding: 40px;
                            border-radius: 20px;
                            max-width: 500px;
                            margin: 0 auto;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        }
                        h1 { font-size: 3em; margin: 0; color: #25D366; }
                        .checkmark { font-size: 5em; }
                        a { 
                            display: inline-block;
                            margin: 10px;
                            padding: 12px 24px;
                            background: #25D366;
                            color: white;
                            text-decoration: none;
                            border-radius: 25px;
                        }
                        a:hover { background: #128C7E; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="checkmark">✅</div>
                        <h1>Connected!</h1>
                        <p>Your WhatsApp is connected and ready to send/receive messages</p>
                        <div>
                            <a href="/whatsapp/status">View Status</a>
                            <a href="/whatsapp/messages">View Messages</a>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
        
        if (!qr) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WhatsApp Initializing</title>
                    <meta http-equiv="refresh" content="2">
                    <style>
                        body { 
                            font-family: Arial; 
                            text-align: center; 
                            padding: 50px;
                            background: #f5f5f5;
                        }
                        .loader { 
                            border: 8px solid #f3f3f3; 
                            border-top: 8px solid #25D366; 
                            border-radius: 50%; 
                            width: 60px; 
                            height: 60px; 
                            animation: spin 1s linear infinite; 
                            margin: 20px auto; 
                        }
                        @keyframes spin { 
                            0% { transform: rotate(0deg); } 
                            100% { transform: rotate(360deg); } 
                        }
                    </style>
                </head>
                <body>
                    <h2>⏳ Initializing WhatsApp...</h2>
                    <div class="loader"></div>
                    <p>Please wait... Page will refresh automatically</p>
                </body>
                </html>
            `);
        }

        // Generate QR code as image
        const qrImage = await qrcode.toDataURL(qr);
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Scan WhatsApp QR Code</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 20px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        text-align: center;
                        max-width: 500px;
                    }
                    h1 {
                        color: #128C7E;
                        margin-bottom: 20px;
                    }
                    .qr-code {
                        margin: 30px 0;
                        padding: 20px;
                        background: #f5f5f5;
                        border-radius: 10px;
                    }
                    .qr-code img {
                        max-width: 300px;
                        height: auto;
                    }
                    .instructions {
                        text-align: left;
                        margin: 20px 0;
                        color: #666;
                    }
                    .instructions ol {
                        padding-left: 20px;
                    }
                    .instructions li {
                        margin: 10px 0;
                    }
                    .refresh-btn {
                        background: #25D366;
                        color: white;
                        border: none;
                        padding: 12px 30px;
                        border-radius: 25px;
                        cursor: pointer;
                        font-size: 16px;
                        margin-top: 20px;
                    }
                    .refresh-btn:hover {
                        background: #128C7E;
                    }
                </style>
                <script>
                    // Auto refresh every 30 seconds
                    setTimeout(() => location.reload(), 30000);
                </script>
            </head>
            <body>
                <div class="container">
                    <h1>📱 Scan WhatsApp QR Code</h1>
                    
                    <div class="qr-code">
                        <img src="${qrImage}" alt="WhatsApp QR Code">
                    </div>
                    
                    <div class="instructions">
                        <h3>How to connect:</h3>
                        <ol>
                            <li>Open <strong>WhatsApp</strong> on your phone</li>
                            <li>Go to <strong>Settings → Linked Devices</strong></li>
                            <li>Tap <strong>Link a Device</strong></li>
                            <li>Scan this QR code</li>
                        </ol>
                    </div>
                    
                    <button class="refresh-btn" onclick="location.reload()">🔄 Refresh QR Code</button>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get connection status
router.get('/status', (req, res) => {
    const isConnected = whatsappService.getConnectionStatus();
    res.json({ 
        success: true, 
        connected: isConnected,
        message: isConnected ? 'WhatsApp is connected' : 'WhatsApp is not connected',
        receivedMessagesCount: receivedMessages.length
    });
});

// Send single message
router.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;
        
        console.log('Received request to send message:', { phone, message });
        
        if (!phone || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone and message are required' 
            });
        }

        // Format phone number
        let recipient = phone.replace(/[^0-9]/g, ''); // Remove non-numeric
        
        // Add country code if not present
        if (!recipient.startsWith('91') && recipient.length === 10) {
            recipient = '91' + recipient; // Add India code
        }
        
        recipient = `${recipient}@s.whatsapp.net`;

        const result = await whatsappService.sendMessage(recipient, { text: message });
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send image
router.post('/send-image', async (req, res) => {
    try {
        const { phone, imagePath, caption } = req.body;
        
        if (!phone || !imagePath) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone and imagePath are required' 
            });
        }

        let recipient = phone.replace(/[^0-9]/g, '');
        if (!recipient.startsWith('91') && recipient.length === 10) {
            recipient = '91' + recipient;
        }
        recipient = `${recipient}@s.whatsapp.net`;

        const result = await whatsappService.sendImage(recipient, imagePath, caption);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send bulk messages
router.post('/send-bulk', async (req, res) => {
    try {
        const { phones, message, delay } = req.body;
        
        if (!phones || !Array.isArray(phones) || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phones (array) and message are required' 
            });
        }

        // Format phone numbers
        const recipients = phones.map(phone => {
            let num = phone.replace(/[^0-9]/g, '');
            if (!num.startsWith('91') && num.length === 10) {
                num = '91' + num;
            }
            return `${num}@s.whatsapp.net`;
        });

        const results = await whatsappService.sendBulkMessage(recipients, message, delay || 3000);
        
        res.json({ 
            success: true, 
            results,
            summary: {
                total: results.length,
                sent: results.filter(r => r.status === 'sent').length,
                failed: results.filter(r => r.status === 'failed').length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Disconnect WhatsApp
router.post('/disconnect', async (req, res) => {
    try {
        await whatsappService.disconnect();
        res.json({ success: true, message: 'WhatsApp disconnected' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;