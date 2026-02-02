// WhatsApp Reply Utilities
// Reusable message handling and auto-reply logic for both Business API and Baileys

class WhatsAppReplyHandler {
    constructor(config = {}) {
        this.config = {
            companyName: config.companyName || 'Your Company',
            supportEmail: config.supportEmail || 'support@yourcompany.com',
            supportPhone: config.supportPhone || '+91 830 103 1955',
            businessHours: config.businessHours || 'Mon-Fri, 9 AM - 6 PM IST',
            websiteUrl: config.websiteUrl || 'www.yourcompany.com',
            ...config
        };
        
        this.messagePatterns = this.initializePatterns();
        this.customHandlers = new Map();
    }

    initializePatterns() {
        return {
            greeting: /^(hi|hello|hey|start|good morning|good afternoon|good evening)$/i,
            menu: /^(menu|help|options)$/i,
            products: /^(product|products|1)$|product/i,
            booking: /^(booking|book|appointment|2)$|book/i,
            inquiry: /^(lead|inquiry|enquiry|3)$|inquiry|enquiry/i,
            contact: /^(contact|support|4)$|contact|support/i,
            about: /^(about|info|5)$|about/i,
            thanks: /thank|thanks|thankyou/i,
            pricing: /price|pricing|cost|how much/i,
            status: /status|track|order/i,
            feedback: /feedback|review|complaint/i
        };
    }

    // Register custom handler for specific patterns
    registerHandler(name, pattern, handler) {
        this.customHandlers.set(name, { pattern, handler });
    }

    // Main message processing method
    async processMessage(message, context = {}) {
        const lowerMsg = message.toLowerCase().trim();
        
        // Check custom handlers first
        for (const [name, { pattern, handler }] of this.customHandlers) {
            if (pattern.test(lowerMsg)) {
                const result = await handler(message, context);
                if (result) return result;
            }
        }

        // Built-in handlers
        if (this.messagePatterns.greeting.test(lowerMsg)) {
            return this.getGreetingMessage(context);
        }
        
        if (this.messagePatterns.menu.test(lowerMsg)) {
            return this.getMenuMessage(context);
        }
        
        if (this.messagePatterns.products.test(lowerMsg)) {
            return this.getProductsMessage(context);
        }
        
        if (this.messagePatterns.booking.test(lowerMsg)) {
            return this.getBookingMessage(context);
        }
        
        if (this.messagePatterns.inquiry.test(lowerMsg)) {
            return this.getInquiryMessage(context);
        }
        
        if (this.messagePatterns.contact.test(lowerMsg)) {
            return this.getContactMessage(context);
        }
        
        if (this.messagePatterns.about.test(lowerMsg)) {
            return this.getAboutMessage(context);
        }
        
        if (this.messagePatterns.thanks.test(lowerMsg)) {
            return this.getThanksMessage(context);
        }
        
        if (this.messagePatterns.pricing.test(lowerMsg)) {
            return this.getPricingMessage(context);
        }
        
        if (this.messagePatterns.status.test(lowerMsg)) {
            return this.getStatusMessage(context);
        }
        
        if (this.messagePatterns.feedback.test(lowerMsg)) {
            return this.getFeedbackMessage(context);
        }

        // Default fallback
        return this.getDefaultMessage(context);
    }

    // Message templates
    getGreetingMessage(context) {
        return {
            text: `👋 *Hello${context.senderName ? ' ' + context.senderName : ''}! Welcome to ${this.config.companyName}!*\n\n` +
                `I'm your automated assistant. How can I help you today?\n\n` +
                `Type *menu* to see all available options.`,
            type: 'text'
        };
    }

    getMenuMessage(context) {
        return {
            text: `📋 *Main Menu - ${this.config.companyName}*\n\n` +
                `*1.* Products 🛍️\n` +
                `*2.* Bookings 📅\n` +
                `*3.* Lead/Inquiry 💼\n` +
                `*4.* Contact Support 📞\n` +
                `*5.* About Us ℹ️\n` +
                `*6.* Pricing 💰\n` +
                `*7.* Track Status 📦\n` +
                `*8.* Feedback 💬\n\n` +
                `Just type the option name or number!`,
            type: 'text'
        };
    }

    getProductsMessage(context) {
        return {
            text: `🛍️ *Our Products*\n\n` +
                `We offer a wide range of quality products:\n\n` +
                `• Premium Services\n` +
                `• Customized Solutions\n` +
                `• Enterprise Packages\n\n` +
                `Visit ${this.config.websiteUrl} or type *contact* to speak with our sales team.\n\n` +
                `Type *pricing* for price information.`,
            type: 'text'
        };
    }

