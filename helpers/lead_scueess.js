
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


async function sendTextMessage(phoneNumberId, to, text) {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(
       { "messaging_product": "whatsapp", "to": to, "type": "template", "template": { "name": "hello_world", "language": { "code": "en_US" } } })
    });
    console.log('📤 Sending message:', response);
    const result = await response.json();
    console.log('✅ Message sent:', result);
  } catch (error) {
    console.error('❌ Error sending message:', error);
  }
}