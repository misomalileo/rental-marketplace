const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    password: String,
    phone: String,
    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },

    // Role system: free, landlord, premium_user, premium_landlord, admin
    role: { 
        type: String, 
        enum: ["free", "landlord", "premium_user", "premium_landlord", "admin"], 
        default: "free" 
    },
    
    // Landlord verification (legacy)
    verified: { type: Boolean, default: false },
    verificationType: { type: String, enum: ["none", "official", "premium"], default: "none" },
    
    // General
    createdAt: { type: Date, default: Date.now },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    passwordResetToken: String,
    resetTokenExpiry: Date,

    // Profile details
    profile: {
        bio: String,
        avatar: String,
        responseRate: Number,
        joinedDate: { type: Date, default: Date.now }
    },
    businessName: { type: String, default: '' },
    address: { type: String, default: '' },
    profilePicture: { type: String, default: '' },
    bio: { type: String, default: '' },
    profileCompleted: { type: Boolean, default: false },
    
    // Subscription & premium
    subscriptionExpiresAt: { type: Date, default: null },
    
    // Premium user features
    savedSearches: [{
        name: { type: String, required: true },
        filters: { type: Object, default: {} },
        alertEnabled: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now },
        lastNotified: Date
    }],
    notifications: [{
        title: String,
        message: String,
        type: String, // e.g., 'price_drop', 'new_listing', 'alert', 'priority_viewing'
        read: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
        metadata: { type: Object, default: {} }  // added for extra data like tenantId, houseId
    }],
    
    // Trust score (0-100) for premium users
    trustScore: { type: Number, default: 0 },
    
    // Last seen for chat
    lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);