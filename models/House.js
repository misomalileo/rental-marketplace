const mongoose = require("mongoose");

const HouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true },
    price: { type: Number, required: true },
    bedrooms: { type: Number, default: 0 },
    bathrooms: { type: Number, default: 0 },
    // ========== EXTENDED TYPES ==========
    type: {
      type: String,
      enum: [
        "House",
        "Apartment",
        "Room",
        "Hostel",
        "Office",
        "FurnishedApartment",
        "ShortStay",
        "SharedLiving",
        "StudentAccommodation"
      ],
      default: "House"
    },
    description: { type: String, default: "" },
    images: { type: [String], default: [] },
    phone: { type: String, required: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    premium: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    ratings: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        value: Number
      }
    ],
    averageRating: { type: Number, default: 0 },
    condition: { type: String, enum: ["Good", "Fair", "Needs renovation"], default: "Good" },
    vacancies: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    wifi: { type: Boolean, default: false },
    parking: { type: Boolean, default: false },
    furnished: { type: Boolean, default: false },
    petFriendly: { type: Boolean, default: false },
    pool: { type: Boolean, default: false },
    ac: { type: Boolean, default: false },
    gender: {
      type: String,
      enum: ["boys", "girls", "mixed", "none"],
      default: "none"
    },
    unavailableDates: { type: [Date], default: [] },
    selfContained: { type: Boolean, default: false },
    virtualTourUrl: { type: String, default: null },
    // === NEW BIDDING FIELDS ===
    allowBidding: { type: Boolean, default: true },
    showHighestBidToPremium: { type: Boolean, default: true },
    // ========== NEW RENTAL STATUS FIELD ==========
    rentalStatus: {
      type: String,
      enum: ['available', 'rented', 'pending'],
      default: 'available'
    },
    // ========== NEW: STORE TYPE‑SPECIFIC DETAILS ==========
    propertyDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    // ========== NEW: FEATURE VECTOR FOR IMAGE SIMILARITY SEARCH ==========
    featureVector: { type: [Number], default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("House", HouseSchema);