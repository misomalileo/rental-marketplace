const mongoose = require('mongoose');

const RecurringPaymentSchema = new mongoose.Schema({
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartContract', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['airtel', 'tnm', 'bank'], required: true },
  phoneNumber: { type: String }, // for mobile money
  nextDueDate: { type: Date, required: true },
  status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
  paymentHistory: [{
    amount: Number,
    date: Date,
    transactionId: String,
    status: { type: String, enum: ['success', 'failed', 'pending'] }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RecurringPayment', RecurringPaymentSchema);