// WhatsApp Reply Utilities
// Reusable message handling and auto-reply logic for both Business API and Baileys

const db = require('../config/connection');
const COLLECTION = require('../config/collections');

class WhatsAppReplyHandler {
    constructor(config = {}) {
        this.config = {
            companyName: config.companyName || 'Alead',
            supportEmail: config.supportEmail || 'support@alead.com',
            supportPhone: config.supportPhone || '+91 9074033910',
            businessHours: config.businessHours || 'Mon-Fri, 9 AM - 6 PM IST',
            websiteUrl: config.websiteUrl || 'www.alead.com',
            ...config
        };
        
        this.messagePatterns = this.initializePatterns();
        this.customHandlers = new Map();
        this.productSessions = new Map();
    }

    initializePatterns() {
        return {
            greeting: /^(hi|hello|hey|start|good morning|good afternoon|good evening)$/i,
            menu: /^(menu|help|options)$/i,
            products: /^(product|products|1)$|product/i,
            booking: /^(booking|book|appointment|2)$|book/i,
            inquiry: /^(lead|inquiry|enquiry|4)$|inquiry|enquiry/i,
            contact: /^(contact|support|5)$|contact|support/i,
            about: /^(about|info|6)$|about|info/i,
            thanks: /thank|thanks|thankyou/i,
            pricing: /price|pricing|cost|how much/i,
            status: /^(status|track|track booking|my bookings|3)$|status|track booking|my bookings|track/i,
            feedback: /^(feedback|review|complaint|7)$|feedback|review|complaint/i
        };
    }

    // Register custom handler for specific patterns
    registerHandler(name, pattern, handler) {
        this.customHandlers.set(name, { pattern, handler });
    }

    // Main message processing method
    async processMessage(message, context = {}) {
        console.log(`Processing message: "${message}" from ${context.senderName || context.senderId}`);
        const lowerMsg = message.toLowerCase().trim();
        const bookingRef = this.extractBookingReference(message);
        const senderPhone = this.extractPhoneFromContext(context);
        const phoneQuery = this.extractPhoneQuery(message);
        const productSelection = this.extractProductSelection(lowerMsg);
        const bookingSelection = this.extractBookProductSelection(lowerMsg);
        
        // Check custom handlers first
        for (const [name, { pattern, handler }] of this.customHandlers) {
            if (pattern.test(lowerMsg)) {
                const result = await handler(message, context);
                if (result) return result;
            }
        }

        if (productSelection !== null) {
            return await this.getProductDetailsMessage(context, senderPhone, productSelection);
        }

        if (bookingSelection !== null) {
            return await this.getBookingMessage(context, {
                senderPhone,
                productSelection: bookingSelection,
            });
        }

        // Built-in handlers
        if (this.messagePatterns.greeting.test(lowerMsg)) {
            return this.getGreetingMessage(context);
        }
        
        if (this.messagePatterns.menu.test(lowerMsg)) {
            return this.getMenuMessage(context);
        }
        
        if (this.messagePatterns.products.test(lowerMsg)) {
            return await this.getProductsMessage(context, senderPhone);
        }
        
        if (this.messagePatterns.booking.test(lowerMsg)) {
            return await this.getBookingMessage(context, { senderPhone });
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
            return await this.getStatusMessage(context, bookingRef, phoneQuery);
        }

        if (bookingRef) {
            return await this.getStatusMessage(context, bookingRef, phoneQuery);
        }
        
        if (this.messagePatterns.feedback.test(lowerMsg)) {
            return this.getFeedbackMessage(context);
        }

        // return this.getDefaultMessage(context);
    }

    // Message templates
    getGreetingMessage(context) {
        return {
            text: `👋 *Hello${context.senderName ? ' ' + context.senderName : ''}! Welcome to ${this.config.companyName}!*\n\n` +
                `I am your automated assistant for:\n` +
                `• Quick booking\n` +
                `• Booking tracking\n` +
                `• Product details\n\n` +
                `Type *menu* to get started.`,
            type: 'text'
        };
    }

    getMenuMessage(context) {
        return {
            text: `✨ *Main Menu - ${this.config.companyName}*\n\n` +
                `1️⃣ Products \n` +
                `2️⃣ Booking\n` +
                `3️⃣ Track Booking\n` +
                `4️⃣ Inquiry\n` +
                `5️⃣ Contact\n` +
                `6️⃣ About\n` +
                `7️⃣ Feedback\n\n` +
                `⚡ Quick flow:\n` +
                `products → p1 → book p1\n\n` +
                `📦 Track options:\n` +
                `status  (my bookings)\n` +
                `status 919496473754  (lookup by phone)`,
            type: 'text'
        };
    }

