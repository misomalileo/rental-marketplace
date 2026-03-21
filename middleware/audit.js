const AuditLog = require("../models/AuditLog");

async function logAdminAction(adminId, action, target, targetModel, details = {}) {
  try {
    await AuditLog.create({
      admin: adminId,
      action,
      target,
      targetModel,
      details,
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

module.exports = { logAdminAction };