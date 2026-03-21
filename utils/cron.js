const cron = require('node-cron');
const User = require('../models/User');

// Run every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('🕛 Running subscription expiry check...');
  try {
    const now = new Date();
    // Find users whose subscription has expired and still have verified status
    const expired = await User.updateMany(
      { subscriptionExpiresAt: { $lt: now }, verified: true },
      { $set: { verified: false, verificationType: 'none' } }
    );
    if (expired.modifiedCount > 0) {
      console.log(`✅ ${expired.modifiedCount} subscriptions expired.`);
    }
  } catch (err) {
    console.error('❌ Cron error:', err);
  }
});

module.exports = cron;