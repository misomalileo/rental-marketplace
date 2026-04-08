// webhooks/whatsappWebhook.js
const express = require('express');
const router = express.Router();
const { sendWhatsAppText } = require('../services/whatsappService');

// Verification endpoint (Meta calls this during webhook setup)
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Webhook verified!');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Receive and process incoming messages
router.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        const entry = body.entry[0];
        const changes = entry.changes[0];
        const value = changes.value;
        const messages = value.messages;

        if (messages && messages[0]) {
            const msg = messages[0];
            const from = msg.from;
            const text = msg.text?.body;

            let replyText = "Thank you for your message. A landlord will get back to you soon.";
            if (text && text.toLowerCase().includes('price')) {
                replyText = "The price for this property is MWK 250,000 per month.";
            } else if (text && text.toLowerCase().includes('available')) {
                replyText = "Yes, this property is currently available for viewing.";
            }

            await sendWhatsAppText(from, replyText);
        }
    }
    res.sendStatus(200);
});

module.exports = router;