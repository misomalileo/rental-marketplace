const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'general' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  metadata: { type: Object, default: {} }
});

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    password: String,
    phone: String,
    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },

    role: { 
        type: String, 
        enum: ["free", "landlord", "premium_user", "premium_landlord", "admin"], 
        default: "free" 
    },
    
    verified: { type: Boolean, default: false },
    verificationType: { type: String, enum: ["none", "official", "premium"], default: "none" },
    
    createdAt: { type: Date, default: Date.now },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    passwordResetToken: String,
    resetTokenExpiry: Date,

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
    
    whatsappNumber: { type: String, default: '' },
    
    subscriptionExpiresAt: { type: Date, default: null },
    
    savedSearches: [{
        name: { type: String, required: true },
        filters: { type: Object, default: {} },
        alertEnabled: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now },
        lastNotified: Date
    }],
    
    notifications: [NotificationSchema],
    
    trustScore: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now },

    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: Date.now },

    twoFactorSecret: { type: String, default: null },
    twoFactorEnabled: { type: Boolean, default: false }
});

UserSchema.methods.isPasswordStrong = function(password) {
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return strongRegex.test(password);
};

// ENCRYPTION IS REMOVED – plain text storage

module.exports = mongoose.model("User", UserSchema);