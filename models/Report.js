const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    house: { type: mongoose.Schema.Types.ObjectId, ref: "House" },
    landlord: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, required: true },
    description: String,
    status: { type: String, enum: ["pending", "resolved"], default: "pending" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", ReportSchema);