const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    house: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending"
    },
    message: { type: String, default: "" },
    tenantName: { type: String },      // denormalized for convenience
    tenantEmail: { type: String },
    houseName: { type: String }
  },
  { timestamps: true }
);

// Ensure no overlapping approved bookings for the same house (database level index)
BookingSchema.index({ house: 1, startDate: 1, endDate: 1 }, { unique: false });
// We'll handle overlap logic in the code

module.exports = mongoose.model("Booking", BookingSchema);