    async getProductsMessage(context, senderPhone) {
        const products = await this.getTopProducts(8);
        if (senderPhone) {
            this.productSessions.set(senderPhone, {
                products,
                timestamp: Date.now(),
            });
        }

        const productLines = products.length
            ? products.map((item, index) => {
                const name = item.name || item.code || 'Product';
                const price = typeof item.sellingPrice === 'number' ? ` - INR ${item.sellingPrice}` : '';
                return `p${index + 1}. ${name}${price}`;
            }).join('\n')
            : 'No active products available right now.';

        return {
            text: `🛍️ *Our Products*\n\n` +
                `${productLines}\n\n` +
                `🔎 Reply *p1* / *p2* ... for product details.\n` +
                `📝 Reply *book p1* to start booking.\n\n` +
                `🌐 ${this.config.websiteUrl}`,
            type: 'text'
        };
    }

    async getProductDetailsMessage(context, senderPhone, selectionIndex) {
        const selectedProduct = this.getProductFromSession(senderPhone, selectionIndex);
        if (!selectedProduct) {
            return {
                text: `Please send *products* first, then choose like p1.`,
                type: 'text'
            };
        }

        const details = [
            `Product: ${selectedProduct.name || selectedProduct.code || 'N/A'}`,
            `Product ID: ${selectedProduct.product_id || 'N/A'}`,
            selectedProduct.category ? `Category: ${selectedProduct.category}` : null,
            typeof selectedProduct.sellingPrice === 'number' ? `Price: INR ${selectedProduct.sellingPrice}` : null,
            selectedProduct.shortDescription ? `About: ${selectedProduct.shortDescription}` : null,
        ].filter(Boolean).join('\n');

        return {
            text: `📌 *Product Details*\n\n` +
                `${details}\n\n` +
                `✅ To continue, send: *book p${selectionIndex + 1}*`,
            type: 'text'
        };
    }

