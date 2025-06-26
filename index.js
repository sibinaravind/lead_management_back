// WhatsApp Business API - Receive Messages in Node.js
const express = require('express');
const crypto = require('crypto');
const app = express();

// Configuration
const VERIFY_TOKEN = 'your_verify_token_here';  // "2177092386053668"
const APP_SECRET = 'your_app_secret_here';
const PHONE_NUMBER_ID= "623688297501791";  
const ACCESS_TOKEN = 'EAAZAZCDFS5ZC2sBOyYtCJNTZA4H9MRJPNfWriYFrHWOy2HtP1XWTrX1da2B5os2uRdupZCOiIYt4QrPPWMVeVMrS3mXJPfvORJ5ZAzW5ZBZC5M1YmPCQpahOc3QdPYF9ZBmE0ZBoZBZCMbeXkYf5WI9lMOAesXnNBJZAHRU02WrFwlwDdRr0fqtfZCKprrPyU2TlB4JjZCnjiGeAM9I8FUhemHlOfxyYgujIF4G49X5pfDaZCxyhAgZDZD';
const WEBHOOK_PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

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

function handleIncomingMessage(message, metadata) {
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
      handleTextMessage(message, phoneNumberId, fromNumber);
      break;
    
    case 'image':
      handleImageMessage(message, phoneNumberId, fromNumber);
      break;
    
    case 'document':
      handleDocumentMessage(message, phoneNumberId, fromNumber);
      break;
    
    case 'audio':
      handleAudioMessage(message, phoneNumberId, fromNumber);
      break;
    
    case 'video':
      handleVideoMessage(message, phoneNumberId, fromNumber);
      break;
    
    case 'location':
      handleLocationMessage(message, phoneNumberId, fromNumber);
      break;
    
    case 'contacts':
      handleContactMessage(message, phoneNumberId, fromNumber);
      break;
    
    case 'interactive':
      handleInteractiveMessage(message, phoneNumberId, fromNumber);
      break;
    
    default:
      console.log(`❓ Unknown message type: ${message.type}`);
  }
}

// =============================================================================
// MESSAGE TYPE HANDLERS
// =============================================================================
function handleTextMessage(message, phoneNumberId, fromNumber) {
  const text = message.text.body;
  console.log(`💬 Text message: "${text}"`);
  
  // Example: Echo the message back
  sendTextMessage(phoneNumberId, fromNumber, `You said: ${text}`);
  
  // Example: Handle specific commands
  if (text.toLowerCase().includes('hello')) {
    sendTextMessage(phoneNumberId, fromNumber, 'Hello! How can I help you today?');
  } else if (text.toLowerCase().includes('help')) {
    sendHelpMessage(phoneNumberId, fromNumber);
  }
}

function handleImageMessage(message, phoneNumberId, fromNumber) {
  const image = message.image;
  console.log(`🖼️ Image received:`);
  console.log(`- ID: ${image.id}`);
  console.log(`- MIME type: ${image.mime_type}`);
  console.log(`- Caption: ${image.caption || 'No caption'}`);
  
  // Download the image if needed
  downloadMedia(image.id, image.mime_type);
  
  sendTextMessage(phoneNumberId, fromNumber, 'Thanks for the image! 📸');
}

function handleDocumentMessage(message, phoneNumberId, fromNumber) {
  const document = message.document;
  console.log(`📄 Document received:`);
  console.log(`- ID: ${document.id}`);
  console.log(`- Filename: ${document.filename}`);
  console.log(`- MIME type: ${document.mime_type}`);
  
  sendTextMessage(phoneNumberId, fromNumber, `Document "${document.filename}" received! 📎`);
}

function handleAudioMessage(message, phoneNumberId, fromNumber) {
  const audio = message.audio;
  console.log(`🎵 Audio received: ${audio.id}`);
  
  sendTextMessage(phoneNumberId, fromNumber, 'Voice message received! 🎤');
}

function handleVideoMessage(message, phoneNumberId, fromNumber) {
  const video = message.video;
  console.log(`🎥 Video received: ${video.id}`);
  
  sendTextMessage(phoneNumberId, fromNumber, 'Video received! 🎬');
}

function handleLocationMessage(message, phoneNumberId, fromNumber) {
  const location = message.location;
  console.log(`📍 Location received:`);
  console.log(`- Latitude: ${location.latitude}`);
  console.log(`- Longitude: ${location.longitude}`);
  console.log(`- Name: ${location.name || 'Unknown'}`);
  console.log(`- Address: ${location.address || 'No address'}`);
  
  sendTextMessage(phoneNumberId, fromNumber, 'Location received! 📍');
}

function handleContactMessage(message, phoneNumberId, fromNumber) {
  const contacts = message.contacts;
  console.log(`👤 Contact(s) received: ${contacts.length}`);
  
  contacts.forEach(contact => {
    console.log(`- Name: ${contact.name.formatted_name}`);
    console.log(`- Phone: ${contact.phones?.[0]?.phone || 'No phone'}`);
  });
  
  sendTextMessage(phoneNumberId, fromNumber, 'Contact information received! 👤');
}

