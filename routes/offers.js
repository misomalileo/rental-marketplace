const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Offer = require('../models/Offer');
const House = require('../models/House');
const User = require('../models/User');

// POST /api/offers – create an offer
router.post('/', auth, async (req, res) => {
  try {
    const { houseId, proposedPrice, moveInDate, tenantComment } = req.body;

    if (!houseId || !proposedPrice || !moveInDate) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const house = await House.findById(houseId);
    if (!house) return res.status(404).json({ message: 'House not found' });
    if (house.owner.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot bid on your own property' });
    }
    if (!house.allowBidding) {
      return res.status(400).json({ message: 'Bidding is disabled for this property' });
    }

    const existingPending = await Offer.findOne({
      houseId,
      tenantId: req.user.id,
      status: { $in: ['pending', 'countered'] }
    });
    if (existingPending) {
      return res.status(400).json({ message: 'You already have a pending offer on this property' });
    }

    const offer = new Offer({
      houseId,
      tenantId: req.user.id,
      proposedPrice,
      moveInDate,
      tenantComment,
      status: 'pending'
    });
    await offer.save();

    let tenantName = 'A tenant';
    try {
      const tenant = await User.findById(req.user.id);
      if (tenant && tenant.name) tenantName = tenant.name;
    } catch (err) {}

    const landlord = await User.findById(house.owner);
    if (landlord) {
      landlord.notifications.unshift(JSON.stringify({
        title: 'New Rental Offer',
        message: `${tenantName} offered MWK ${proposedPrice.toLocaleString()} for ${house.name}`,
        type: 'offer',
        read: false,
        createdAt: new Date()
      }));
      await landlord.save();
    }

    const io = req.app.get('io');
    if (io) io.to(house.owner.toString()).emit('newNotification', { message: `New offer on ${house.name}` });

    res.status(201).json(offer);
  } catch (err) {
    console.error('Offer creation error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// GET /api/offers/my/house/:houseId – tenant's offer for a specific house (NEW)
router.get('/my/house/:houseId', auth, async (req, res) => {
  try {
    const offer = await Offer.findOne({
      houseId: req.params.houseId,
      tenantId: req.user.id
    }).populate('houseId', 'name');
    if (!offer) return res.json(null);
    res.json(offer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/offers/house/:houseId/highest – highest active offer (premium only)
router.get('/house/:houseId/highest', auth, async (req, res) => {
  try {
    const house = await House.findById(req.params.houseId);
    if (!house) return res.status(404).json({ message: 'House not found' });
    if (!house.showHighestBidToPremium) return res.json(null);

    const user = await User.findById(req.user.id);
    if (!user.isPremium && !user.isAdmin) return res.json(null);

    const highest = await Offer.findOne({
      houseId: req.params.houseId,
      status: { $in: ['pending', 'countered'] }
    }).sort({ proposedPrice: -1 });
    res.json(highest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/offers/house/:houseId – all offers for a house (landlord only)
router.get('/house/:houseId', auth, async (req, res) => {
  try {
    const house = await House.findById(req.params.houseId);
    if (!house) return res.status(404).json({ message: 'House not found' });
    if (house.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const offers = await Offer.find({ houseId: req.params.houseId })
      .populate('tenantId', 'name email profilePicture')
      .sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/offers/my – offers made by the logged-in tenant
router.get('/my', auth, async (req, res) => {
  try {
    const offers = await Offer.find({ tenantId: req.user.id })
      .populate('houseId', 'name location images price type')
      .sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/offers/my-houses – all offers for landlord's houses
router.get('/my-houses', auth, async (req, res) => {
  try {
    const houses = await House.find({ owner: req.user.id }).select('_id');
    const houseIds = houses.map(h => h._id);
    const offers = await Offer.find({ houseId: { $in: houseIds } })
      .populate('houseId', 'name location')
      .populate('tenantId', 'name email')
      .sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/offers/:id/accept – accept an offer
router.put('/:id/accept', auth, async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id).populate('houseId');
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (offer.houseId.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (offer.status !== 'pending' && offer.status !== 'countered') {
      return res.status(400).json({ message: 'Offer already processed' });
    }
    offer.status = 'accepted';
    await offer.save();

    const tenant = await User.findById(offer.tenantId);
    if (tenant) {
      tenant.notifications.unshift(JSON.stringify({
        title: 'Offer Accepted!',
        message: `Your offer of MWK ${offer.proposedPrice.toLocaleString()} for ${offer.houseId.name} has been accepted.`,
        type: 'offer_accepted',
        read: false,
        createdAt: new Date()
      }));
      await tenant.save();
    }

    const io = req.app.get('io');
    if (io) io.to(offer.tenantId.toString()).emit('newNotification', { message: 'Your offer was accepted!' });

    res.json({ message: 'Offer accepted', offer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/offers/:id/reject – reject an offer
router.put('/:id/reject', auth, async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id).populate('houseId');
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (offer.houseId.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    offer.status = 'rejected';
    await offer.save();

    const tenant = await User.findById(offer.tenantId);
    if (tenant) {
      tenant.notifications.unshift(JSON.stringify({
        title: 'Offer Rejected',
        message: `Your offer for ${offer.houseId.name} was rejected.`,
        type: 'offer_rejected',
        read: false,
        createdAt: new Date()
      }));
      await tenant.save();
    }

    const io = req.app.get('io');
    if (io) io.to(offer.tenantId.toString()).emit('newNotification', { message: 'Your offer was rejected' });

    res.json({ message: 'Offer rejected', offer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/offers/:id/counter – counter an offer
router.put('/:id/counter', auth, async (req, res) => {
  try {
    const { counterOfferPrice, moveInDate, landlordComment } = req.body;
    const offer = await Offer.findById(req.params.id).populate('houseId');
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (offer.houseId.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    offer.status = 'countered';
    offer.counterOfferPrice = counterOfferPrice;
    offer.counterOfferDate = moveInDate ? new Date(moveInDate) : offer.moveInDate;
    offer.landlordComment = landlordComment;
    await offer.save();

    const tenant = await User.findById(offer.tenantId);
    if (tenant) {
      tenant.notifications.unshift(JSON.stringify({
        title: 'Counter Offer Received',
        message: `Landlord countered with MWK ${counterOfferPrice.toLocaleString()} for ${offer.houseId.name}`,
        type: 'offer_countered',
        read: false,
        createdAt: new Date()
      }));
      await tenant.save();
    }

    const io = req.app.get('io');
    if (io) io.to(offer.tenantId.toString()).emit('newNotification', { message: 'You received a counter offer' });

    res.json({ message: 'Counter offer sent', offer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;