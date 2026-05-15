const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Upgrade free user to landlord (no payment) – old endpoint kept for compatibility
router.post('/upgrade-to-landlord', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
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

// NEW: Become Landlord with full profile details (business name, address, bio, etc.)
router.post('/become-landlord', auth, async (req, res) => {
  try {
    const { businessName, address, bio, phone } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'free') {
      return res.status(400).json({ message: 'You are already a landlord or premium user.' });
    }
    // Update profile fields
    if (businessName) user.businessName = businessName;
    if (address) user.address = address;
    if (bio) user.bio = bio;
    if (phone) user.phone = phone;
    user.role = 'landlord';
    await user.save();
    res.json({ message: 'You are now a landlord!', user: { role: user.role, businessName: user.businessName, address: user.address, bio: user.bio } });
  } catch (err) {
    console.error('Become landlord error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Set password for Google-authenticated users (so they can log in with email/password)
router.post('/set-password', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.authProvider !== 'google') {
      return res.status(400).json({ message: 'Only Google-authenticated users can set a password here.' });
    }
    const hashed = await bcrypt.hash(password, 12);
    user.password = hashed;
    await user.save();
    res.json({ message: 'Password set successfully. You can now log in with email and password.' });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upgrade a user to admin (only for existing admins)
router.post('/make-admin/:userId', auth, async (req, res) => {
  try {
    const requester = await User.findById(req.user.id);
    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can promote users to admin.' });
    }
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    targetUser.role = 'admin';
    await targetUser.save();
    res.json({ message: `User ${targetUser.email} is now an admin.` });
  } catch (err) {
    console.error('Make admin error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;