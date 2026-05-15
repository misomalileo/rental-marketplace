const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Upgrade a free user to landlord (no payment)
router.post('/upgrade-to-landlord', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'free') {
      return res.status(400).json({ message: 'Only free users can become landlords via this endpoint.' });
    }
    user.role = 'landlord';
    await user.save();
    res.json({ message: 'You are now a landlord!', role: user.role });
  } catch (err) {
    console.error('Upgrade to landlord error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;