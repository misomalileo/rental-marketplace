const mongoose = require("mongoose");

const OfferSchema = new mongoose.Schema(
  {
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    proposedPrice: { type: Number, required: true },
    moveInDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "countered"],
      default: "pending"
    },
    counterOfferPrice: { type: Number },
    counterOfferDate: { type: Date },
    landlordComment: { type: String },
    tenantComment: { type: String },
    seen: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Offer", OfferSchema);