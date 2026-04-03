const mongoose = require('mongoose');

const SmartContractSchema = new mongoose.Schema({
  negotiationId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaseNegotiation', required: true },
  houseId: { type: mongoose.Schema.Types.ObjectId, ref: 'House', required: true },
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pdfUrl: { type: String, required: true },
  signedByLandlord: { type: Boolean, default: false },
  signedByTenant: { type: Boolean, default: false },
  landlordSignature: { type: String, default: null },
  tenantSignature: { type: String, default: null },
  signedAt: { type: Date },
  status: { type: String, enum: ['pending', 'active', 'terminated', 'expired'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SmartContract', SmartContractSchema);