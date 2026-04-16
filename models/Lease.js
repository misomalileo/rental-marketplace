const mongoose = require("mongoose");

const LeaseSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true },
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    rentAmount: { type: Number, required: true },
    pdfUrl: { type: String, required: true },
    landlordSignature: { type: String, default: null },
    tenantSignature: { type: String, default: null },
    landlordSignedAt: { type: Date },
    tenantSignedAt: { type: Date },
    status: { type: String, enum: ["pending", "signed_by_landlord", "signed_by_tenant", "completed"], default: "pending" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lease", LeaseSchema);