// //@@@@@ lead form form @@@@@


// const express = require('express');
// const axios = require('axios');

// const app = express();
// const port = 3000;

// // === CONFIGURATION ===
// const ACCESS_TOKEN = '';
// const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

// const PAGE_ID = '100464991488860'; // 🔁 Replace with your Page ID

// async function fetchLeadForms(pageId) {
//   const res = await axios.get(`${GRAPH_API_BASE}/${pageId}/leadgen_forms`, {
//     params: { access_token: ACCESS_TOKEN },
//   });
//   return res.data.data;
// }

// async function fetchLeads(formId) {
//   const res = await axios.get(`${GRAPH_API_BASE}/${formId}/leads`, {
//     params: { access_token: ACCESS_TOKEN },
//   });
//   return res.data.data;
// }

// // === MAIN ENDPOINT ===
// app.get('/', async (req, res) => {
//   try {
//     const results = [];

//     const pageData = {
//       pageId: PAGE_ID,
//       pageName: 'My Page', // Optional static label
//       forms: [],
//     };

//     const forms = await fetchLeadForms(PAGE_ID);

//     for (const form of forms) {
//       const leads = await fetchLeads(form.id);
//       pageData.forms.push({
//         formId: form.id,
//         formName: form.name,
//         leads,
//       });
//     }

//     results.push(pageData);

//     // return JSON to browser
//     res.json({ success: true, data: results });
//   } catch (error) {
//     console.error('❌ Error:', error.response?.data || error.message);
//     res.status(500).json({
//       success: false,
//       error: error.response?.data || error.message,
//     });
//   }
// });

// app.listen(port, () => {
//   console.log(`🚀 Server running at http://localhost:${port}`);
// });



// @@@@@@@@@@@@@ whtaspp success @@@@@@@@@@@?\÷



// const express = require('express');
// const crypto = require('crypto');
// const app = express();

// // Configuration
// const VERIFY_TOKEN = 'your_verify_token_here';  // "2177092386053668"
// const APP_SECRET = 'your_app_secret_here';
// const PHONE_NUMBER_ID= "623688297501791";  
// const ACCESS_TOKEN = 'EAAZAZCDFS5ZC2sBOyYtCJNTZA4H9MRJPNfWriYFrHWOy2HtP1XWTrX1da2B5os2uRdupZCOiIYt4QrPPWMVeVMrS3mXJPfvORJ5ZAzW5ZBZC5M1YmPCQpahOc3QdPYF9ZBmE0ZBoZBZCMbeXkYf5WI9lMOAesXnNBJZAHRU02WrFwlwDdRr0fqtfZCKprrPyU2TlB4JjZCnjiGeAM9I8FUhemHlOfxyYgujIF4G49X5pfDaZCxyhAgZDZD';
// const WEBHOOK_PORT = process.env.PORT || 3000;

// // Middleware
// app.use(express.json());

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


// async function sendTemplateMessage(phoneNumberId, to, text) {
//   try {
//     const response = await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${ACCESS_TOKEN}`,
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify(
//        { "messaging_product": "whatsapp", "to": to, "type": "template", "template": { "name": "hello_world", "language": { "code": "en_US" } } })
//     });
//     console.log('📤 Sending message:', response);
//     const result = await response.json();
//     console.log('✅ Message sent:', result);
//   } catch (error) {
//     console.error('❌ Error sending message:', error);
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
//           body: 'text'
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



// async function sendImageMessage(phoneNumberId, to, text) {
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
//         type: 'image',
//         text: {
//           // preview_url: false,  // Add this if you're not using links
//           link: 'https://dummyimage.com/600x400/000/fff.png&text=manfra.io',
//           caption:"Here is your image"
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



// // Send an image from local file to WhatsApp
// async function sendTextOrimage(phoneNumberId, to, textOrImagePath) {
//   textOrImagePath = 'allpets.png'; 
//   // If textOrImagePath is a path to a local image, send as image
//   if (textOrImagePath && textOrImagePath.endsWith('.png')) {
//     const form = new FormData();
//     form.append('messaging_product', 'whatsapp');
//     form.append('to', to);
//     form.append('type', 'image');
//     form.append('image', fs.createReadStream(textOrImagePath));

//     try {
//       const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
//         method: 'POST',
//         headers: {
//           'Authorization': `Bearer ${ACCESS_TOKEN}`,
//           ...form.getHeaders()
//         },
//         body: form
//       });

//       const result = await response.json();

//       if (!response.ok) {
//         console.error('❌ Error sending image:', result.error);
//         return { success: false, error: result.error };
//       }

//       console.log('✅ Image sent:', result);
//       return { success: true, data: result };
//     } catch (error) {
//       console.error('❌ Network error:', error);
//       throw new error( error.message );;
//     }
//   } else {
//     // Otherwise, send as text
//     try {
//       const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
//         method: 'POST',
//         headers: {
//           'Authorization': `Bearer ${ACCESS_TOKEN}`,
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//           messaging_product: 'whatsapp',
//           to,
//           type: 'text',
//           text: { body: textOrImagePath }
//         })
//       });

//       const result = await response.json();

//       if (!response.ok) {
//         console.error('❌ Error sending text:', result.error);
//         return { success: false, error: result.error };
//       }

//       console.log('✅ Text message sent:', result);
//       return { success: true, data: result };
//     } catch (error) {
//       console.error('❌ Network error:', error);
//       throw new error( error.message );;
//     }
//   }
// }



// @@@@@@@@@@@@@ whtaspp success @@@@@@@@@@@?\÷



// // WhatsApp Business API - Receive Messages in Node.js
// const express = require('express');
// const crypto = require('crypto');
// const { link } = require('fs');
// const app = express();
// const FormData = require('form-data');
// const fs = require('fs');

// // Configuration
// const VERIFY_TOKEN = 'your_verify_token_here';  // "2177092386053668"
// const APP_SECRET = 'your_app_secret_here';
// const PHONE_NUMBER_ID= "623688297501791";  
// const ACCESS_TOKEN = 'EAAZAZCDFS5ZC2sBOz2z0plmb4JAjONIZBbZCp7v4OnKZBEqDZAjUg4j7ZBhVTQZAGN8vV88ewoiZBYD28F7ZAC1qiKAXWJ9PFSoM5Hnag8TN6KUuCCs3gzFNZBJcWOFD2l3PHbD1I8pAnqlkTEetPH5Ksj0dknj8vP3iHMSmW6uIuV7xsOLNazDSXkeUvNdxoYmiZBmEZChEG5KWgVh5VFXQ0svZCG0Y3ULNHc8iaZAMRqr8GL7MngZDZD';
// const WEBHOOK_PORT = process.env.PORT || 3000;

// // Middleware
// app.use(express.json());

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
//           body: 'text'
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

// // =============================================================================
// // SERVER STARTUP
// // =============================================================================
// app.listen(WEBHOOK_PORT, () => {
//   console.log('🚀 WhatsApp webhook server started!');
//   console.log(`📡 Listening on port ${WEBHOOK_PORT}`);
//   console.log(`🔗 Webhook URL: http://localhost:${WEBHOOK_PORT}/webhook`);
//   console.log('');
//   console.log('Setup checklist:');
//   console.log('✅ 1. Update your tokens in the configuration');
//   console.log('✅ 2. Set up ngrok or deploy to get public URL');
//   console.log('✅ 3. Configure webhook URL in Meta Developer Console');
//   console.log('✅ 4. Test by sending messages to your WhatsApp Business number');
// });

// // Export for testing
// module.exports = { app };