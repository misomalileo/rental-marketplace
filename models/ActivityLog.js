const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true }, // e.g., 'login', 'upload_house', 'view_house'
  target: { type: mongoose.Schema.Types.ObjectId, refPath: 'targetModel' },
  targetModel: { type: String, enum: ['House', 'User', 'Booking'] },
  details: { type: Object, default: {} },
  ip: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);