// models/SavedSearch.js
const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    whatsappNumber: { type: String, required: true },
    filters: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: 'Saved Search' },
    emailEnabled: { type: Boolean, default: true }   // <-- NEW: whether to send email alerts
});

savedSearchSchema.index({ userId: 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);