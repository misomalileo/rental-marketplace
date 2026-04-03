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
  if (!negotiation.utilitiesIncluded) {
    suggestions.push({
      title: 'Utility Bills',
      description: `Specify who pays for water and electricity.`,
      reasoning: 'In Malawi, it is common for tenants to pay for their own electricity and water unless otherwise agreed.'
    });
  }
  return suggestions;
}

// Helper: generate beautiful PDF
async function generateBeautifulPDF(negotiation, house, landlord, tenant, isFinal = true) {
  return new Promise((resolve, reject) => {
    const contractDir = path.join(__dirname, '../contracts');
    if (!fs.existsSync(contractDir)) fs.mkdirSync(contractDir, { recursive: true });
    const pdfPath = path.join(contractDir, `contract_${negotiation._id}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Add subtle background color
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fef9e8');

    // Header with gradient-like effect (using rectangle)
    doc.rect(0, 0, doc.page.width, 80).fill('#1e3a5f');
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
      .text('🏠 RESIDENTIAL LEASE AGREEMENT', 50, 25, { align: 'center' });
    doc.fillColor('#f1c40f').fontSize(12).font('Helvetica')
      .text('Malawi Standard Tenancy Contract', 50, 55, { align: 'center' });

    // Content area
    let y = 100;
    doc.fillColor('#2c3e50').fontSize(10).font('Helvetica');

    // Date
    doc.text(`📅 Date: ${new Date().toLocaleDateString()}`, 50, y);
    y += 20;

    // Property and parties
    doc.font('Helvetica-Bold').text('1. PARTIES & PROPERTY', 50, y);
    y += 15;
    doc.font('Helvetica')
      .text(`Property Address: ${house.name}, ${house.location}`, 60, y)
      .text(`Landlord: ${landlord.name} (${landlord.email})`, 60, y + 15)
      .text(`Tenant: ${tenant.name} (${tenant.email})`, 60, y + 30);
    y += 60;

    // Lease terms in a nice box
    doc.rect(50, y, doc.page.width - 100, 100).stroke('#3498db');
    doc.fillColor('#3498db').font('Helvetica-Bold').text('LEASE TERMS', 55, y + 5);
    doc.fillColor('#2c3e50').font('Helvetica')
      .text(`Start Date: ${new Date(negotiation.leaseStartDate).toLocaleDateString()}`, 60, y + 25)
      .text(`End Date: ${new Date(negotiation.leaseEndDate).toLocaleDateString()}`, 60, y + 40)
      .text(`Monthly Rent: MWK ${negotiation.rentAmount.toLocaleString()}`, 60, y + 55)
      .text(`Security Deposit: MWK ${negotiation.depositAmount.toLocaleString()} (refundable)`, 60, y + 70);
    y += 110;

    // Additional clauses
    doc.font('Helvetica-Bold').text('2. ADDITIONAL CLAUSES', 50, y);
    y += 15;
    doc.font('Helvetica');
    negotiation.clauses.forEach((clause, idx) => {
      const text = `${idx + 1}. ${clause.title}: ${clause.description}`;
      doc.text(text, 60, y);
      y += 18;
      if (y > 700) { doc.addPage(); y = 50; }
    });
    y += 10;

    // Standard Malawi clauses
    doc.font('Helvetica-Bold').text('3. STANDARD CONDITIONS (Malawi Law)', 50, y);
    y += 15;
    doc.font('Helvetica')
      .text(`• Notice Period: ${negotiation.noticePeriodDays} days`, 60, y)
      .text(`• Late Fee: ${negotiation.lateFeePercentage}% of monthly rent per day (after 5 days grace)`, 60, y + 15)
      .text(`• Maintenance: ${negotiation.maintenanceResponsibility} responsible for major repairs`, 60, y + 30)
      .text(`• Utilities: ${negotiation.utilitiesIncluded ? 'Included in rent' : 'Tenant pays separately'}`, 60, y + 45)
      .text(`• Pets: ${negotiation.petPolicy}`, 60, y + 60);
    y += 85;

    // Governing law
    doc.font('Helvetica-Bold').text('4. GOVERNING LAW', 50, y);
    y += 15;
    doc.font('Helvetica')
      .text('This agreement is governed by the laws of Malawi, including the Rented Premises (Control of Rent) Act and common law principles.', 60, y);
    y += 40;

    // Signature area
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
    y += 10;
    doc.font('Helvetica').text('Signed by:', 50, y);
    y += 20;
    doc.text(`Landlord: ___________________  Date: __________`, 60, y);
    doc.text(`Tenant:  ___________________  Date: __________`, 60, y + 20);

    // Footer
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fillColor('#95a5a6').fontSize(8)
        .text(`Khomo Lathu - Trusted Rentals in Malawi | Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 30, { align: 'center' });
    }

    doc.end();
    writeStream.on('finish', () => resolve(pdfPath));
    writeStream.on('error', reject);
  });
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
      tenantId: null,
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
    console.error(err);
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

