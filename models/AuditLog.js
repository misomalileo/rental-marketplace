const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true }, // e.g., "verify_landlord", "ban_user", "delete_house"
    target: { type: mongoose.Schema.Types.ObjectId, refPath: "targetModel" },
    targetModel: { type: String, enum: ["User", "House"] },
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);