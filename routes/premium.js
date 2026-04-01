const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const House = require('../models/House');

// Helper: check if user is premium user (active subscription)
const isPremiumUser = (user) => {
  return user.role === 'premium_user' && user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date();
};

// GET /api/premium/status – returns premium status, saved searches, notifications
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('role subscriptionExpiresAt savedSearches notifications');
    const isActive = isPremiumUser(user);
    res.json({
      isPremium: isActive,
      expiresAt: user.subscriptionExpiresAt,
      savedSearches: user.savedSearches || [],
      notifications: user.notifications || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/premium/saved-searches – create a new saved search
router.post('/saved-searches', auth, async (req, res) => {
  try {
    const { name, filters, alertEnabled } = req.body;
    const user = await User.findById(req.user.id);
    if (!isPremiumUser(user)) {
      return res.status(403).json({ message: 'Premium user required' });
    }
    user.savedSearches.push({
      name,
      filters,
      alertEnabled: alertEnabled !== false,
      createdAt: new Date()
    });
    await user.save();
    res.json({ savedSearches: user.savedSearches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/premium/saved-searches/:index – delete a saved search by index
router.delete('/saved-searches/:index', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const idx = parseInt(req.params.index);
    if (idx >= 0 && idx < user.savedSearches.length) {
      user.savedSearches.splice(idx, 1);
      await user.save();
    }
    res.json({ savedSearches: user.savedSearches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/premium/saved-searches/:index/alert – toggle alerts on/off
router.put('/saved-searches/:index/alert', auth, async (req, res) => {
  try {
    const { enabled } = req.body;
    const user = await User.findById(req.user.id);
    const idx = parseInt(req.params.index);
    if (idx >= 0 && idx < user.savedSearches.length) {
      user.savedSearches[idx].alertEnabled = enabled;
      await user.save();
    }
    res.json({ savedSearches: user.savedSearches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/premium/negotiate/:houseId – AI price negotiation suggestion
router.post('/negotiate/:houseId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!isPremiumUser(user)) {
      return res.status(403).json({ message: 'Premium user required' });
    }
    const house = await House.findById(req.params.houseId);
    if (!house) return res.status(404).json({ message: 'House not found' });

    // Find similar houses (same location, type, ±1 bedroom)
    const similar = await House.find({
      location: house.location,
      type: house.type,
      bedrooms: { $gte: house.bedrooms - 1, $lte: house.bedrooms + 1 },
      price: { $ne: house.price }
    }).limit(5);
    const avgPrice = similar.length ? similar.reduce((s, h) => s + h.price, 0) / similar.length : house.price;
    const diffPercent = ((house.price - avgPrice) / avgPrice * 100).toFixed(0);
    let suggestion = '';
    if (diffPercent > 10) {
      suggestion = `This property is ${diffPercent}% above the average for similar listings (MWK ${avgPrice.toLocaleString()}). You could suggest MWK ${Math.floor(avgPrice * 0.95).toLocaleString()} as a starting point.`;
    } else if (diffPercent < -10) {
      suggestion = `This property is ${Math.abs(diffPercent)}% below market average – a great deal!`;
    } else {
      suggestion = `This property is priced close to the market average (MWK ${avgPrice.toLocaleString()}). You could offer MWK ${Math.floor(house.price * 0.95).toLocaleString()} to start.`;
    }
    res.json({ suggestion, avgPrice: avgPrice.toLocaleString(), diffPercent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/premium/early-access – new listings from last 24h (exclusive)
router.get('/early-access', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!isPremiumUser(user)) {
      return res.status(403).json({ message: 'Premium user required' });
    }
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const houses = await House.find({
      status: 'approved',
      createdAt: { $gt: cutoff }
    }).sort({ createdAt: -1 }).limit(20);
    res.json(houses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;