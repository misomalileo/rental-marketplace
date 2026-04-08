// models/SavedSearch.js
const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
    // ========== EXISTING FIELDS (unchanged) ==========
    userEmail: { type: String, required: true },
    whatsappNumber: { type: String, required: true },
    filters: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
    
    // ========== NEW FIELDS (added) ==========
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // links to premium user
    name: { type: String, default: 'Saved Search' } // optional name for the search
});

// Optional: add an index for faster queries by userId
savedSearchSchema.index({ userId: 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);