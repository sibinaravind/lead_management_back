const router = require('express').Router();
const whatsappService = require('../../services/whatsapp_nonapi_service');
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

// ==========================================
// QR CODE & CONNECTION
// ==========================================

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
                            background: #d32825ff;
                            color: white;
                            text-decoration: none;
                            border-radius: 25px;
                        }
                        a:hover { background: #8c4b12ff; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="checkmark">✅</div>
                        <h1>Connected!</h1>
                        <p>Your WhatsApp is connected and ready to send/receive messages</p>
                        <div>
                            <a href="/whatsapp_nonapi/disconnect">Disconnect</a>
                            <!-- <a href="/whatsapp/api/messages">View Messages</a> -->
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

// Disconnect WhatsApp
router.get('/disconnect', async (req, res) => {
    try {
        await whatsappService.disconnect();

          await new Promise(resolve => setTimeout(resolve, 2000));
        return res.redirect('/whatsapp_nonapi/qr');

        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// // Send single message
// router.post('/send', async (req, res) => {
//     try {
//         const { phone, message } = req.body;
        
//         console.log('Received request to send message:', { phone, message });
        
//         if (!phone || !message) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'Phone and message are required' 
//             });
//         }

//         // Format phone number
//         let recipient = phone.replace(/[^0-9]/g, '');
        
//         if (!recipient.startsWith('91') && recipient.length === 10) {
//             recipient = '91' + recipient;
//         }
        
//         recipient = `${recipient}@s.whatsapp.net`;

//         const result = await whatsappService.sendMessage(recipient, { text: message });
        
//         res.json(result);
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// Send image
router.post('/send', async (req, res) => {
    try {
        const { phone, message, attach, caption, filename } = req.body;
        // ── Validate ─────────────────────────────────────────────────────────
        if (!phone) {
            return res.status(400).json({ success: false, message: 'phone is required' });
        }
        if (!message && !attach) {
            return res.status(400).json({ success: false, message: 'message or attach is required' });
        }
        let result;

        if (attach) {
            // ── Media send (image / video / audio / document) ─────────────────
            result = await whatsappService.sendMedia(phone, {
                attach,
                caption: caption || message || '',
                filename,
            });
        } else {
            // ── Plain text ────────────────────────────────────────────────────
            result = await whatsappService.sendText(phone, message);
        }

        if (!result.success) {
            return res.status(500).json(result);
        }

        return res.json({ success: true, message_id: result.result?.key?.id });

    } catch (error) {
        console.error('POST /send error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});


// Send bulk messages
// router.post('/send-bulk', async (req, res) => {
//     try {
//         const { phones, message, delay } = req.body;
        
//         if (!phones || !Array.isArray(phones) || !message) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'Phones (array) and message are required' 
//             });
//         }

//         const recipients = phones.map(phone => {
//             let num = phone.replace(/[^0-9]/g, '');
//             if (!num.startsWith('91') && num.length === 10) {
//                 num = '91' + num;
//             }
//             return `${num}@s.whatsapp.net`;
//         });

//         const results = await whatsappService.sendBulkMessage(recipients, message, delay || 3000);
        
//         res.json({ 
//             success: true, 
//             results,
//             summary: {
//                 total: results.length,
//                 sent: results.filter(r => r.status === 'sent').length,
//                 failed: results.filter(r => r.status === 'failed').length
//             }
//         });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // ==========================================
// // MEDIA API ENDPOINTS
// // ==========================================

// // Get all messages from database
// router.get('/api/messages', async (req, res) => {
//     try {
//         const mediaHandler = whatsappService.getMediaHandler();
        
//         const filters = {
//             from: req.query.from,
//             to: req.query.to,
//             type: req.query.type,
//             startDate: req.query.startDate,
//             endDate: req.query.endDate,
//             limit: parseInt(req.query.limit) || 100,
//             skip: parseInt(req.query.skip) || 0
//         };

//         const messages = await mediaHandler.getMessages(filters);

//         res.status(200).json({
//             success: true,
//             count: messages.length,
//             filters: filters,
//             messages: messages
//         });

//     } catch (error) {
//         console.error('Error retrieving messages:', error);
//         res.status(500).json({
//             success: false,
//             error: error.message || 'Failed to retrieve messages'
//         });
//     }
// });

// // Get specific message by ID
// router.get('/api/messages/:id', async (req, res) => {
//     try {
//         const mediaHandler = whatsappService.getMediaHandler();
//         const message = await mediaHandler.getMessageById(req.params.id);

//         res.status(200).json({
//             success: true,
//             message: message
//         });

//     } catch (error) {
//         console.error('Error retrieving message:', error);
//         res.status(404).json({
//             success: false,
//             error: error.message || 'Message not found'
//         });
//     }
// });

// // Download file
// router.get('/api/messages/:id/download', async (req, res) => {
//     try {
//         const mediaHandler = whatsappService.getMediaHandler();
//         const fileData = await mediaHandler.getMessageFile(req.params.id);

//         res.set({
//             'Content-Type': fileData.mimeType,
//             'Content-Disposition': `attachment; filename="${fileData.filename}"`,
//             'Content-Length': fileData.size
//         });

//         res.send(fileData.buffer);

//     } catch (error) {
//         console.error('Error downloading file:', error);
//         res.status(404).json({
//             success: false,
//             error: error.message || 'File not found'
//         });
//     }
// });

// // View file inline
// router.get('/api/messages/:id/view', async (req, res) => {
//     try {
//         const mediaHandler = whatsappService.getMediaHandler();
//         const fileData = await mediaHandler.getMessageFile(req.params.id);

//         res.set({
//             'Content-Type': fileData.mimeType,
//             'Content-Disposition': `inline; filename="${fileData.filename}"`,
//             'Content-Length': fileData.size
//         });

//         res.send(fileData.buffer);

//     } catch (error) {
//         console.error('Error viewing file:', error);
//         res.status(404).json({
//             success: false,
//             error: error.message || 'File not found'
//         });
//     }
// });

// // Get user's messages
// router.get('/api/users/:phoneNumber/messages', async (req, res) => {
//     try {
//         const mediaHandler = whatsappService.getMediaHandler();
//         let { phoneNumber } = req.params;
        
//         // Format phone number to match database format
//         phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
//         if (!phoneNumber.startsWith('91') && phoneNumber.length === 10) {
//             phoneNumber = '91' + phoneNumber;
//         }
//         phoneNumber = `${phoneNumber}@s.whatsapp.net`;

//         const filters = {
//             from: phoneNumber,
//             type: req.query.type,
//             limit: parseInt(req.query.limit) || 50,
//             skip: parseInt(req.query.skip) || 0
//         };

//         const messages = await mediaHandler.getMessages(filters);

//         res.status(200).json({
//             success: true,
//             phoneNumber: phoneNumber,
//             count: messages.length,
//             messages: messages
//         });

//     } catch (error) {
//         console.error('Error retrieving user messages:', error);
//         res.status(500).json({
//             success: false,
//             error: error.message || 'Failed to retrieve user messages'
//         });
//     }
// });

// // Get statistics
// router.get('/api/stats', async (req, res) => {
//     try {
//         const mediaHandler = whatsappService.getMediaHandler();
//         const db = mediaHandler.db;
//         const collection = db.collection('whatsapp_messages');

//         const stats = await collection.aggregate([
//             {
//                 $facet: {
//                     totalMessages: [
//                         { $count: 'count' }
//                     ],
//                     byType: [
//                         { $group: { _id: '$type', count: { $sum: 1 } } },
//                         { $sort: { count: -1 } }
//                     ],
//                     totalStorage: [
//                         { $group: { _id: null, totalBytes: { $sum: '$file_size' } } }
//                     ],
//                     recentMessages: [
//                         { $sort: { timestamp: -1 } },
//                         { $limit: 10 },
//                         { 
//                             $project: { 
//                                 from: 1,
//                                 sender_name: 1,
//                                 type: 1, 
//                                 timestamp: 1, 
//                                 caption: 1,
//                                 filename: 1
//                             } 
//                         }
//                     ],
//                     topUsers: [
//                         { $group: { _id: '$from', messageCount: { $sum: 1 }, name: { $first: '$sender_name' } } },
//                         { $sort: { messageCount: -1 } },
//                         { $limit: 10 }
//                     ]
//                 }
//             }
//         ]).toArray();

//         const result = stats[0];

//         res.status(200).json({
//             success: true,
//             stats: {
//                 totalMessages: result.totalMessages[0]?.count || 0,
//                 messagesByType: result.byType,
//                 totalStorageBytes: result.totalStorage[0]?.totalBytes || 0,
//                 totalStorageMB: ((result.totalStorage[0]?.totalBytes || 0) / 1024 / 1024).toFixed(2),
//                 recentMessages: result.recentMessages,
//                 topUsers: result.topUsers
//             }
//         });

//     } catch (error) {
//         console.error('Error retrieving stats:', error);
//         res.status(500).json({
//             success: false,
//             error: error.message || 'Failed to retrieve stats'
//         });
//     }
// });

// // Delete message
// router.delete('/api/messages/:id', async (req, res) => {
//     try {
//         const mediaHandler = whatsappService.getMediaHandler();
//         const result = await mediaHandler.deleteMessage(req.params.id);

//         res.status(200).json({
//             success: true,
//             ...result
//         });

//     } catch (error) {
//         console.error('Error deleting message:', error);
//         res.status(500).json({
//             success: false,
//             error: error.message || 'Failed to delete message'
//         });
//     }
// });


// router.get('/messages', (req, res) => {
//     res.json({
//         success: true,
//         count: receivedMessages.length,
//         messages: receivedMessages,
//         note: 'Use /api/messages for database-stored messages'
//     });
// });

// // Clear received messages (in-memory)
// router.delete('/messages', (req, res) => {
//     receivedMessages = [];
//     res.json({ success: true, message: 'In-memory messages cleared' });
// });

module.exports = router;








// const router = require('express').Router();
// const whatsappService = require('../../services/whatsapp_nonapi_service');
// const qrcode = require('qrcode');

// // Store received messages in memory (use DB in production)
// let receivedMessages = [];

// // Add message listener
// whatsappService.onMessage(async ({ sender, senderName, messageText, messageType, mediaData }) => {
//     receivedMessages.unshift({
//         sender,
//         senderName,
//         messageText,
//         messageType,
//         mediaData: mediaData ? mediaData.type : null,
//         timestamp: new Date()
//     });
    
//     // Keep only last 100 messages
//     if (receivedMessages.length > 100) {
//         receivedMessages = receivedMessages.slice(0, 100);
//     }
// });

// // View received messages
// router.get('/messages', (req, res) => {
//     res.json({
//         success: true,
//         count: receivedMessages.length,
//         messages: receivedMessages
//     });
// });

// // Clear received messages
// router.delete('/messages', (req, res) => {
//     receivedMessages = [];
//     res.json({ success: true, message: 'Messages cleared' });
// });

// // Get QR Code for scanning
// router.get('/qr', async (req, res) => {
//     try {
//         const qr = whatsappService.getQRCode();
//         const isConnected = whatsappService.getConnectionStatus();
//         if (isConnected) {
//             return res.send(`
//                 <!DOCTYPE html>
//                 <html>
//                 <head>
//                     <title>WhatsApp Connected</title>
//                     <style>
//                         body { 
//                             font-family: Arial; 
//                             text-align: center; 
//                             padding: 50px; 
//                             background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
//                             color: white;
//                         }
//                         .container {
//                             background: white;
//                             color: #333;
//                             padding: 40px;
//                             border-radius: 20px;
//                             max-width: 500px;
//                             margin: 0 auto;
//                             box-shadow: 0 10px 40px rgba(0,0,0,0.2);
//                         }
//                         h1 { font-size: 3em; margin: 0; color: #25D366; }
//                         .checkmark { font-size: 5em; }
//                         a { 
//                             display: inline-block;
//                             margin: 10px;
//                             padding: 12px 24px;
//                             background: #25D366;
//                             color: white;
//                             text-decoration: none;
//                             border-radius: 25px;
//                         }
//                         a:hover { background: #128C7E; }
//                     </style>
//                 </head>
//                 <body>
//                     <div class="container">
//                         <div class="checkmark">✅</div>
//                         <h1>Connected!</h1>
//                         <p>Your WhatsApp is connected and ready to send/receive messages</p>
//                         <div>
//                             <a href="/whatsapp/status">View Status</a>
//                             <a href="/whatsapp/messages">View Messages</a>
//                         </div>
//                     </div>
//                 </body>
//                 </html>
//             `);
//         }
        
//         if (!qr) {
//             return res.send(`
//                 <!DOCTYPE html>
//                 <html>
//                 <head>
//                     <title>WhatsApp Initializing</title>
//                     <meta http-equiv="refresh" content="2">
//                     <style>
//                         body { 
//                             font-family: Arial; 
//                             text-align: center; 
//                             padding: 50px;
//                             background: #f5f5f5;
//                         }
//                         .loader { 
//                             border: 8px solid #f3f3f3; 
//                             border-top: 8px solid #25D366; 
//                             border-radius: 50%; 
//                             width: 60px; 
//                             height: 60px; 
//                             animation: spin 1s linear infinite; 
//                             margin: 20px auto; 
//                         }
//                         @keyframes spin { 
//                             0% { transform: rotate(0deg); } 
//                             100% { transform: rotate(360deg); } 
//                         }
//                     </style>
//                 </head>
//                 <body>
//                     <h2>⏳ Initializing WhatsApp...</h2>
//                     <div class="loader"></div>
//                     <p>Please wait... Page will refresh automatically</p>
//                 </body>
//                 </html>
//             `);
//         }

//         // Generate QR code as image
//         const qrImage = await qrcode.toDataURL(qr);
        
//         res.send(`
//             <!DOCTYPE html>
//             <html>
//             <head>
//                 <title>Scan WhatsApp QR Code</title>
//                 <style>
//                     body {
//                         font-family: Arial, sans-serif;
//                         display: flex;
//                         justify-content: center;
//                         align-items: center;
//                         min-height: 100vh;
//                         margin: 0;
//                         background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
//                     }
//                     .container {
//                         background: white;
//                         padding: 40px;
//                         border-radius: 20px;
//                         box-shadow: 0 10px 40px rgba(0,0,0,0.2);
//                         text-align: center;
//                         max-width: 500px;
//                     }
//                     h1 {
//                         color: #128C7E;
//                         margin-bottom: 20px;
//                     }
//                     .qr-code {
//                         margin: 30px 0;
//                         padding: 20px;
//                         background: #f5f5f5;
//                         border-radius: 10px;
//                     }
//                     .qr-code img {
//                         max-width: 300px;
//                         height: auto;
//                     }
//                     .instructions {
//                         text-align: left;
//                         margin: 20px 0;
//                         color: #666;
//                     }
//                     .instructions ol {
//                         padding-left: 20px;
//                     }
//                     .instructions li {
//                         margin: 10px 0;
//                     }
//                     .refresh-btn {
//                         background: #25D366;
//                         color: white;
//                         border: none;
//                         padding: 12px 30px;
//                         border-radius: 25px;
//                         cursor: pointer;
//                         font-size: 16px;
//                         margin-top: 20px;
//                     }
//                     .refresh-btn:hover {
//                         background: #128C7E;
//                     }
//                 </style>
//                 <script>
//                     // Auto refresh every 30 seconds
//                     setTimeout(() => location.reload(), 30000);
//                 </script>
//             </head>
//             <body>
//                 <div class="container">
//                     <h1>📱 Scan WhatsApp QR Code</h1>
                    
//                     <div class="qr-code">
//                         <img src="${qrImage}" alt="WhatsApp QR Code">
//                     </div>
                    
//                     <div class="instructions">
//                         <h3>How to connect:</h3>
//                         <ol>
//                             <li>Open <strong>WhatsApp</strong> on your phone</li>
//                             <li>Go to <strong>Settings → Linked Devices</strong></li>
//                             <li>Tap <strong>Link a Device</strong></li>
//                             <li>Scan this QR code</li>
//                         </ol>
//                     </div>
                    
//                     <button class="refresh-btn" onclick="location.reload()">🔄 Refresh QR Code</button>
//                 </div>
//             </body>
//             </html>
//         `);
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// });

// // Get connection status
// router.get('/status', (req, res) => {
//     const isConnected = whatsappService.getConnectionStatus();
//     res.json({ 
//         success: true, 
//         connected: isConnected,
//         message: isConnected ? 'WhatsApp is connected' : 'WhatsApp is not connected',
//         receivedMessagesCount: receivedMessages.length
//     });
// });

// // Send single message
// router.post('/send', async (req, res) => {
//     try {
//         const { phone, message } = req.body;
        
//         console.log('Received request to send message:', { phone, message });
        
//         if (!phone || !message) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'Phone and message are required' 
//             });
//         }

//         // Format phone number
//         let recipient = phone.replace(/[^0-9]/g, ''); // Remove non-numeric
        
//         // Add country code if not present
//         if (!recipient.startsWith('91') && recipient.length === 10) {
//             recipient = '91' + recipient; // Add India code
//         }
        
//         recipient = `${recipient}@s.whatsapp.net`;

//         const result = await whatsappService.sendMessage(recipient, { text: message });
        
//         res.json(result);
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // Send image
// router.post('/send-image', async (req, res) => {
//     try {
//         const { phone, imagePath, caption } = req.body;
        
//         if (!phone || !imagePath) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'Phone and imagePath are required' 
//             });
//         }

//         let recipient = phone.replace(/[^0-9]/g, '');
//         if (!recipient.startsWith('91') && recipient.length === 10) {
//             recipient = '91' + recipient;
//         }
//         recipient = `${recipient}@s.whatsapp.net`;

//         const result = await whatsappService.sendImage(recipient, imagePath, caption);
//         res.json(result);
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // Send bulk messages
// router.post('/send-bulk', async (req, res) => {
//     try {
//         const { phones, message, delay } = req.body;
        
//         if (!phones || !Array.isArray(phones) || !message) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'Phones (array) and message are required' 
//             });
//         }

//         // Format phone numbers
//         const recipients = phones.map(phone => {
//             let num = phone.replace(/[^0-9]/g, '');
//             if (!num.startsWith('91') && num.length === 10) {
//                 num = '91' + num;
//             }
//             return `${num}@s.whatsapp.net`;
//         });

//         const results = await whatsappService.sendBulkMessage(recipients, message, delay || 3000);
        
//         res.json({ 
//             success: true, 
//             results,
//             summary: {
//                 total: results.length,
//                 sent: results.filter(r => r.status === 'sent').length,
//                 failed: results.filter(r => r.status === 'failed').length
//             }
//         });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// // Disconnect WhatsApp
// router.post('/disconnect', async (req, res) => {
//     try {
//         await whatsappService.disconnect();
//         res.json({ success: true, message: 'WhatsApp disconnected' });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// module.exports = router;