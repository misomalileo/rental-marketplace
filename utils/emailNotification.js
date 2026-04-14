// utils/emailNotification.js
const SavedSearch = require('../models/SavedSearch');
const { houseMatchesFilters } = require('./matchingUtils');
const { sendEmail } = require('./emailService');

async function notifyMatchingSavedSearches(house) {
  try {
    const savedSearches = await SavedSearch.find().populate('userId', 'isPremium email');
    
    const matchingSearches = savedSearches.filter(search => {
      const user = search.userId;
      if (user && !user.isPremium) return false;
      if (!search.emailEnabled) return false;  // <-- only if email alerts are ON
      return houseMatchesFilters(house, search.filters);
    });

    if (matchingSearches.length === 0) return;

    const baseUrl = process.env.FRONTEND_URL || 'https://rental-marketplace-irmj.onrender.com';
    const houseUrl = `${baseUrl}/house/${house._id}`;

    for (const search of matchingSearches) {
      const to = search.userEmail;
      if (!to) continue;

      const subject = `🏠 New property matching your saved search: "${search.name || 'Saved Search'}"`;
      const html = `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 28px; padding: 20px; border: 1px solid #e2e8f0;">
          <h2 style="color: #2563eb; margin-bottom: 16px;">✨ New Property Alert</h2>
          <p>Hello,</p>
          <p>A new property that matches your saved search <strong>“${escapeHtml(search.name)}”</strong> has just been listed.</p>
          <div style="background: white; border-radius: 20px; padding: 16px; margin: 16px 0; border-left: 4px solid #10b981;">
            <h3 style="margin: 0 0 8px 0;">${escapeHtml(house.name)}</h3>
            <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(house.location)}</p>
            <p><strong>MWK ${house.price.toLocaleString()}</strong> ${house.type === 'Hostel' ? '/ room' : '/ month'}</p>
            <p>${house.bedrooms || '?'} bed · ${house.bathrooms || '?'} bath · ${house.type}</p>
            <a href="${houseUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 40px; text-decoration: none; margin-top: 12px;">View Property</a>
          </div>
          <p style="color: #64748b; font-size: 0.8rem;">You are receiving this because you have email alerts enabled for this saved search. To stop, disable alerts in your Premium Dashboard.</p>
          <hr style="margin: 20px 0;">
          <small>Khomo Lathu – Trusted Rentals in Malawi</small>
        </div>
      `;

      try {
        await sendEmail({ to, subject, html });
        console.log(`✅ Email sent to ${to} for house ${house._id}`);
      } catch (err) {
        console.error(`❌ Failed to send email to ${to}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error in notifyMatchingSavedSearches:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

module.exports = { notifyMatchingSavedSearches };