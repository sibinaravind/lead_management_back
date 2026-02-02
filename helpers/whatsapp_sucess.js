


const VERIFY_TOKEN = 'sibin_webhook_secret_123';  // "2177092386053668"
const APP_SECRET = '9a1fb39b49e523baf3532fde848113ff';
const PHONE_NUMBER_ID= "1007480929108644";  
const WABA_ID = "2352673638530036";
const ACCESS_TOKEN = 'EAARfQyz8MTYBQmqR1QONtHhREomIT45Ris5C6B5ZASBGuwix8g6nYzQgueitFy6FNWNAG9vH8hdMGVKYkJ22mzeSZBJziBZBEywQKLwsAavHxnV439lxyLx15PZC2NZBMDkviYI2kJY6Os2iy42X7YyV0gfwjNOJ3ZBVghZB0493IBikv7xZC1RbBl5LwJMsuwZDZD';
// const ACCESS_TOKEN ="EAARfQyz8MTYBQkGDlVGSj3XSt6HBYrl2ytZCWWL2hsFl3c9ORZA2eoYYrrGsRhFEkMauzIXKP3UpYX42Jq5Hr8gRZCFGflFLrLAR5xUiFwGG2Kd8vHoIrls3bZBllZAqZCgeAhJ3StyozUEg6gD1cZCDwIMOytXtZCzYuOa1EjPajjVNKVoU3d80ZAduncHba93h1aVSS9xOboNZB7GWSahHZApoYtoHdaiAOqCrFYPLlwrSBZBu9RvbF8RKYCRfhpubXYD6XJWxL48ZAZBhbQWZAQAwl3S"




// WhatsApp Business API - Receive Messages in Node.js (Updated)
const express = require('express');
const crypto = require('crypto');
const app = express();
const FormData = require('form-data');
const fs = require('fs');
const { replyHandler, WhatsAppReplyHandler } = require('../utils/whatsapp_reply_handler');

const customReplyHandler = new WhatsAppReplyHandler({
    companyName: 'Alead Solutions',
    supportEmail: 'support@aleadsolutions.com',
    supportPhone: '+91 830 103 1955',
    businessHours: 'Mon-Fri, 9 AM - 6 PM IST',
    websiteUrl: 'www.aleadsolutions.com'
});

// Register custom handlers if needed
customReplyHandler.registerHandler('special_offer', /offer|discount|promo/i, async (message, context) => {
    return {
        text: `🎉 *Special Offers!*\n\n` +
            `Check out our current promotions:\n\n` +
            `• 20% off on premium packages\n` +
            `• Buy 2 Get 1 Free on selected items\n` +
            `• First-time customer discount\n\n` +
            `Type *contact* to claim your offer!`,
        type: 'text'
    };
});

// =============================================================================
// WEBHOOK VERIFICATION (Required by WhatsApp)
// =============================================================================
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Webhook verification request received');
    console.log('Mode:', mode);
    console.log('Token:', token);

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.status(403).send('Forbidden');
    }
});

// =============================================================================
// WEBHOOK TO RECEIVE MESSAGES
// =============================================================================
app.post('/webhook', (req, res) => {
    const body = req.body;
    console.log('📨 Incoming webhook:', JSON.stringify(body, null, 2));

    // Verify the webhook signature (recommended for security)
    if (!verifyWebhookSignature(req, body)) {
        console.log('❌ Invalid webhook signature');
        return res.status(401).send('Unauthorized');
    }

    // Process WhatsApp webhook
    if (body.object === 'whatsapp_business_account') {
        body.entry?.forEach(entry => {
            entry.changes?.forEach(change => {
                if (change.field === 'messages') {
                    processIncomingMessage(change.value);
                }
            });
        });

        res.status(200).send('OK');
    } else {
        res.status(404).send('Not Found');
    }
});