// Finalize and generate beautiful PDF
router.post('/finalize/:negotiationId', auth, async (req, res) => {
  try {
    const negotiation = await LeaseNegotiation.findById(req.params.negotiationId);
    if (!negotiation) return res.status(404).json({ message: 'Negotiation not found' });
    if (negotiation.landlordId.toString() !== req.user.id && (!negotiation.tenantId || negotiation.tenantId.toString() !== req.user.id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (!negotiation.tenantId) return res.status(400).json({ message: 'Tenant must join first' });
    const allAgreed = negotiation.clauses.every(c => c.isAgreed);
    if (!allAgreed) return res.status(400).json({ message: 'Not all clauses agreed' });

    negotiation.status = 'agreed';
    await negotiation.save();

    const house = await House.findById(negotiation.houseId);
    const landlord = await User.findById(negotiation.landlordId);
    const tenant = await User.findById(negotiation.tenantId);
    const pdfPath = await generateBeautifulPDF(negotiation, house, landlord, tenant, true);
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

// Download PDF directly (with inline display)
router.get('/download/:contractId', auth, async (req, res) => {
  try {
    const contract = await SmartContract.findById(req.params.contractId);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    const userId = req.user.id;
    if (contract.landlordId.toString() !== userId && contract.tenantId.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const filePath = path.join(__dirname, '../contracts', `contract_${contract.negotiationId}.pdf`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'PDF not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline'); // Show in browser, not download
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Setup recurring payment (unchanged)
router.post('/setup-payment', auth, async (req, res) => {
  try {
    const { contractId, paymentMethod, phoneNumber } = req.body;
    const contract = await SmartContract.findById(contractId);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    if (contract.tenantId.toString() !== req.user.id) return res.status(403).json({ message: 'Only tenant can setup payment' });
    if (contract.status !== 'active') return res.status(400).json({ message: 'Contract not active yet' });
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

// Process auto payment (unchanged)
router.post('/process-payment/:paymentId', auth, async (req, res) => {
  try {
    const payment = await RecurringPayment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status !== 'active') return res.json({ message: 'Payment not active' });
    const transactionId = 'TXN' + Date.now();
    payment.paymentHistory.push({ amount: payment.amount, date: new Date(), transactionId, status: 'success' });
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

// Get all lease negotiations for landlord
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

// Check existing negotiation for tenant
router.get('/check/:houseId', auth, async (req, res) => {
  try {
    const negotiation = await LeaseNegotiation.findOne({
      houseId: req.params.houseId,
      status: { $in: ['draft', 'negotiating', 'agreed'] }
    });
    res.json(negotiation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Terminate lease
router.put('/terminate/:contractId', auth, async (req, res) => {
  try {
    const contract = await SmartContract.findById(req.params.contractId);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    const userId = req.user.id;
    if (contract.landlordId.toString() !== userId && contract.tenantId.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (contract.status !== 'active') return res.status(400).json({ message: 'Only active contracts can be terminated' });
    contract.status = 'terminated';
    await contract.save();
    await LeaseNegotiation.findByIdAndUpdate(contract.negotiationId, { status: 'expired' });
    res.json({ message: 'Lease terminated successfully', contract });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Lease route is working!' });
});

module.exports = router;