    getBookingMessage(context) {
        return {
            text: `📅 *Make a Booking*\n\n` +
                `To book our services, please provide:\n\n` +
                `• Your full name\n` +
                `• Preferred date & time\n` +
                `• Service required\n` +
                `• Contact number\n\n` +
                `Or visit ${this.config.websiteUrl} to book online instantly!\n\n` +
                `Our team will confirm your booking within 2 hours.`,
            type: 'text'
        };
    }

    getInquiryMessage(context) {
        return {
            text: `💼 *Submit Your Inquiry*\n\n` +
                `Please share the following details:\n\n` +
                `• Your name\n` +
                `• Email/Phone\n` +
                `• Your requirements\n` +
                `• Preferred contact time\n\n` +
                `Our team will contact you within 24 hours!\n\n` +
                `For urgent inquiries, call: ${this.config.supportPhone}`,
            type: 'text'
        };
    }

    getContactMessage(context) {
        return {
            text: `📞 *Contact Information*\n\n` +
                `📧 Email: ${this.config.supportEmail}\n` +
                `📱 Phone: ${this.config.supportPhone}\n` +
                `🌐 Website: ${this.config.websiteUrl}\n` +
                `🕒 Hours: ${this.config.businessHours}\n\n` +
                `We're here to help! 😊`,
            type: 'text'
        };
    }

    getAboutMessage(context) {
        return {
            text: `ℹ️ *About ${this.config.companyName}*\n\n` +
                `We are a leading service provider committed to excellence and customer satisfaction.\n\n` +
                `🏆 Our Strengths:\n` +
                `• Quality products & services\n` +
                `• Expert team\n` +
                `• 24/7 support\n` +
                `• Customer-first approach\n\n` +
                `Type *contact* to learn more or speak with our team.`,
            type: 'text'
        };
    }

    getThanksMessage(context) {
        return {
            text: `You're welcome! 😊\n\n` +
                `Is there anything else I can help you with?\n\n` +
                `Type *menu* to see all options.`,
            type: 'text'
        };
    }

    getPricingMessage(context) {
        return {
            text: `💰 *Pricing Information*\n\n` +
                `For detailed pricing, please:\n\n` +
                `• Visit ${this.config.websiteUrl}\n` +
                `• Contact our sales team\n` +
                `• Type *inquiry* to get a custom quote\n\n` +
                `We offer competitive pricing and flexible packages!`,
            type: 'text'
        };
    }

    getStatusMessage(context) {
        return {
            text: `📦 *Track Your Status*\n\n` +
                `To track your order/booking, please provide:\n\n` +
                `• Order/Booking ID\n` +
                `• Registered email/phone\n\n` +
                `Or contact support at ${this.config.supportPhone} for immediate assistance.`,
            type: 'text'
        };
    }

    getFeedbackMessage(context) {
        return {
            text: `💬 *We Value Your Feedback*\n\n` +
                `Please share your:\n\n` +
                `• Experience with us\n` +
                `• Suggestions for improvement\n` +
                `• Rating (1-5 stars)\n\n` +
                `Your feedback helps us serve you better!\n\n` +
                `Email: ${this.config.supportEmail}`,
            type: 'text'
        };
    }

    getDefaultMessage(context) {
        return {
            text: `Thank you for your message! 🙏\n\n` +
                `I'll make sure someone gets back to you soon.\n\n` +
                `Meanwhile, type *menu* to see what I can help you with right now.\n\n` +
                `For urgent matters, call: ${this.config.supportPhone}`,
            type: 'text'
        };
    }

    // Media handling helpers
    handleImageMessage(mediaData, context) {
        return {
            text: `Thanks for the image! 📸\n\n` +
                `Our team will review it and get back to you.\n\n` +
                `Type *menu* if you need anything else.`,
            type: 'text'
        };
    }

    handleDocumentMessage(mediaData, context) {
        return {
            text: `Document received! 📎\n\n` +
                `We've got your file and will review it shortly.\n\n` +
                `Type *menu* for more options.`,
            type: 'text'
        };
    }

    handleVideoMessage(mediaData, context) {
        return {
            text: `Video received! 🎬\n\n` +
                `Thanks for sharing. We'll review it soon.\n\n` +
                `Type *menu* if you need assistance.`,
            type: 'text'
        };
    }

    handleAudioMessage(mediaData, context) {
        return {
            text: `Voice message received! 🎤\n\n` +
                `We'll listen to it and respond accordingly.\n\n` +
                `Type *menu* for other options.`,
            type: 'text'
        };
    }
}

// Export singleton instance and class
const replyHandler = new WhatsAppReplyHandler();

module.exports = {
    WhatsAppReplyHandler,
    replyHandler
};