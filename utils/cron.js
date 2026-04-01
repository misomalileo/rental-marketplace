const cron = require('node-cron');
const User = require('../models/User');

// Run every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('🕛 Running subscription expiry check...');
  try {
    const now = new Date();

    // 1. Expire landlord premium subscriptions (verification)
    const expiredLandlords = await User.updateMany(
      { 
        subscriptionExpiresAt: { $lt: now }, 
        verificationType: { $in: ['official', 'premium'] } 
      },
      { 
        $set: { 
          verified: false, 
          verificationType: 'none',
          role: 'free' // if they were landlords, role stays landlord but remove premium status
        } 
      }
    );
    if (expiredLandlords.modifiedCount > 0) {
      console.log(`✅ ${expiredLandlords.modifiedCount} landlord subscriptions expired.`);
    }

    // 2. Expire premium user subscriptions (role)
    const expiredUsers = await User.updateMany(
      { 
        subscriptionExpiresAt: { $lt: now }, 
        role: 'premium_user' 
      },
      { $set: { role: 'free' } }
    );
    if (expiredUsers.modifiedCount > 0) {
      console.log(`✅ ${expiredUsers.modifiedCount} premium user subscriptions expired.`);
    }

  } catch (err) {
    console.error('❌ Cron error:', err);
  }
});

module.exports = cron;