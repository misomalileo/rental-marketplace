const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const LeaseNegotiation = require('../models/LeaseNegotiation');
const SmartContract = require('../models/SmartContract');
const RecurringPayment = require('../models/RecurringPayment');
const House = require('../models/House');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper: calculate lease score (0-100)
function calculateLeaseScore(negotiation) {
  let score = 70;
  if (negotiation.rentAmount > 0 && negotiation.rentAmount < 1000000) score += 5;
  if (negotiation.depositAmount <= negotiation.rentAmount * 2) score += 5;
  if (negotiation.noticePeriodDays <= 30) score += 5;
  if (negotiation.lateFeePercentage <= 5) score += 5;
  if (negotiation.maintenanceResponsibility === 'Landlord') score += 5;
  if (negotiation.utilitiesIncluded) score += 3;
  if (negotiation.clauses.filter(c => c.isAgreed).length > 5) score += 2;
  return Math.min(100, Math.max(0, score));
}

// AI clause suggestions (rule-based, Malawi specific)
function generateAiSuggestions(negotiation) {
  const suggestions = [];
  if (negotiation.depositAmount > negotiation.rentAmount * 3) {
    suggestions.push({
      title: 'Deposit Amount',
      description: `Consider lowering deposit to ${negotiation.rentAmount * 2} MWK (2 months rent).`,
      reasoning: 'Standard practice in Malawi is 2 months rent deposit. High deposits may deter tenants.'
    });
  }
  if (negotiation.noticePeriodDays > 60) {
    suggestions.push({
      title: 'Notice Period',
      description: `Reduce notice period to 30 days.`,
      reasoning: 'Under Malawi law, 30 days is reasonable. Longer periods may be unfair.'
    });
  }
  if (negotiation.lateFeePercentage > 10) {
    suggestions.push({
      title: 'Late Fee',
      description: `Reduce late fee to 5% of rent.`,
      reasoning: 'Excessive late fees may be considered unfair under Malawian consumer protection laws.'
    });
  }
  if (negotiation.maintenanceResponsibility !== 'Landlord') {
    suggestions.push({
      title: 'Maintenance Responsibility',
      description: `Shift major repairs to landlord.`,
      reasoning: 'The landlord is typically responsible for structural repairs (Malawi Tenancy Guidelines).'
    });
  }
  if (negotiation.petPolicy === 'Not allowed') {
    suggestions.push({
      title: 'Pet Policy',
      description: `Consider allowing small pets with a pet deposit.`,
      reasoning: 'Many tenants have pets. A refundable pet deposit protects the landlord while attracting more renters.'
    });
  }
  // Malawi-specific: water & electricity bills
  if (!negotiation.utilitiesIncluded) {
    suggestions.push({
      title: 'Utility Bills',
      description: `Specify who pays for water and electricity.`,
      reasoning: 'In Malawi, it is common for tenants to pay for their own electricity and water unless otherwise agreed.'
    });
  }
  return suggestions;
}

