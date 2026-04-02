const mongoose = require('mongoose');

const LeaseNegotiationSchema = new mongoose.Schema({
  houseId: { type: mongoose.Schema.Types.ObjectId, ref: 'House', required: true },
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['draft', 'negotiating', 'agreed', 'signed', 'expired'],
    default: 'draft'
  },
  clauses: [{
    title: String,
    description: String,
    suggestedBy: { type: String, enum: ['ai', 'landlord', 'tenant'] },
    isAgreed: { type: Boolean, default: false },
    isAiSuggestion: { type: Boolean, default: false }
  }],
  rentAmount: { type: Number, required: true },
  depositAmount: { type: Number, required: true },
  leaseStartDate: { type: Date, required: true },
  leaseEndDate: { type: Date, required: true },
  noticePeriodDays: { type: Number, default: 30 },
  lateFeePercentage: { type: Number, default: 5 },
  maintenanceResponsibility: { type: String, default: 'Landlord' },
  utilitiesIncluded: { type: Boolean, default: false },
  petPolicy: { type: String, default: 'Not allowed' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  leaseScore: { type: Number, default: 0 },
  aiSuggestions: [{
    title: String,
    description: String,
    reasoning: String
  }]
});

module.exports = mongoose.model('LeaseNegotiation', LeaseNegotiationSchema);