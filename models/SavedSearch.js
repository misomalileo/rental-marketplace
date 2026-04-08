// models/SavedSearch.js
const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    whatsappNumber: { type: String, required: true },
    filters: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SavedSearch', savedSearchSchema);