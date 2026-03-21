const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true, sparse: true },
    password: String,
    phone: String,
    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    role: { type: String, enum: ["admin", "landlord"], default: "landlord" },
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
    // NEW: subscription expiry
    subscriptionExpiresAt: { type: Date, default: null }
});

module.exports = mongoose.model("User", UserSchema);