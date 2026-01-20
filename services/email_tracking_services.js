// controllers/email_tracking_controller.js
const db = require('../config/connection');
const UAParser = require('ua-parser-js');

// 1x1 transparent GIF pixel
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

module.exports = {
  
  // Track email open
  trackEmailOpen: async (req, res) => {
    const { emailId, recipientId } = req.params;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    
    try {
      // Check if email record exists
      const emailExists = await db.get().collection('sent_emails').findOne({
        email_id: emailId,
        recipient_id: recipientId
      });
      
      if (!emailExists) {
        console.log(`Invalid tracking attempt: emailId=${emailId}, recipientId=${recipientId}`);
        // Still return pixel but don't track
        res.writeHead(200, {
          'Content-Type': 'image/gif',
          'Content-Length': TRACKING_PIXEL.length,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        return res.end(TRACKING_PIXEL);
      }
      
      // Parse user agent
      const parser = new UAParser(userAgent);
      const deviceInfo = {
        browser: parser.getBrowser().name || 'Unknown',
        os: parser.getOS().name || 'Unknown',
        device: parser.getDevice().type || 'desktop'
      };
      
      const isFirstOpen = !emailExists.first_opened_at;
      
      // Insert open event
      await db.get().collection('email_open_events').insertOne({
        email_id: emailId,
        recipient_id: recipientId,
        opened_at: new Date(),
        ip_address: ip,
        user_agent: userAgent,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        device: deviceInfo.device
      });
      
      // Update email tracking summary
      const updateData = {
        last_opened_at: new Date(),
        $inc: { open_count: 1 }
      };
      
      if (isFirstOpen) {
        updateData.first_opened_at = new Date();
        updateData.status = 'opened';
      }
      
      await db.get().collection('sent_emails').updateOne(
        { email_id: emailId, recipient_id: recipientId },
        { $set: updateData }
      );
      
      console.log(`Email opened: ${emailId} by ${recipientId} (${isFirstOpen ? 'first time' : 'again'})`);
      
    } catch (error) {
      console.error('Error tracking email open:', error);
    }
    
    // Always return tracking pixel
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': TRACKING_PIXEL.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(TRACKING_PIXEL);
  },

  // Track email click
  trackEmailClick: async (req, res) => {
    const { emailId, recipientId } = req.params;
    const redirectUrl = req.query.redirect;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    
    try {
      // Verify email exists
      const emailExists = await db.get().collection('sent_emails').findOne({
        email_id: emailId,
        recipient_id: recipientId
      });
      
      if (!emailExists) {
        console.log(`Invalid click tracking: emailId=${emailId}, recipientId=${recipientId}`);
        return res.redirect(redirectUrl || 'https://yourdefault.com');
      }
      
      // Log click event
      await db.get().collection('email_click_events').insertOne({
        email_id: emailId,
        recipient_id: recipientId,
        clicked_url: redirectUrl,
        clicked_at: new Date(),
        ip_address: ip,
        user_agent: userAgent
      });
      
      // Update click count
      await db.get().collection('sent_emails').updateOne(
        { email_id: emailId, recipient_id: recipientId },
        { 
          $inc: { click_count: 1 },
          $set: { last_clicked_at: new Date() }
        }
      );
      
      console.log(`Link clicked: ${emailId} by ${recipientId} -> ${redirectUrl}`);
      
    } catch (error) {
      console.error('Error tracking click:', error);
    }
    
    res.redirect(redirectUrl || 'https://yourdefault.com');
  },

  // Send tracked email
  sendTrackedEmail: async (req, res) => {
    try {
      const { recipientEmail, recipientId, subject, content, metadata } = req.body;
      
      if (!recipientEmail || !recipientId || !subject || !content) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing required fields' 
        });
      }
      
      // Generate unique email ID
      const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create tracking pixel URL
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const trackingPixelUrl = `${baseUrl}/email/track/${emailId}/${recipientId}`;
      
      // Add tracking pixel to email content
      const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
      
      // Wrap links with tracking
      const trackedContent = content.replace(
        /<a\s+href="([^"]+)"/g,
        (match, url) => {
          const trackedUrl = `${baseUrl}/email/click/${emailId}/${recipientId}?redirect=${encodeURIComponent(url)}`;
          return `<a href="${trackedUrl}"`;
        }
      );
      
      const finalEmailBody = `
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body>
            ${trackedContent}
            ${trackingPixel}
          </body>
        </html>
      `;
      
      // Insert into database
      await db.get().collection('sent_emails').insertOne({
        email_id: emailId,
        recipient_id: recipientId,
        recipient_email: recipientEmail,
        subject: subject,
        content: finalEmailBody,
        original_content: content,
        sent_at: new Date(),
        first_opened_at: null,
        last_opened_at: null,
        open_count: 0,
        click_count: 0,
        last_clicked_at: null,
        status: 'sent',
        metadata: metadata || {},
        tracking_pixel_url: trackingPixelUrl
      });
      
      // TODO: Send email using your email service (nodemailer, SendGrid, etc.)
      // await sendEmailViaProvider(recipientEmail, subject, finalEmailBody);
      
      res.json({
        success: true,
        emailId: emailId,
        trackingUrl: trackingPixelUrl,
        message: 'Email queued for sending'
      });
      
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send email' 
      });
    }
  },

  // Get tracking data for specific email
  getTrackingData: async (req, res) => {
    try {
      const { emailId, recipientId } = req.params;
      
      // Get email data
      const emailData = await db.get().collection('sent_emails').findOne({
        email_id: emailId,
        recipient_id: recipientId
      });
      
      if (!emailData) {
        return res.status(404).json({ 
          success: false, 
          error: 'Email not found' 
        });
      }
      
      // Get open events
      const openEvents = await db.get().collection('email_open_events')
        .find({ email_id: emailId, recipient_id: recipientId })
        .sort({ opened_at: -1 })
        .toArray();
      
      // Get click events
      const clickEvents = await db.get().collection('email_click_events')
        .find({ email_id: emailId, recipient_id: recipientId })
        .sort({ clicked_at: -1 })
        .toArray();
      
      res.json({
        success: true,
        email: emailData,
        openEvents: openEvents,
        clickEvents: clickEvents,
        summary: {
          totalOpens: emailData.open_count,
          totalClicks: emailData.click_count,
          isOpened: !!emailData.first_opened_at,
          isClicked: !!emailData.last_clicked_at,
          firstOpenedAt: emailData.first_opened_at,
          lastOpenedAt: emailData.last_opened_at,
          lastClickedAt: emailData.last_clicked_at
        }
      });
      
    } catch (error) {
      console.error('Error fetching tracking data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  },

  // Get all emails for a recipient
  getRecipientEmails: async (req, res) => {
    try {
      const { recipientId } = req.params;
      
      const emails = await db.get().collection('sent_emails')
        .find({ recipient_id: recipientId })
        .sort({ sent_at: -1 })
        .toArray();
      
      res.json({
        success: true,
        emails: emails,
        total: emails.length
      });
      
    } catch (error) {
      console.error('Error fetching recipient data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  },

  // Get dashboard statistics
  getDashboardStats: async (req, res) => {
    try {
      const sentEmails = await db.get().collection('sent_emails');
      
      // Total emails sent
      const totalSent = await sentEmails.countDocuments();
      
      // Total opened
      const totalOpened = await sentEmails.countDocuments({ 
        first_opened_at: { $ne: null } 
      });
      
      // Total clicks
      const clickResult = await sentEmails.aggregate([
        { $group: { _id: null, total: { $sum: "$click_count" } } }
      ]).toArray();
      const totalClicks = clickResult.length > 0 ? clickResult[0].total : 0;
      
      // Open rate
      const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(2) : 0;
      
      // Click rate
      const clickRate = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(2) : 0;
      
      // Emails by status
      const byStatus = await sentEmails.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]).toArray();
      
      res.json({
        success: true,
        stats: {
          totalSent,
          totalOpened,
          totalClicks,
          openRate: parseFloat(openRate),
          clickRate: parseFloat(clickRate),
          byStatus: byStatus.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {})
        }
      });
      
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  },

  // Get recent activity
  getRecentActivity: async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      
      const recentEmails = await db.get().collection('sent_emails')
        .find()
        .sort({ sent_at: -1 })
        .limit(limit)
        .toArray();
      
      res.json({
        success: true,
        recentActivity: recentEmails
      });
      
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  },

  // Bulk send emails
  bulkSendEmails: async (req, res) => {
    try {
      const { recipients, subject, content, metadata } = req.body;
      
      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Recipients array is required' 
        });
      }
      
      const results = [];
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      for (const recipient of recipients) {
        try {
          const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const trackingPixelUrl = `${baseUrl}/email/track/${emailId}/${recipient.recipientId}`;
          
          const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
          
          const trackedContent = content.replace(
            /<a\s+href="([^"]+)"/g,
            (match, url) => {
              const trackedUrl = `${baseUrl}/email/click/${emailId}/${recipient.recipientId}?redirect=${encodeURIComponent(url)}`;
              return `<a href="${trackedUrl}"`;
            }
          );
          
          const finalEmailBody = `
            <html>
              <head><meta charset="UTF-8"></head>
              <body>
                ${trackedContent}
                ${trackingPixel}
              </body>
            </html>
          `;
          
          await db.get().collection('sent_emails').insertOne({
            email_id: emailId,
            recipient_id: recipient.recipientId,
            recipient_email: recipient.email,
            subject: subject,
            content: finalEmailBody,
            original_content: content,
            sent_at: new Date(),
            first_opened_at: null,
            last_opened_at: null,
            open_count: 0,
            click_count: 0,
            status: 'sent',
            metadata: metadata || {},
            tracking_pixel_url: trackingPixelUrl
          });
          
          results.push({
            success: true,
            emailId: emailId,
            recipientEmail: recipient.email
          });
          
        } catch (error) {
          results.push({
            success: false,
            recipientEmail: recipient.email,
            error: error.message
          });
        }
      }
      
      res.json({
        success: true,
        message: `Sent ${results.filter(r => r.success).length} out of ${recipients.length} emails`,
        results: results
      });
      
    } catch (error) {
      console.error('Error bulk sending emails:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send bulk emails' 
      });
    }
  },

  // Export tracking data
  exportTrackingData: async (req, res) => {
    try {
      const { recipientId } = req.params;
      
      const emails = await db.get().collection('sent_emails')
        .find({ recipient_id: recipientId })
        .sort({ sent_at: -1 })
        .toArray();
      
      const csvData = [
        ['Email ID', 'Subject', 'Sent At', 'Opened', 'Open Count', 'Click Count', 'Status'].join(',')
      ];
      
      emails.forEach(email => {
        csvData.push([
          email.email_id,
          `"${email.subject}"`,
          email.sent_at.toISOString(),
          email.first_opened_at ? 'Yes' : 'No',
          email.open_count,
          email.click_count,
          email.status
        ].join(','));
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=email_tracking_${recipientId}.csv`);
      res.send(csvData.join('\n'));
      
    } catch (error) {
      console.error('Error exporting data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to export data' 
      });
    }
  }
};