    async getBookingMessage(context, options = {}) {
        const { senderPhone, productSelection = null } = options;
        let selectedProduct = null;

        if (typeof productSelection === 'number') {
            selectedProduct = this.getProductFromSession(senderPhone, productSelection);
            if (!selectedProduct) {
                return {
                    text: `Please send *products* first, then choose like book p1.`,
                    type: 'text'
                };
            }
        }

        const selectedProductText = selectedProduct
            ? `Selected Product: ${selectedProduct.name || selectedProduct.code || 'N/A'}\nProduct ID: ${selectedProduct.product_id || 'N/A'}\n\n`
            : '';

        return {
            text: `📅 *Booking Enquiry*\n\n` +
                `${selectedProductText}` +
                `Please send details in this format:\n\n` +
                `👤 Name:\n` +
                `📱 Phone:\n` +
                `🆔 Product ID:\n` +
                `📆 Preferred Date:\n` +
                `⏰ Preferred Time:\n` +
                `📍 City:\n` +
                `🗒️ Notes:\n\n` +
                `📦 You can also send Booking ID (example: *AEBK000123*) to check status.\n` +
                `🤝 Our team will follow up shortly.`,
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

    async getStatusMessage(context, bookingRef, phoneQuery = null) {
        if (bookingRef) {
            const booking = await this.getBookingByReference(bookingRef);
            if (booking) {
                return {
                    text: `📦 *Booking Status*\n\n` +
                        `Booking ID: ${booking.booking_id || bookingRef}\n` +
                        `Product: ${booking.product_name || 'N/A'}\n` +
                        `Status: ${booking.status || 'PROCESSING'}\n` +
                        `Customer: ${booking.customer_name || 'N/A'}\n` +
                        `Last Updated: ${new Date(booking.updated_at || booking.created_at || Date.now()).toLocaleString()}\n\n` +
                        `Reply *booking* if you want to update your request.`,
                    type: 'text'
                };
            }
        }

        const senderPhone = this.extractPhoneFromContext(context);
        const lookupPhone = phoneQuery || senderPhone;
        if (lookupPhone) {
            const bookings = await this.getBookingsByPhone(lookupPhone, 8);
            if (bookings.length) {
                const lines = bookings.map((item, index) => {
                    const status = item.status || 'PROCESSING';
                    const product = item.product_name || 'N/A';
                    return `${index + 1}. ${item.booking_id || 'N/A'} - ${status} - ${product}`;
                }).join('\n');

                return {
                    text: `📚 *Bookings${phoneQuery ? ` for ${lookupPhone}` : ''}*\n\n${lines}\n\n` +
                        `🔎Get Booking Details: Send any Booking ID (example: *AEBK000123*)`,
                    type: 'text'
                };
            }

            return {
                text: `📭 No bookings available${phoneQuery ? ` for ${lookupPhone}` : ''}.\n\n` +
                    `🛍️ Send *products* to start a booking.`,
                type: 'text'
            };
        }

        return {
            text: `📦 *Track Your Status*\n\n` +
                `Please share your *Booking ID* (example: AEBK000123).\n\n` +
                `If you don't have it, send:\n` +
                `• Your name\n` +
                `• Phone number used for booking\n\n` +
                `📞 Support: ${this.config.supportPhone}`,
            type: 'text'
        };
    }

    extractBookingReference(message = '') {
        const match = String(message).toUpperCase().match(/\bAEBK\d{4,}\b/);
        return match ? match[0] : null;
    }

    extractProductSelection(message = '') {
        const match = String(message).trim().match(/^p(\d{1,2})$/i);
        if (!match) return null;
        const index = parseInt(match[1], 10) - 1;
        return Number.isNaN(index) || index < 0 ? null : index;
    }

    extractBookProductSelection(message = '') {
        const match = String(message).trim().match(/^(book|booking)\s+p(\d{1,2})$/i);
        if (!match) return null;
        const index = parseInt(match[2], 10) - 1;
        return Number.isNaN(index) || index < 0 ? null : index;
    }

    extractPhoneFromContext(context = {}) {
        const candidate = context.from || context.senderId || '';
        const digits = String(candidate).replace(/\D/g, '');
        if (!digits) return null;
        if (digits.length <= 10) return digits;
        return digits.slice(-10);
    }

    extractPhoneQuery(message = '') {
        const cleaned = String(message).replace(/\bAEBK\d+\b/i, ' ');
        const match = cleaned.match(/(\+?\d[\d\s-]{8,14}\d)/);
        if (!match) return null;
        const digits = match[1].replace(/\D/g, '');
        return digits.length >= 10 ? digits : null;
    }

    getProductFromSession(senderPhone, index) {
        if (!senderPhone || typeof index !== 'number') return null;
        const session = this.productSessions.get(senderPhone);
        if (!session?.products?.length) return null;

        const maxAgeMs = 30 * 60 * 1000;
        if (!session.timestamp || (Date.now() - session.timestamp) > maxAgeMs) {
            this.productSessions.delete(senderPhone);
            return null;
        }

        return session.products[index] || null;
    }

    async getTopProducts(limit = 5) {
        try {
            const dbInstance = db.get();
            if (!dbInstance) return [];

            return await dbInstance
                .collection(COLLECTION.PRODUCTS)
                .find(
                    { status: { $in: ['ACTIVE', 'UPCOMING'] } },
                    { projection: { product_id: 1, name: 1, code: 1, category: 1, shortDescription: 1, sellingPrice: 1, created_at: 1 } }
                )
                .sort({ created_at: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error fetching products for auto-reply:', error);
            return [];
        }
    }

    async getBookingByReference(bookingRef) {
        try {
            const dbInstance = db.get();
            if (!dbInstance || !bookingRef) return null;

            return await dbInstance
                .collection(COLLECTION.BOOKINGS)
                .findOne(
                    { booking_id: bookingRef },
                    { projection: { booking_id: 1, product_name: 1, status: 1, customer_name: 1, updated_at: 1, created_at: 1 } }
                );
        } catch (error) {
            console.error('Error fetching booking for auto-reply:', error);
            return null;
        }
    }

    async getBookingsByPhone(phone, limit = 8) {
        try {
            const dbInstance = db.get();
            if (!dbInstance || !phone) return [];

            const digits = String(phone).replace(/\D/g, '');
            const last10 = digits.slice(-10);
            const variants = Array.from(new Set([digits, last10, `+91 ${last10}`, `91${last10}`].filter(Boolean)));

            const regexLast10 = new RegExp(`${last10}$`);

            return await dbInstance
                .collection(COLLECTION.BOOKINGS)
                .find(
                    {
                        $or: [
                            { customer_phone: { $in: variants } },
                            { customer_phone: regexLast10 }
                        ]
                    },
                    {
                        projection: {
                            booking_id: 1,
                            product_name: 1,
                            status: 1,
                            created_at: 1,
                            updated_at: 1
                        }
                    }
                )
                .sort({ created_at: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error fetching bookings by phone for auto-reply:', error);
            return [];
        }
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
            text: `✅ *Request received successfully.*\n\n` +
                `Our team will respond quickly.\n` +
                `Meanwhile, you can use:\n` +
                `• *products* for product list\n` +
                `• *booking* for quick booking format\n` +
                `• *status* for booking tracking\n\n` +
                `📞 Urgent support: ${this.config.supportPhone}`,
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