// Send a WhatsApp text message via HTTP POST
app.post('/send-message', async (req, res) => {
    const { to, text } = req.body;
    if (!to || !text) {
        return res.status(400).json({ error: 'Missing "to" or "text" in request body' });
    }
    try {
        await sendTextMessage(PHONE_NUMBER_ID, to, text);
        res.status(200).json({ message: 'Message sent successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.post('/send-template', async (req, res) => {
    const { to, text } = req.body;
    if (!to || !text) {
        return res.status(400).json({ error: 'Missing "to" or "text" in request body' });
    }
    try {
        await sendTextTemplate(PHONE_NUMBER_ID, to, text);
        res.status(200).json({ message: 'Message sent successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.post('/create-template', async (req, res) => {
    const { title, text, templateName } = req.body;
    if (!title || !text || !templateName) {
        return res.status(400).json({ error: 'Missing "title", "text", or "templateName" in request body' });
    }
    try {
        await createTemplate(req.body);
        res.status(200).json({ message: 'Template created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create template' });
    }
});

app.get('/list-templates', async (req, res) => {
    try {
        var templates = await listTemplates();
        res.status(200).json({ message: 'Templates listed successfully', templates });
    } catch (error) {
        res.status(500).json({ error: 'Failed to list templates' });
    }
});

app.delete('/delete-templates', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Missing "name" in request body' });
    }
    try {
        await deleteTemplate(name);
        res.status(200).json({ message: 'Template deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

// =============================================================================
// MESSAGE PROCESSING FUNCTIONS
// =============================================================================
function processIncomingMessage(value) {
    console.log('📱 Processing WhatsApp message:', JSON.stringify(value, null, 2));

    // Handle incoming messages
    if (value.messages) {
        value.messages.forEach(message => {
            handleIncomingMessage(message, value.metadata);
        });
    }

    // Handle message status updates (delivered, read, etc.)
    if (value.statuses) {
        value.statuses.forEach(status => {
            handleMessageStatus(status);
        });
    }
}

async function handleIncomingMessage(message, metadata) {
    const phoneNumberId = metadata.phone_number_id;
    const fromNumber = message.from;
    const messageId = message.id;
    const timestamp = message.timestamp;

    console.log(`📞 Message from: ${fromNumber}`);
    console.log(`📋 Message ID: ${messageId}`);
    console.log(`⏰ Timestamp: ${new Date(timestamp * 1000).toISOString()}`);

    // Handle different message types
    switch (message.type) {
        case 'text':
            await handleTextMessage(message, phoneNumberId, fromNumber);
            break;

        case 'image':
            await handleImageMessage(message, phoneNumberId, fromNumber);
            break;

        case 'document':
            await handleDocumentMessage(message, phoneNumberId, fromNumber);
            break;

        case 'audio':
            await handleAudioMessage(message, phoneNumberId, fromNumber);
            break;

        case 'video':
            await handleVideoMessage(message, phoneNumberId, fromNumber);
            break;

        case 'location':
            await handleLocationMessage(message, phoneNumberId, fromNumber);
            break;

        case 'contacts':
            await handleContactMessage(message, phoneNumberId, fromNumber);
            break;

        case 'interactive':
            await handleInteractiveMessage(message, phoneNumberId, fromNumber);
            break;

        default:
            console.log(`❓ Unknown message type: ${message.type}`);
    }
}

// =============================================================================
// MESSAGE TYPE HANDLERS (Using Reply Utility)
// =============================================================================
async function handleTextMessage(message, phoneNumberId, fromNumber) {
    const text = message.text.body;
    console.log(`💬 Text message: "${text}"`);

    // Use the reply handler to process the message
    const context = {
        phoneNumberId,
        fromNumber,
        messageId: message.id
    };

    const reply = await customReplyHandler.processMessage(text, context);

    if (reply && reply.text) {
        await sendTextMessage(phoneNumberId, fromNumber, reply.text);
    }
}

async function handleImageMessage(message, phoneNumberId, fromNumber) {
    const image = message.image;
    console.log(`🖼️ Image received:`);
    console.log(`- ID: ${image.id}`);
    console.log(`- MIME type: ${image.mime_type}`);
    console.log(`- Caption: ${image.caption || 'No caption'}`);

    // Download the image if needed
    downloadMedia(image.id, image.mime_type);

    // Use reply handler for media
    const reply = customReplyHandler.handleImageMessage(image, { phoneNumberId, fromNumber });
    await sendTextMessage(phoneNumberId, fromNumber, reply.text);
}

async function handleDocumentMessage(message, phoneNumberId, fromNumber) {
    const document = message.document;
    console.log(`📄 Document received:`);
    console.log(`- ID: ${document.id}`);
    console.log(`- Filename: ${document.filename}`);
    console.log(`- MIME type: ${document.mime_type}`);

    const reply = customReplyHandler.handleDocumentMessage(document, { phoneNumberId, fromNumber });
    await sendTextMessage(phoneNumberId, fromNumber, reply.text);
}

async function handleAudioMessage(message, phoneNumberId, fromNumber) {
    const audio = message.audio;
    console.log(`🎵 Audio received: ${audio.id}`);

    const reply = customReplyHandler.handleAudioMessage(audio, { phoneNumberId, fromNumber });
    await sendTextMessage(phoneNumberId, fromNumber, reply.text);
}

async function handleVideoMessage(message, phoneNumberId, fromNumber) {
    const video = message.video;
    console.log(`🎥 Video received: ${video.id}`);

    const reply = customReplyHandler.handleVideoMessage(video, { phoneNumberId, fromNumber });
    await sendTextMessage(phoneNumberId, fromNumber, reply.text);
}

async function handleLocationMessage(message, phoneNumberId, fromNumber) {
    const location = message.location;
    console.log(`📍 Location received:`);
    console.log(`- Latitude: ${location.latitude}`);
    console.log(`- Longitude: ${location.longitude}`);
    console.log(`- Name: ${location.name || 'Unknown'}`);
    console.log(`- Address: ${location.address || 'No address'}`);

    await sendTextMessage(phoneNumberId, fromNumber, 'Location received! 📍\n\nType *menu* if you need assistance.');
}

async function handleContactMessage(message, phoneNumberId, fromNumber) {
    const contacts = message.contacts;
    console.log(`👤 Contact(s) received: ${contacts.length}`);

    contacts.forEach(contact => {
        console.log(`- Name: ${contact.name.formatted_name}`);
        console.log(`- Phone: ${contact.phones?.[0]?.phone || 'No phone'}`);
    });

    await sendTextMessage(phoneNumberId, fromNumber, 'Contact information received! 👤\n\nType *menu* for options.');
}

async function handleInteractiveMessage(message, phoneNumberId, fromNumber) {
    const interactive = message.interactive;
    console.log(`🔘 Interactive message:`);
    console.log(`- Type: ${interactive.type}`);

    if (interactive.type === 'button_reply') {
        console.log(`- Button ID: ${interactive.button_reply.id}`);
        console.log(`- Button Title: ${interactive.button_reply.title}`);
    } else if (interactive.type === 'list_reply') {
        console.log(`- List ID: ${interactive.list_reply.id}`);
        console.log(`- List Title: ${interactive.list_reply.title}`);
    }

    await sendTextMessage(phoneNumberId, fromNumber, 'Button/List selection received! ✅\n\nType *menu* for more options.');
}

function handleMessageStatus(status) {
    console.log(`📊 Message status update:`);
    console.log(`- Message ID: ${status.id}`);
    console.log(`- Status: ${status.status}`);
    console.log(`- Timestamp: ${new Date(status.timestamp * 1000).toISOString()}`);
    console.log(`- Recipient: ${status.recipient_id}`);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
function verifyWebhookSignature(req, body) {
    const signature = req.headers['x-hub-signature-256'];

    if (!signature) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac('sha256', APP_SECRET)
        .update(JSON.stringify(body))
        .digest('hex');

    const receivedSignature = signature.replace('sha256=', '');

    return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(receivedSignature, 'hex')
    );
}

async function downloadMedia(mediaId, mimeType) {
    try {
        const response = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });

        const mediaData = await response.json();
        console.log('📥 Media download URL:', mediaData.url);

        // Download the actual file
        const fileResponse = await fetch(mediaData.url, {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });

        const fileBuffer = await fileResponse.buffer();
        console.log(`📁 File downloaded: ${fileBuffer.length} bytes`);

        // Save to file system or cloud storage as needed
        // fs.writeFileSync(`./downloads/${mediaId}`, fileBuffer);

    } catch (error) {
        console.error('❌ Error downloading media:', error);
    }
}

async function sendTextMessage(phoneNumberId, to, text) {
    try {
        const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: {
                    body: text
                }
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('❌ Error sending message:', result.error);
            return { success: false, error: result.error };
        }

        console.log('✅ Message sent:', result);
        return { success: true, data: result };
    } catch (error) {
        console.error('❌ Network error:', error);
        throw error;
    }
}

async function createTemplate(templateData) {
    const url = `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`;

    const components = [];

    // Add HEADER (image OR text)
    if (templateData.isImage && templateData.title) {
        components.push({
            type: "HEADER",
            format: "IMAGE",
            example: {
                // Provide a valid sample media ID (not a URL)
                header_handle: [ templateData.title || "YOUR_SAMPLE_IMAGE_MEDIA_ID" ]
            }
        });
    } else if (templateData.title && !templateData.isImage) {
        components.push({
            type: "HEADER",
            format: "TEXT",
            text: templateData.title
        });
    }

    // Add BODY (required)
    const bodyComponent = {
        type: "BODY",
        text: templateData.text
    };

    components.push(bodyComponent);

    // Add FOOTER (optional)
    if (templateData.footer) {
        components.push({
            type: "FOOTER",
            text: templateData.footer
        });
    }

    const data = {
        name: templateData.templateName,
        language: "en_US",
        category: "UTILITY",
        components: components
    };

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (!res.ok) {
            console.error("❌ Error:", result.error);
            return { success: false, error: result.error };
        }

        console.log("✅ Template created:", result);
        return { success: true, data: result };
    } catch (error) {
        console.error("❌ Error:", error);
        return { success: false, error };
    }
}

async function listTemplates() {
    const url = `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`;

    try {
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`
            }
        });

        const result = await res.json();

        console.log("📋 Your templates:");
        result.data.forEach(template => {
            console.log(`- ${template.name} (${template.status})`);
        });

        return result.data;
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

async function deleteTemplate(templateName) {
    const url = `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`;

    const params = new URLSearchParams({
        name: templateName
    });

    try {
        const res = await fetch(`${url}?${params}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`
            }
        });

        const result = await res.json();

        if (!res.ok) {
            console.error("❌ Error deleting template:", result.error);
            return { success: false, error: result.error };
        }

        console.log("✅ Template deleted:", result);
        return { success: true, data: result };
    } catch (error) {
        console.error("❌ Network error:", error);
        return { success: false, error };
    }
}

module.exports = app;







// const VERIFY_TOKEN = 'sibin_webhook_secret_123';  // "2177092386053668"
// const APP_SECRET = '9a1fb39b49e523baf3532fde848113ff';
// const PHONE_NUMBER_ID= "1007480929108644";  
// const WABA_ID = "2352673638530036";
// const ACCESS_TOKEN = 'EAARfQyz8MTYBQmqR1QONtHhREomIT45Ris5C6B5ZASBGuwix8g6nYzQgueitFy6FNWNAG9vH8hdMGVKYkJ22mzeSZBJziBZBEywQKLwsAavHxnV439lxyLx15PZC2NZBMDkviYI2kJY6Os2iy42X7YyV0gfwjNOJ3ZBVghZB0493IBikv7xZC1RbBl5LwJMsuwZDZD';
// // const ACCESS_TOKEN ="EAARfQyz8MTYBQkGDlVGSj3XSt6HBYrl2ytZCWWL2hsFl3c9ORZA2eoYYrrGsRhFEkMauzIXKP3UpYX42Jq5Hr8gRZCFGflFLrLAR5xUiFwGG2Kd8vHoIrls3bZBllZAqZCgeAhJ3StyozUEg6gD1cZCDwIMOytXtZCzYuOa1EjPajjVNKVoU3d80ZAduncHba93h1aVSS9xOboNZB7GWSahHZApoYtoHdaiAOqCrFYPLlwrSBZBu9RvbF8RKYCRfhpubXYD6XJWxL48ZAZBhbQWZAQAwl3S"

// // WhatsApp Business API - Receive Messages in Node.js
// const express = require('express');
// const crypto = require('crypto');
// const { link } = require('fs');
// const app = express();
// const FormData = require('form-data');
// const fs = require('fs');
// const { title } = require('process');

// // Configuration

// // =============================================================================
// // WEBHOOK VERIFICATION (Required by WhatsApp)
// // =============================================================================
// app.get('/webhook', (req, res) => {
//   const mode = req.query['hub.mode'];
//   const token = req.query['hub.verify_token'];
//   const challenge = req.query['hub.challenge'];

//   console.log('Webhook verification request received');
//   console.log('Mode:', mode);
//   console.log('Token:', token);

//   if (mode === 'subscribe' && token === VERIFY_TOKEN) {
//     console.log('✅ Webhook verified successfully!');
//     res.status(200).send(challenge);
//   } else {
//     console.log('❌ Webhook verification failed');
//     res.status(403).send('Forbidden');
//   }
// });


// // =============================================================================
// // WEBHOOK TO RECEIVE MESSAGES
// // =============================================================================
// app.post('/webhook', (req, res) => {
//   const body = req.body;
//   console.log('📨 Incoming webhook:', JSON.stringify(body, null, 2));
//   // Verify the webhook signature (recommended for security)
//   if (!verifyWebhookSignature(req, body)) {
//     console.log('❌ Invalid webhook signature');
//     return res.status(401).send('Unauthorized');
//   }

//   // Process WhatsApp webhook
//   if (body.object === 'whatsapp_business_account') {
//     body.entry?.forEach(entry => {
//       entry.changes?.forEach(change => {
//         if (change.field === 'messages') {
//           processIncomingMessage(change.value);
//         }
//       });
//     });

//     res.status(200).send('OK');
//   } else {
//     res.status(404).send('Not Found');
//   }
// });


// // Send a WhatsApp text message via HTTP POST
// app.post('/send-message', async (req, res) => {
//   const { to, text } = req.body;
//   if (!to || !text) {
//     return res.status(400).json({ error: 'Missing "to" or "text" in request body' });
//   }
//   try {
//     await sendTextMessage(PHONE_NUMBER_ID, to, text);
//     res.status(200).json({ message: 'Message sent successfully' });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to send message' });
//   }
// });

// app.post('/send-template', async (req, res) => {
//   const { to, text } = req.body;
//   if (!to || !text) {
//     return res.status(400).json({ error: 'Missing "to" or "text" in request body' });
//   }
//   try {
//     await sendTextTemplate(PHONE_NUMBER_ID, to, text);
//     res.status(200).json({ message: 'Message sent successfully' });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to send message' });
//   }
// });

// app.post('/create-template', async (req, res) => {
//   const { title, text , templateName } = req.body;
//   if (!title || !text || !templateName ) {
//     return res.status(400).json({ error: 'Missing "title", "text", or "templateName" in request body' });
//   }
//   try {
//     await createTemplate(req.body);
//     res.status(200).json({ message: 'Template created successfully' });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to create template' });
//   }
// });

// app.get('/list-templates', async (req, res) => {
//   try {
//    var templates = await listTemplates();
//     res.status(200).json({ message: 'Templates listed successfully', templates });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to list templates' });
//   }
// });

// app.delete('/delete-templates', async (req, res) => {
//    const { name } = req.body;
//   if (!name) {
//     return res.status(400).json({ error: 'Missing "name" in request body' });
//   }
//   try {
//     await deleteTemplate(name);
//     res.status(200).json({ message: 'Template deleted successfully' });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to delete template' });
//   }
// });


// // =============================================================================
// // MESSAGE PROCESSING FUNCTIONS
// // =============================================================================
// function processIncomingMessage(value) {
//   console.log('📱 Processing WhatsApp message:', JSON.stringify(value, null, 2));

//   // Handle incoming messages
//   if (value.messages) {
//     value.messages.forEach(message => {
//       handleIncomingMessage(message, value.metadata);
//     });
//   }

//   // Handle message status updates (delivered, read, etc.)
//   if (value.statuses) {
//     value.statuses.forEach(status => {
//       handleMessageStatus(status);
//     });
//   }
// }

// function handleIncomingMessage(message, metadata) {
//   const phoneNumberId = metadata.phone_number_id;
//   const fromNumber = message.from;
//   const messageId = message.id;
//   const timestamp = message.timestamp;

//   console.log(`📞 Message from: ${fromNumber}`);
//   console.log(`📋 Message ID: ${messageId}`);
//   console.log(`⏰ Timestamp: ${new Date(timestamp * 1000).toISOString()}`);

//   // Handle different message types
//   switch (message.type) {
//     case 'text':
//       handleTextMessage(message, phoneNumberId, fromNumber);
//       break;
    
//     case 'image':
//       handleImageMessage(message, phoneNumberId, fromNumber);
//       break;
    
//     case 'document':
//       handleDocumentMessage(message, phoneNumberId, fromNumber);
//       break;
    
//     case 'audio':
//       handleAudioMessage(message, phoneNumberId, fromNumber);
//       break;
    
//     case 'video':
//       handleVideoMessage(message, phoneNumberId, fromNumber);
//       break;
    
//     case 'location':
//       handleLocationMessage(message, phoneNumberId, fromNumber);
//       break;
    
//     case 'contacts':
//       handleContactMessage(message, phoneNumberId, fromNumber);
//       break;
    
//     case 'interactive':
//       handleInteractiveMessage(message, phoneNumberId, fromNumber);
//       break;
    
//     default:
//       console.log(`❓ Unknown message type: ${message.type}`);
//   }
// }

// // =============================================================================
// // MESSAGE TYPE HANDLERS
// // =============================================================================
// function handleTextMessage(message, phoneNumberId, fromNumber) {
//   const text = message.text.body;
//   console.log(`💬 Text message: "${text}"`);
  
//   // Example: Echo the message back
//   sendTextMessage(phoneNumberId, fromNumber, `You said: ${text}`);
  
//   // Example: Handle specific commands
//   if (text.toLowerCase().includes('hello')) {
//     sendTextMessage(phoneNumberId, fromNumber, 'Hello! How can I help you today?');
//   } else if (text.toLowerCase().includes('help')) {
//     sendHelpMessage(phoneNumberId, fromNumber);
//   }
// }

// function handleImageMessage(message, phoneNumberId, fromNumber) {
//   const image = message.image;
//   console.log(`🖼️ Image received:`);
//   console.log(`- ID: ${image.id}`);
//   console.log(`- MIME type: ${image.mime_type}`);
//   console.log(`- Caption: ${image.caption || 'No caption'}`);
  
//   // Download the image if needed
//   downloadMedia(image.id, image.mime_type);
  
//   sendTextMessage(phoneNumberId, fromNumber, 'Thanks for the image! 📸');
// }

// function handleDocumentMessage(message, phoneNumberId, fromNumber) {
//   const document = message.document;
//   console.log(`📄 Document received:`);
//   console.log(`- ID: ${document.id}`);
//   console.log(`- Filename: ${document.filename}`);
//   console.log(`- MIME type: ${document.mime_type}`);
  
//   sendTextMessage(phoneNumberId, fromNumber, `Document "${document.filename}" received! 📎`);
// }

// function handleAudioMessage(message, phoneNumberId, fromNumber) {
//   const audio = message.audio;
//   console.log(`🎵 Audio received: ${audio.id}`);
  
//   sendTextMessage(phoneNumberId, fromNumber, 'Voice message received! 🎤');
// }

// function handleVideoMessage(message, phoneNumberId, fromNumber) {
//   const video = message.video;
//   console.log(`🎥 Video received: ${video.id}`);
  
//   sendTextMessage(phoneNumberId, fromNumber, 'Video received! 🎬');
// }

// function handleLocationMessage(message, phoneNumberId, fromNumber) {
//   const location = message.location;
//   console.log(`📍 Location received:`);
//   console.log(`- Latitude: ${location.latitude}`);
//   console.log(`- Longitude: ${location.longitude}`);
//   console.log(`- Name: ${location.name || 'Unknown'}`);
//   console.log(`- Address: ${location.address || 'No address'}`);
  
//   sendTextMessage(phoneNumberId, fromNumber, 'Location received! 📍');
// }

// function handleContactMessage(message, phoneNumberId, fromNumber) {
//   const contacts = message.contacts;
//   console.log(`👤 Contact(s) received: ${contacts.length}`);
  
//   contacts.forEach(contact => {
//     console.log(`- Name: ${contact.name.formatted_name}`);
//     console.log(`- Phone: ${contact.phones?.[0]?.phone || 'No phone'}`);
//   });
  
//   sendTextMessage(phoneNumberId, fromNumber, 'Contact information received! 👤');
// }

// function handleInteractiveMessage(message, phoneNumberId, fromNumber) {
//   const interactive = message.interactive;
//   console.log(`🔘 Interactive message:`);
//   console.log(`- Type: ${interactive.type}`);
  
//   if (interactive.type === 'button_reply') {
//     console.log(`- Button ID: ${interactive.button_reply.id}`);
//     console.log(`- Button Title: ${interactive.button_reply.title}`);
//   } else if (interactive.type === 'list_reply') {
//     console.log(`- List ID: ${interactive.list_reply.id}`);
//     console.log(`- List Title: ${interactive.list_reply.title}`);
//   }
  
//   sendTextMessage(phoneNumberId, fromNumber, 'Button/List selection received! ✅');
// }

// function handleMessageStatus(status) {
//   console.log(`📊 Message status update:`);
//   console.log(`- Message ID: ${status.id}`);
//   console.log(`- Status: ${status.status}`);
//   console.log(`- Timestamp: ${new Date(status.timestamp * 1000).toISOString()}`);
//   console.log(`- Recipient: ${status.recipient_id}`);
// }

// // =============================================================================
// // HELPER FUNCTIONS
// // =============================================================================
// function verifyWebhookSignature(req, body) {
//   const signature = req.headers['x-hub-signature-256'];
  
//   if (!signature) {
//     return false;
//   }

//   const expectedSignature = crypto
//     .createHmac('sha256', APP_SECRET)
//     .update(JSON.stringify(body))
//     .digest('hex');

//   const receivedSignature = signature.replace('sha256=', '');
  
//   return crypto.timingSafeEqual(
//     Buffer.from(expectedSignature, 'hex'),
//     Buffer.from(receivedSignature, 'hex')
//   );
// }

// async function downloadMedia(mediaId, mimeType) {
//   try {
//     const response = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
//       headers: {
//         'Authorization': `Bearer ${ACCESS_TOKEN}`
//       }
//     });
    
//     const mediaData = await response.json();
//     console.log('📥 Media download URL:', mediaData.url);
    
//     // Download the actual file
//     const fileResponse = await fetch(mediaData.url, {
//       headers: {
//         'Authorization': `Bearer ${ACCESS_TOKEN}`
//       }
//     });
    
//     const fileBuffer = await fileResponse.buffer();
//     console.log(`📁 File downloaded: ${fileBuffer.length} bytes`);
    
//     // Save to file system or cloud storage as needed
//     // fs.writeFileSync(`./downloads/${mediaId}`, fileBuffer);
    
//   } catch (error) {
//     console.error('❌ Error downloading media:', error);
//   }
// }



// async function sendTextMessage(phoneNumberId, to, text) {
//   try {
//     const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${ACCESS_TOKEN}`,
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({
//         messaging_product: 'whatsapp',
//         recipient_type: 'individual',
//         to: to,
//         type: 'text',
//         text: {
//           // preview_url: false,  // Add this if you're not using links
//           body: text
//         }
//       })
//     });

//     const result = await response.json();
    
//     if (!response.ok) {
//       console.error('❌ Error sending message:', result.error);
//       return { success: false, error: result.error };
//     }

//     console.log('✅ Message sent:', result);
//     return { success: true, data: result };
//   } catch (error) {
//     console.error('❌ Network error:', error);
//     throw new error( error.message );;
//   }
// }

// async function createTemplate(templateData) {
//   const url = `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`;

//   const components = [];

//   // Add HEADER (image OR text)
//   if (templateData.isImage && templateData.title) {
//     // Image header - MUST include example
//     components.push({
//       type: "HEADER",
//       format: "IMAGE",
//       example: {
//         header_handle: [templateData.title] // Example image URL
//       }
//     });
//   } else if (templateData.title && !templateData.isImage) {
//     // Text header
//     components.push({
//       type: "HEADER",
//       format: "TEXT",
//       text: templateData.title
//     });
//   }

//   // Add BODY (required)
//   const bodyComponent = {
//     type: "BODY",
//     text: templateData.text
//   };

//   // // CRITICAL: Add example values for ALL variables
//   // const variableCount = (templateData.text.match(/\{\{\d+\}\}/g) || []).length;
//   // if (variableCount > 0) {
//   //   bodyComponent.example = {
//   //     body_text: [
//   //       ["John Doe", "ORD12345"] // ✅ Example values for {{1}} and {{2}}
//   //     ]
//   //   };
//   // }

//   components.push(bodyComponent);

//   // Add FOOTER (optional)
//   if (templateData.footer) {
//     components.push({
//       type: "FOOTER",
//       text: templateData.footer
//     });
//   }

//   const data = {
//     name: templateData.templateName,
//     language: "en_US",
//     category: "UTILITY",
//     components: components
//   };

//   try {
//     const res = await fetch(url, {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${ACCESS_TOKEN}`,
//         "Content-Type": "application/json"
//       },
//       body: JSON.stringify(data)
//     });

//     const result = await res.json();

//     if (!res.ok) {
//       console.error("❌ Error:", result.error);
//       return { success: false, error: result.error };
//     }

//     console.log("✅ Template created:", result);
//     return { success: true, data: result };
//   } catch (error) {
//     console.error("❌ Error:", error);
//     return { success: false, error };
//   }
// }


// async function listTemplates() {
//   const url = `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`;

//   try {
//     const res = await fetch(url, {
//       headers: {
//         Authorization: `Bearer ${ACCESS_TOKEN}`
//       }
//     });

//     const result = await res.json();
    
//     console.log("📋 Your templates:");
//     result.data.forEach(template => {
//       console.log(`- ${template.name} (${template.status})`);
//     });
    
//     return result.data;
//   } catch (error) {
//     console.error("❌ Error:", error);
//   }
// }

// async function deleteTemplate(templateName) {
//   const url = `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`;

//   const params = new URLSearchParams({
//     name: templateName
//   });

//   try {
//     const res = await fetch(`${url}?${params}`, {
//       method: "DELETE",
//       headers: {
//         Authorization: `Bearer ${ACCESS_TOKEN}`
//       }
//     });

//     const result = await res.json();

//     if (!res.ok) {
//       console.error("❌ Error deleting template:", result.error);
//       return { success: false, error: result.error };
//     }

//     console.log("✅ Template deleted:", result);
//     return { success: true, data: result };
//   } catch (error) {
//     console.error("❌ Network error:", error);
//     return { success: false, error };
//   }
// }



// async function sendHelpMessage(phoneNumberId, fromNumber) {
//   const helpText = `🤖 Available Commands:
  
// • Send "hello" - Get a greeting
// • Send "help" - Show this help message  
// • Send any image - I'll acknowledge it
// • Send any document - I'll tell you I received it
// • Send your location - I'll confirm I got it

// What would you like to do?`;

//   await sendTextMessage(phoneNumberId, fromNumber, helpText);
// }

// module.exports = app;



