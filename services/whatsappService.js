// services/whatsappService.js
const axios = require('axios');

const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_VERSION = 'v21.0';

async function sendWhatsAppAlert(toNumber, propertyName, location, price, propertyUrl) {
    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            data: {
                messaging_product: 'whatsapp',
                to: toNumber,
                type: 'template',
                template: {
                    name: 'new_property_alert',
                    language: { code: 'en' },
                    components: [{
                        type: 'body',
                        parameters: [
                            { type: 'text', text: propertyName },
                            { type: 'text', text: location },
                            { type: 'text', text: price.toString() },
                            { type: 'text', text: propertyUrl }
                        ]
                    }]
                }
            }
        });
        console.log(`✅ WhatsApp alert sent to ${toNumber}`);
        return response.data;
    } catch (error) {
        console.error('❌ Error sending WhatsApp alert:', error.response?.data || error.message);
        throw error;
    }
}

async function sendWhatsAppText(toNumber, text) {
    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
            headers: {
                'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            data: {
                messaging_product: 'whatsapp',
                to: toNumber,
                type: 'text',
                text: { body: text }
            }
        });
        console.log(`✅ Text message sent to ${toNumber}`);
        return response.data;
    } catch (error) {
        console.error('❌ Error sending text message:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { sendWhatsAppAlert, sendWhatsAppText };