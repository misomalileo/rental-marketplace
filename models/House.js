const mongoose = require("mongoose");

const HouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true },
    price: { type: Number, required: true },
    bedrooms: { type: Number, default: 0 },
    bathrooms: { type: Number, default: 0 },
    type: {
      type: String,
      enum: ["Apartment", "House", "Room", "Hostel", "Office"],
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
    selfContained: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("House", HouseSchema);