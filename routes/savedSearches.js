// routes/savedSearches.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const SavedSearch = require('../models/SavedSearch');

// GET all saved searches for the logged-in user
router.get('/my-searches', auth, async (req, res) => {
    try {
        const searches = await SavedSearch.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(searches);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST create a new saved search
router.post('/save-search', auth, async (req, res) => {
    try {
        const { name, filters, whatsappNumber } = req.body;
        if (!whatsappNumber) {
            return res.status(400).json({ message: 'WhatsApp number is required' });
        }
        // Basic WhatsApp number validation (Malawi format)
        if (!/^265\d{9}$/.test(whatsappNumber)) {
            return res.status(400).json({ message: 'WhatsApp number must be in format 265XXXXXXXXX (12 digits total)' });
        }
        const savedSearch = new SavedSearch({
            userId: req.user.id,
            userEmail: req.user.email, // assuming user object has email
            whatsappNumber,
            filters,
            name: name || 'Saved Search'
        });
        await savedSearch.save();
        res.json({ message: 'Search saved successfully', search: savedSearch });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// DELETE a saved search
router.delete('/delete-search/:id', auth, async (req, res) => {
    try {
        const search = await SavedSearch.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!search) return res.status(404).json({ message: 'Search not found' });
        res.json({ message: 'Search deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;