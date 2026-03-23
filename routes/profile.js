const express = require("express");
const router = express.Router();
const User = require("../models/User");
const House = require("../models/House");
const Review = require("../models/Review");   // NEW
const auth = require("../middleware/auth");

// Get public landlord profile (for profile.html)
router.get("/landlord/:id", async (req, res) => {
  try {
    const landlord = await User.findById(req.params.id)
      .select("name email phone profile verified verificationType createdAt businessName address bio profilePicture");
    if (!landlord) return res.status(404).json({ message: "Landlord not found" });

    // Get all houses of this landlord
    const houses = await House.find({ owner: landlord._id, status: "approved" })
      .select("name location price images type bedrooms vacancies condition averageRating views");

    // Get all reviews for these houses
    const houseIds = houses.map(h => h._id);
    const reviews = await Review.find({ house: { $in: houseIds } })
      .populate("tenant", "name")
      .sort({ createdAt: -1 });

    // Placeholder response stats (you can replace with real logic later)
    // In real system, you'd query chat messages to compute responseRate and avgResponseTime
    const responseRate = 98; // dummy
    const avgResponseTime = 2; // hours dummy

    res.json({
      landlord: {
        ...landlord.toObject(),
        profile: {
          ...landlord.profile,
          responseRate,
          avgResponseTime
        }
      },
      houses,
      reviews
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile – update landlord profile (used by dashboard)
router.put("/", auth, async (req, res) => {
  try {
    const { name, phone, businessName, bio, address, profilePicture } = req.body;
    const update = {
      name: name || undefined,
      phone: phone || undefined,
      businessName: businessName || undefined,
      bio: bio || undefined,
      address: address || undefined,
      profilePicture: profilePicture || undefined,
      profileCompleted: true
    };
    // Remove undefined fields
    Object.keys(update).forEach(key => update[key] === undefined && delete update[key]);
    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;