// Start a new lease negotiation (landlord)
router.post('/start', auth, async (req, res) => {
  try {
    const { houseId, rentAmount, depositAmount, leaseStartDate, leaseEndDate } = req.body;
    const house = await House.findById(houseId);
    if (!house) return res.status(404).json({ message: 'House not found' });
    if (house.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only landlord can start lease negotiation' });
    }
    const existing = await LeaseNegotiation.findOne({ houseId, landlordId: req.user.id, status: { $in: ['draft', 'negotiating'] } });
    if (existing) return res.status(400).json({ message: 'Active negotiation already exists' });

    const negotiation = new LeaseNegotiation({
      houseId,
      landlordId: req.user.id,
      tenantId: null, // ✅ allowed
      rentAmount,
      depositAmount,
      leaseStartDate,
      leaseEndDate,
      clauses: [
        { title: 'Rent Amount', description: `${rentAmount} MWK per month`, suggestedBy: 'landlord', isAgreed: true },
        { title: 'Deposit', description: `${depositAmount} MWK (refundable)`, suggestedBy: 'landlord', isAgreed: true },
        { title: 'Lease Term', description: `${new Date(leaseStartDate).toLocaleDateString()} to ${new Date(leaseEndDate).toLocaleDateString()}`, suggestedBy: 'landlord', isAgreed: true }
      ]
    });
    negotiation.leaseScore = calculateLeaseScore(negotiation);
    negotiation.aiSuggestions = generateAiSuggestions(negotiation);
    await negotiation.save();
    res.status(201).json(negotiation);
  } catch (err) {
    console.error('Start lease error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Join negotiation (tenant)
router.post('/join/:negotiationId', auth, async (req, res) => {
  try {
    const negotiation = await LeaseNegotiation.findById(req.params.negotiationId);
    if (!negotiation) return res.status(404).json({ message: 'Negotiation not found' });
    if (negotiation.tenantId) return res.status(400).json({ message: 'Tenant already joined' });
    negotiation.tenantId = req.user.id;
    negotiation.status = 'negotiating';
    await negotiation.save();
    res.json(negotiation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add or update a clause
router.put('/clause/:negotiationId', auth, async (req, res) => {
  try {
    const { title, description } = req.body;
    const negotiation = await LeaseNegotiation.findById(req.params.negotiationId);
    if (!negotiation) return res.status(404).json({ message: 'Negotiation not found' });
    const userId = req.user.id;
    const isLandlord = negotiation.landlordId.toString() === userId;
    const isTenant = negotiation.tenantId && negotiation.tenantId.toString() === userId;
    if (!isLandlord && !isTenant) return res.status(403).json({ message: 'Not authorized' });

    const existingClause = negotiation.clauses.find(c => c.title === title);
    if (existingClause) {
      existingClause.description = description;
      existingClause.suggestedBy = isLandlord ? 'landlord' : 'tenant';
      existingClause.isAgreed = false;
    } else {
      negotiation.clauses.push({
        title,
        description,
        suggestedBy: isLandlord ? 'landlord' : 'tenant',
        isAgreed: false
      });
    }
    negotiation.updatedAt = new Date();
    negotiation.leaseScore = calculateLeaseScore(negotiation);
    negotiation.aiSuggestions = generateAiSuggestions(negotiation);
    await negotiation.save();
    res.json(negotiation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Agree to a clause
router.put('/agree/:negotiationId/:clauseIndex', auth, async (req, res) => {
  try {
    const negotiation = await LeaseNegotiation.findById(req.params.negotiationId);
    if (!negotiation) return res.status(404).json({ message: 'Negotiation not found' });
    const userId = req.user.id;
    const isLandlord = negotiation.landlordId.toString() === userId;
    const isTenant = negotiation.tenantId && negotiation.tenantId.toString() === userId;
    if (!isLandlord && !isTenant) return res.status(403).json({ message: 'Not authorized' });

    const clause = negotiation.clauses[req.params.clauseIndex];
    if (!clause) return res.status(404).json({ message: 'Clause not found' });
    clause.isAgreed = true;
    negotiation.updatedAt = new Date();
    negotiation.leaseScore = calculateLeaseScore(negotiation);
    await negotiation.save();
    res.json(negotiation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Finalize and generate PDF (only after tenant has joined and all clauses agreed)
router.post('/finalize/:negotiationId', auth, async (req, res) => {
  try {
    const negotiation = await LeaseNegotiation.findById(req.params.negotiationId);
    if (!negotiation) return res.status(404).json({ message: 'Negotiation not found' });
    if (negotiation.landlordId.toString() !== req.user.id && negotiation.tenantId?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    // ✅ Check that tenant has joined
    if (!negotiation.tenantId) {
      return res.status(400).json({ message: 'Tenant must join the negotiation first.' });
    }
    const allAgreed = negotiation.clauses.every(c => c.isAgreed);
    if (!allAgreed) return res.status(400).json({ message: 'Not all clauses are agreed yet' });

    negotiation.status = 'agreed';
    await negotiation.save();

    const house = await House.findById(negotiation.houseId);
    const landlord = await User.findById(negotiation.landlordId);
    const tenant = await User.findById(negotiation.tenantId);
    const contractDir = path.join(__dirname, '../contracts');
    if (!fs.existsSync(contractDir)) fs.mkdirSync(contractDir, { recursive: true });
    const pdfPath = path.join(contractDir, `contract_${negotiation._id}.pdf`);
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Generate PDF with Malawi law compliance
    doc.fontSize(20).text('RESIDENTIAL LEASE AGREEMENT (Malawi)', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Property: ${house.name}, ${house.location}`);
    doc.text(`Landlord: ${landlord.name} (${landlord.email})`);
    doc.text(`Tenant: ${tenant.name} (${tenant.email})`);
    doc.moveDown();
    doc.text('1. TERM: The lease shall commence on ' + new Date(negotiation.leaseStartDate).toLocaleDateString() + 
              ' and end on ' + new Date(negotiation.leaseEndDate).toLocaleDateString() + '.');
    doc.text(`2. RENT: MWK ${negotiation.rentAmount.toLocaleString()} per month, payable on the 1st day of each month.`);
    doc.text(`3. DEPOSIT: MWK ${negotiation.depositAmount.toLocaleString()} (refundable, subject to deductions for damages beyond normal wear and tear).`);
    doc.text(`4. NOTICE PERIOD: ${negotiation.noticePeriodDays} days.`);
    doc.text(`5. LATE FEE: ${negotiation.lateFeePercentage}% of monthly rent per day after grace period of 5 days.`);
    doc.text(`6. MAINTENANCE: ${negotiation.maintenanceResponsibility} is responsible for major repairs. Tenant responsible for minor maintenance and cleanliness.`);
    doc.text(`7. UTILITIES: ${negotiation.utilitiesIncluded ? 'Included in rent' : 'Tenant pays for electricity, water, and other utilities separately.'}`);
    doc.text(`8. PETS: ${negotiation.petPolicy}`);
    doc.moveDown();
    negotiation.clauses.forEach((clause, idx) => {
      doc.text(`${idx + 9}. ${clause.title}: ${clause.description}`);
    });
    doc.moveDown();
    doc.text('GOVERNING LAW: This agreement is governed by the laws of Malawi, including the Rented Premises (Control of Rent) Act and common law principles.');
    doc.moveDown();
    doc.text('Signed by:');
    doc.text(`Landlord: ___________________  Date: __________`);
    doc.text(`Tenant:  ___________________  Date: __________`);
    doc.end();

    writeStream.on('finish', async () => {
      const pdfUrl = `/contracts/contract_${negotiation._id}.pdf`;
      const smartContract = new SmartContract({
        negotiationId: negotiation._id,
        houseId: negotiation.houseId,
        landlordId: negotiation.landlordId,
        tenantId: negotiation.tenantId,
        pdfUrl,
        status: 'pending'
      });
      await smartContract.save();
      res.json({ smartContract, pdfUrl });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// Sign contract
router.put('/sign/:contractId', auth, async (req, res) => {
  try {
    const contract = await SmartContract.findById(req.params.contractId);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    const userId = req.user.id;
    if (contract.landlordId.toString() === userId) {
      contract.signedByLandlord = true;
    } else if (contract.tenantId.toString() === userId) {
      contract.signedByTenant = true;
    } else {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (contract.signedByLandlord && contract.signedByTenant) {
      contract.status = 'active';
      contract.signedAt = new Date();
      await LeaseNegotiation.findByIdAndUpdate(contract.negotiationId, { status: 'signed' });
    }
    await contract.save();
    res.json(contract);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get contract details
router.get('/contract/:contractId', auth, async (req, res) => {
  try {
    const contract = await SmartContract.findById(req.params.contractId)
      .populate('houseId', 'name location')
      .populate('landlordId', 'name email')
      .populate('tenantId', 'name email');
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    res.json(contract);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Setup recurring payment
router.post('/setup-payment', auth, async (req, res) => {
  try {
    const { contractId, paymentMethod, phoneNumber } = req.body;
    const contract = await SmartContract.findById(contractId);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    if (contract.tenantId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only tenant can setup payment' });
    }
    if (contract.status !== 'active') {
      return res.status(400).json({ message: 'Contract not active yet' });
    }
    const negotiation = await LeaseNegotiation.findById(contract.negotiationId);
    const recurring = new RecurringPayment({
      contractId: contract._id,
      tenantId: req.user.id,
      landlordId: contract.landlordId,
      amount: negotiation.rentAmount,
      paymentMethod,
      phoneNumber,
      nextDueDate: negotiation.leaseStartDate,
      status: 'active'
    });
    await recurring.save();
    res.json(recurring);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Process auto payment
router.post('/process-payment/:paymentId', auth, async (req, res) => {
  try {
    const payment = await RecurringPayment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status !== 'active') return res.json({ message: 'Payment not active' });
    const transactionId = 'TXN' + Date.now();
    payment.paymentHistory.push({
      amount: payment.amount,
      date: new Date(),
      transactionId,
      status: 'success'
    });
    const next = new Date(payment.nextDueDate);
    next.setMonth(next.getMonth() + 1);
    payment.nextDueDate = next;
    await payment.save();
    res.json({ message: 'Payment processed', transactionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get lease negotiation details
router.get('/:negotiationId', auth, async (req, res) => {
  try {
    const negotiation = await LeaseNegotiation.findById(req.params.negotiationId)
      .populate('houseId', 'name location images')
      .populate('landlordId', 'name email')
      .populate('tenantId', 'name email');
    if (!negotiation) return res.status(404).json({ message: 'Not found' });
    res.json(negotiation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all lease negotiations for the logged-in landlord (used in dashboard)
router.get('/my', auth, async (req, res) => {
  try {
    const leases = await LeaseNegotiation.find({ landlordId: req.user.id })
      .populate('houseId', 'name location')
      .populate('tenantId', 'name email')
      .sort({ createdAt: -1 });
    res.json(leases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({ message: 'Lease route is working!' });
});

module.exports = router;