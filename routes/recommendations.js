const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const UserActivity = require('../models/UserActivity');
const House = require('../models/House');

// Helper: compute similarity between two houses
function computeSimilarity(house1, house2) {
  let score = 0;

  // Location exact match
  if (house1.location === house2.location) score += 2;

  // Type match
  if (house1.type === house2.type) score += 1;

  // Price similarity (inversely proportional to difference)
  const priceDiff = Math.abs(house1.price - house2.price);
  const priceSimilarity = 1 - Math.min(1, priceDiff / (house1.price + house2.price));
  score += priceSimilarity * 2;

  // Amenities
  const amenities = ['wifi', 'parking', 'furnished', 'petFriendly', 'pool', 'ac'];
  amenities.forEach(amen => {
    if (house1[amen] === house2[amen]) score += 0.5;
  });

  // Self‑contained
  if (house1.selfContained === house2.selfContained) score += 0.5;

  // Gender restriction
  if (house1.gender === house2.gender) score += 0.5;

  // Condition
  if (house1.condition === house2.condition) score += 0.3;

  // Bedrooms (within 1)
  if (Math.abs(house1.bedrooms - house2.bedrooms) <= 1) score += 0.5;

  return score;
}

// GET /api/recommendations – personalized recommendations
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    const isPremium = user.role === 'premium_user' && user.subscriptionExpiresAt > new Date();

    // Get user's recent activities (last 30 days)
    const activities = await UserActivity.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('house');

    // Extract unique house IDs the user interacted with (view/favourite)
    const interactedHouseIds = activities
      .filter(a => a.house && ['view', 'favorite'].includes(a.action))
      .map(a => a.house._id.toString());
    const uniqueIds = [...new Set(interactedHouseIds)];

    if (uniqueIds.length === 0) {
      // No history: return popular houses
      const popular = await House.find({ status: 'approved' }).sort({ views: -1 }).limit(isPremium ? 12 : 6);
      return res.json({ recommendations: popular, personalized: false });
    }

    // Fetch the houses the user liked/ viewed
    const likedHouses = await House.find({ _id: { $in: uniqueIds } });

    // Candidate houses: exclude those already interacted with
    const candidateHouses = await House.find({
      status: 'approved',
      _id: { $nin: uniqueIds }
    }).limit(100);

    // Score each candidate against all liked houses
    const scored = candidateHouses.map(candidate => {
      let totalScore = 0;
      likedHouses.forEach(liked => {
        totalScore += computeSimilarity(liked, candidate);
      });
      return { house: candidate, score: totalScore };
    });

    // Sort and take top N
    scored.sort((a, b) => b.score - a.score);
    const limit = isPremium ? 12 : 6;
    const recommendations = scored.slice(0, limit).map(s => s.house);

    res.json({ recommendations, personalized: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/recommendations/insight/:houseId – "Why you'll love it"
router.get('/insight/:houseId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const house = await House.findById(req.params.houseId);
    if (!house) return res.status(404).json({ message: 'House not found' });

    // Get user's recent interactions (excluding this house)
    const activities = await UserActivity.find({
      user: userId,
      house: { $ne: house._id },
      action: { $in: ['view', 'favorite'] }
    }).limit(10).populate('house');

    if (activities.length === 0) {
      return res.json({ insight: null });
    }

    const likedHouses = activities.map(a => a.house).filter(h => h);

    // Build common attributes
    const common = {
      location: false,
      type: false,
      priceSimilar: false,
      amenities: [],
      selfContained: false,
      gender: false,
      condition: false
    };

    likedHouses.forEach(liked => {
      if (liked.location === house.location) common.location = true;
      if (liked.type === house.type) common.type = true;
      if (Math.abs(liked.price - house.price) / house.price < 0.2) common.priceSimilar = true;

      const amenities = ['wifi', 'parking', 'furnished', 'petFriendly', 'pool', 'ac'];
      amenities.forEach(amen => {
        if (liked[amen] === house[amen] && liked[amen]) {
          if (!common.amenities.includes(amen)) common.amenities.push(amen);
        }
      });
      if (liked.selfContained === house.selfContained && house.selfContained) common.selfContained = true;
      if (liked.gender === house.gender && house.gender !== 'none') common.gender = true;
      if (liked.condition === house.condition) common.condition = true;
    });

    // Build friendly sentence
    const reasons = [];
    if (common.location) reasons.push('you like this area');
    if (common.type) reasons.push(`you're interested in ${house.type}s`);
    if (common.priceSimilar) reasons.push('the price fits your budget');
    if (common.amenities.length) reasons.push(`it has ${common.amenities.join(', ')} which you've looked for`);
    if (common.selfContained) reasons.push('you prefer self‑contained units');
    if (common.gender) reasons.push(`it matches your gender preference (${house.gender === 'boys' ? 'Boys Only' : house.gender === 'girls' ? 'Girls Only' : 'Mixed'})`);
    if (common.condition) reasons.push('the condition is what you usually consider');

    let insight = null;
    if (reasons.length) {
      insight = `Based on your past activity, you might like this property because ${reasons.join(', ')}.`;
    }
    res.json({ insight });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;