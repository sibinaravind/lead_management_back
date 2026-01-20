// routes/officers/email_tracking_router.js
const express = require('express');
const app = express();
const emailTrackingController = require('../../services/email_tracking_services');

// Tracking endpoints
app.get('/track/:emailId/:recipientId', emailTrackingController.trackEmailOpen);
app.get('/click/:emailId/:recipientId', emailTrackingController.trackEmailClick);

// API endpoints
app.post('/send-email', emailTrackingController.sendTrackedEmail);
app.get('/tracking/:emailId/:recipientId', emailTrackingController.getTrackingData);
app.get('/tracking/recipient/:recipientId', emailTrackingController.getRecipientEmails);
app.get('/dashboard/stats', emailTrackingController.getDashboardStats);
app.get('/dashboard/recent', emailTrackingController.getRecentActivity);

// Bulk operations
app.post('/bulk-send', emailTrackingController.bulkSendEmails);
app.get('/export/:recipientId', emailTrackingController.exportTrackingData);

module.exports = app;