function handleInteractiveMessage(message, phoneNumberId, fromNumber) {
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
  
  sendTextMessage(phoneNumberId, fromNumber, 'Button/List selection received! ✅');
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
          preview_url: false,  // Add this if you're not using links
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
    return { success: false, error: error.message };
  }
}

async function sendHelpMessage(phoneNumberId, fromNumber) {
  const helpText = `🤖 Available Commands:
  
• Send "hello" - Get a greeting
• Send "help" - Show this help message  
• Send any image - I'll acknowledge it
• Send any document - I'll tell you I received it
• Send your location - I'll confirm I got it

What would you like to do?`;

  await sendTextMessage(phoneNumberId, fromNumber, helpText);
}

// =============================================================================
// SERVER STARTUP
// =============================================================================
app.listen(WEBHOOK_PORT, () => {
  console.log('🚀 WhatsApp webhook server started!');
  console.log(`📡 Listening on port ${WEBHOOK_PORT}`);
  console.log(`🔗 Webhook URL: http://localhost:${WEBHOOK_PORT}/webhook`);
  console.log('');
  console.log('Setup checklist:');
  console.log('✅ 1. Update your tokens in the configuration');
  console.log('✅ 2. Set up ngrok or deploy to get public URL');
  console.log('✅ 3. Configure webhook URL in Meta Developer Console');
  console.log('✅ 4. Test by sending messages to your WhatsApp Business number');
});

// Export for testing
module.exports = { app };

// const express = require("express");
// const session = require('express-session');
// const bodyParser = require('body-parser');
// const cookieParser = require('cookie-parser');
// const path = require('path');
// const hbs = require('express-handlebars');
// const db = require('./config/connection');
// const fileUpload = require('express-fileupload');
// const fs = require('fs');
// const cron = require('node-cron');
// const http = require('http');
// const cors = require('cors');
// const PORT = process.env.PORT || 3000;

// const compression = require('compression');

// const { createWriteStream } = require('fs');
// const app = express();
// const server = http.createServer(app);

// // Database connections
// db.connect(err => {
//   if (err) console.log("Mongo connection error: " + err);
//   else console.log("Mongo connected");
// });
// // Middleware setup
// app.use(cors());
// app.use(express.static(path.join(__dirname, 'assets')));
// app.use(bodyParser.json({ limit: '25mb' }));
// app.use(bodyParser.urlencoded({ limit: '25mb', extended: true }));


// // app.use(bodyParser.urlencoded({ extended: false }));
// app.use(cookieParser());
// app.use(session({
//   secret: "Aikara",
//   resave: false,
//   saveUninitialized: true,
//   cookie: { maxAge: 90000 }
// }));
// app.use(compression());
// app.use(fileUpload({ safeFileNames: true, preserveExtension: true, }));
// app.use(express.json());
// app.use("/uploads", express.static("uploads"));

// // Handlebars setup
// app.engine('hbs', hbs.engine({
//   extname: 'hbs',
//   defaultLayout: 'layout',
//   layoutsDir: path.join(__dirname, 'views/layout/'),
//   partialsDir: [
//     path.join(__dirname, 'views/partials'),
//     path.join(__dirname, 'views/website/partials')
//   ],
// }));

// app.set('views', path.join(__dirname, 'views'));
// app.set('view engine', 'hbs');

// // Route imports
// const routes = [
//   { path: '/officersAuth', route: require("./routes/officers/user_auth") },
//   { path: '/officer', route: require("./routes/officers/officers_router") },
//   { path: '/config', route: require("./routes/officers/configs_router") },
//   { path: '/project', route: require("./routes/officers/project_router") },
//   { path: '/customers', route: require("./routes/officers/customer_router") },
//   { path: '/lead', route: require("./routes/officers/lead_router") },
//   { path: '/', route: require("./routes/webiste/website") }
// ];

// // Use routes
// routes.forEach(({ path, route }) => app.use(path, route));

// // Handle unmatched routes (404)
// app.use((req, res, next) => {
//   res.status(404).json({ msg: "url not found error" });
// });

// // Terms and Conditions route
// app.route("/termsAndConditions").get((req, res) => res.render("terms"));

// // Error handling
// app.use((req, res, next) => {
//   res.status(404).render("error");
// });


// // Start the server
// server.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));

// // Cron job for token refresh
// cron.schedule('0 0 */8 * *', async () => {
//   const TOKEN_FILE_PATH = path.join(__dirname, '.env');
//   try {
//     const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         "email": "sibinjames.sibin@gmail.com",
//         "password": "Unni@001"
//       })
//     });

//     if (!response.ok) throw new Error('Failed to refresh token');

//     const data = await response.json();
//     const newToken = data.token;

//     fs.writeFileSync(TOKEN_FILE_PATH, `
//       API_KEY=${process.env.API_KEY}
//       SHIPROCKETAPI=${newToken}`);
//     process.env.SHIPROCKETAPI = newToken;
//   } catch (error) {
//     console.error('Error refreshing token:', error);
//   }
// });



// // // active ,inactive,deleted,blocked,unassigned


