const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');
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

// ============================================================
// NEW: Professional Malawi Tenancy Agreement PDF Generator
// ============================================================
async function generatePDFWithSignatures(negotiation, house, landlord, tenant, signatureLandlord, signatureTenant) {
  return new Promise((resolve, reject) => {
    const contractDir = path.join(__dirname, '../contracts');
    if (!fs.existsSync(contractDir)) fs.mkdirSync(contractDir, { recursive: true });
    const pdfPath = path.join(contractDir, `contract_${negotiation._id}.pdf`);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Helper to draw a horizontal line
    const hr = (y) => {
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).stroke('#cccccc');
      return y + 10;
    };

    // Helper to add a new page if needed
    const checkPageBreak = (requiredSpace) => {
      if (doc.y + requiredSpace > doc.page.height - 50) {
        doc.addPage();
        doc.y = 50;
      }
    };

    // ----- Title & Header -----
    doc.rect(0, 0, doc.page.width, 100).fill('#1e3a5f');
    doc.fillColor('white')
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('TENANCY AGREEMENT', 50, 35, { align: 'center' });
    doc.fontSize(12)
      .font('Helvetica')
      .text('(MALAWI)', 50, 65, { align: 'center' });
    doc.fillColor('#333333');

    // Date line
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.fontSize(10)
      .text(`This Tenancy Agreement is made on this ${today}`, 50, 120, { align: 'center' });
    doc.moveDown(0.5);

    // 1. PARTIES
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('1. PARTIES', 50, doc.y + 10);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    doc.text(`Landlord:`, 60, doc.y + 5);
    doc.text(`${landlord.name}`, 70, doc.y + 5);
    doc.text(`Of ${landlord.address || 'Not specified'}`, 70, doc.y + 5);
    doc.moveDown();
    doc.text(`Tenant:`, 60, doc.y);
    doc.text(`${tenant.name}`, 70, doc.y);
    doc.text(`Principal place of business / residence: ${tenant.address || tenant.email}`, 70, doc.y + 15);
    doc.moveDown(2);

    // 2. PREMISES
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('2. PREMISES', 50, doc.y + 10);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    doc.text(`The Landlord hereby agrees to lease to the Tenant, and the Tenant agrees to rent, the property located at:`, 50, doc.y + 5);
    doc.font('Helvetica-Bold').text(`${house.name}, ${house.location}`, 60, doc.y + 20);
    doc.font('Helvetica').text(`(hereinafter referred to as "the Property")`, 60, doc.y + 35);
    doc.moveDown(3);

    // 3. TERM OF TENANCY
    const startDate = new Date(negotiation.leaseStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const endDate = negotiation.leaseEndDate ? new Date(negotiation.leaseEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'month-to-month';
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('3. TERM OF TENANCY', 50, doc.y + 10);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    doc.text(`The tenancy shall commence on ${startDate} and shall continue on a month-to-month basis unless terminated in accordance with this Agreement.`, 50, doc.y + 5);
    doc.moveDown(2);

    // 4. RENT AND PAYMENT TERMS
    const monthlyRent = negotiation.rentAmount.toLocaleString();
    const threeMonthsAdvance = (negotiation.rentAmount * 3).toLocaleString();
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('4. RENT AND PAYMENT TERMS', 50, doc.y + 10);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    doc.text(`a) The Tenant shall pay rent of: MWK ${monthlyRent} per month`, 60, doc.y + 5);
    doc.text(`b) The Tenant shall pay three (3) months’ rent in advance prior to occupancy, on or before ${startDate}. Amount: MWK ${threeMonthsAdvance}`, 60, doc.y + 20);
    doc.text(`c) All rent payments shall be made in a manner agreed upon by both parties.`, 60, doc.y + 35);
    doc.moveDown(3);

    // 5. MAINTENANCE AND REPAIRS
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('5. MAINTENANCE AND REPAIRS', 50, doc.y + 10);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    doc.text(`a) The Tenant shall keep the Property in good and tenantable condition at all times.`, 60, doc.y + 5);
    doc.text(`b) The Tenant shall be responsible for routine maintenance and repairs during the tenancy period.`, 60, doc.y + 20);
    doc.text(`c) The Tenant shall not be responsible for damages resulting from the Landlord’s negligence or structural defects.`, 60, doc.y + 35);
    doc.moveDown(3);

    // 6. UTILITIES
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('6. UTILITIES', 50, doc.y + 10);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    doc.text(`The Tenant shall be responsible for payment of all utility bills related to the Property, including but not limited to:`, 50, doc.y + 5);
    doc.text(`• Electricity`, 70, doc.y + 20);
    doc.text(`• Water`, 70, doc.y + 35);
    doc.text(`• Any other applicable services`, 70, doc.y + 50);
    doc.moveDown(4);

    // 7. TERMINATION
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('7. TERMINATION', 50, doc.y + 10);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    doc.text(`a) Either party may terminate this Agreement by providing ${negotiation.noticePeriodDays || 30} days written notice.`, 60, doc.y + 5);
    doc.text(`b) Upon termination, the Tenant shall:`, 60, doc.y + 20);
    doc.text(`   • Vacate the Property`, 70, doc.y + 35);
    doc.text(`   • Return it in the same condition as received`, 70, doc.y + 50);
    doc.text(`   • Allow for reasonable wear and tear`, 70, doc.y + 65);
    doc.moveDown(5);

    // 8. GOVERNING LAW
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('8. GOVERNING LAW', 50, doc.y + 10);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    doc.text(`This Agreement shall be governed and interpreted in accordance with the laws of the Republic of Malawi.`, 50, doc.y + 5);
    doc.moveDown(2);

    // 9. ADDITIONAL TERMS (custom clauses from negotiation)
    if (negotiation.clauses && negotiation.clauses.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('9. ADDITIONAL TERMS', 50, doc.y + 10);
      doc.fillColor('#333333').fontSize(10).font('Helvetica');
      let yOffset = doc.y + 5;
      negotiation.clauses.forEach((clause, idx) => {
        if (!clause.isAgreed) return; // only show agreed clauses
        const text = `${idx + 1}. ${clause.title}: ${clause.description}`;
        checkPageBreak(20);
        doc.text(text, 60, yOffset);
        yOffset += 20;
      });
      doc.y = yOffset + 10;
    } else {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('9. ADDITIONAL TERMS', 50, doc.y + 10);
      doc.fillColor('#333333').fontSize(10).font('Helvetica');
      doc.text(`Any additional terms and conditions shall be agreed upon by both parties, documented in writing, and form part of this Agreement as an addendum.`, 50, doc.y + 5);
      doc.moveDown(2);
    }

    // 10. SIGNATURES
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('10. SIGNATURES', 50, doc.y + 15);
    doc.fillColor('#333333').fontSize(10).font('Helvetica');
    let sigY = doc.y + 10;
    checkPageBreak(180);
    
    // Landlord signature
    doc.text(`FOR THE LANDLORD`, 60, sigY);
    doc.text(`Name: ${landlord.name}`, 70, sigY + 15);
    if (signatureLandlord) {
      try {
        const base64Data = signatureLandlord.replace(/^data:image\/png;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        doc.image(imgBuffer, 70, sigY + 30, { width: 100 });
      } catch(e) {
        doc.text(`___________________`, 70, sigY + 40);
      }
    } else {
      doc.text(`___________________`, 70, sigY + 40);
    }
    doc.text(`Date: ______________`, 70, sigY + 70);
    
    // Tenant signature
    doc.text(`FOR THE TENANT`, 300, sigY);
    doc.text(`Name: ${tenant.name}`, 310, sigY + 15);
    if (signatureTenant) {
      try {
        const base64Data = signatureTenant.replace(/^data:image\/png;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        doc.image(imgBuffer, 310, sigY + 30, { width: 100 });
      } catch(e) {
        doc.text(`___________________`, 310, sigY + 40);
      }
    } else {
      doc.text(`___________________`, 310, sigY + 40);
    }
    doc.text(`Date: ______________`, 310, sigY + 70);

    // Witnesses (optional)
    const witnessY = sigY + 110;
    checkPageBreak(80);
    doc.fontSize(10).font('Helvetica-Bold').text(`WITNESSES (Optional but Recommended)`, 50, witnessY);
    doc.fontSize(10).font('Helvetica');
    doc.text(`1. Name: __________________________`, 70, witnessY + 15);
    doc.text(`   Signature: ______________________`, 70, witnessY + 30);
    doc.text(`   Date: __________________________`, 70, witnessY + 45);
    doc.text(`2. Name: __________________________`, 70, witnessY + 60);
    doc.text(`   Signature: ______________________`, 70, witnessY + 75);
    doc.text(`   Date: __________________________`, 70, witnessY + 90);

    // Footer with page numbers
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

// Alias for initial PDF (without signatures)
async function generateBeautifulPDF(negotiation, house, landlord, tenant) {
  return generatePDFWithSignatures(negotiation, house, landlord, tenant, null, null);
}

// ========== ROUTES (unchanged from original) ==========

router.get('/test', (req, res) => {
  res.json({ message: 'Lease route is working!' });
});

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
    await generateBeautifulPDF(negotiation, house, landlord, tenant);
    const pdfUrl = `/api/lease/download-temp/${negotiation._id}`;

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

router.put('/sign/:contractId', auth, async (req, res) => {
  try {
    const { signature } = req.body;
    const contract = await SmartContract.findById(req.params.contractId);
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    const userId = req.user.id;
    let updated = false;
    if (contract.landlordId.toString() === userId) {
      contract.signedByLandlord = true;
      contract.landlordSignature = signature;
      updated = true;
    } else if (contract.tenantId.toString() === userId) {
      contract.signedByTenant = true;
      contract.tenantSignature = signature;
      updated = true;
    } else {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (updated) await contract.save();

    if (contract.signedByLandlord && contract.signedByTenant) {
      contract.status = 'active';
      contract.signedAt = new Date();
      await contract.save();
      await LeaseNegotiation.findByIdAndUpdate(contract.negotiationId, { status: 'signed' });

      const house = await House.findById(contract.houseId);
      if (house && house.rentalStatus === 'available') {
        house.rentalStatus = 'rented';
        await house.save();
        console.log(`✅ House ${house._id} automatically marked as rented after lease signing`);
      }

      const negotiation = await LeaseNegotiation.findById(contract.negotiationId);
      const houseForPDF = await House.findById(contract.houseId);
      const landlord = await User.findById(contract.landlordId);
      const tenant = await User.findById(contract.tenantId);
      await generatePDFWithSignatures(negotiation, houseForPDF, landlord, tenant, contract.landlordSignature, contract.tenantSignature);
      
      const signedPdfUrl = `/api/lease/download-temp/${negotiation._id}`;
      return res.json({ contract, signedPdfUrl });
    }
    res.json(contract);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

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

router.get('/download-temp/:negotiationId', auth, async (req, res) => {
  try {
    const negotiation = await LeaseNegotiation.findById(req.params.negotiationId);
    if (!negotiation) return res.status(404).json({ message: 'Negotiation not found' });
    const userId = req.user.id;
    const isLandlord = negotiation.landlordId.toString() === userId;
    const isTenant = negotiation.tenantId && negotiation.tenantId.toString() === userId;
    if (!isLandlord && !isTenant) return res.status(403).json({ message: 'Not authorized' });
    const filePath = path.join(__dirname, '../contracts', `contract_${negotiation._id}.pdf`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'PDF not found' });
    const token = jwt.sign({ negotiationId: negotiation._id, userId }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const downloadUrl = `/api/lease/download-signed/${token}`;
    res.json({ downloadUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/download-signed/:token', async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const negotiation = await LeaseNegotiation.findById(decoded.negotiationId);
    if (!negotiation) return res.status(404).json({ message: 'Negotiation not found' });
    const filePath = path.join(__dirname, '../contracts', `contract_${negotiation._id}.pdf`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'PDF not found' });
    res.download(filePath, `Lease_Agreement_${negotiation._id}.pdf`);
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: 'Invalid or expired link' });
  }
});

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

module.exports = router;