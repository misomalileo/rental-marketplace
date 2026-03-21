const express = require("express");
const router = express.Router();
const User = require("../models/User");
const House = require("../models/House");

// Get public landlord profile
router.get("/landlord/:id", async (req, res) => {
  try {
    const landlord = await User.findById(req.params.id)
      .select("name email phone profile verified verificationType createdAt");
    if (!landlord) return res.status(404).json({ message: "Landlord not found" });

    // Calculate response rate (placeholder – you can implement later)
    const responseRate = 98; // dummy

    const houses = await House.find({ owner: landlord._id, status: "approved" })
      .select("name location price images type bedrooms vacancies condition averageRating views");

    res.json({
      landlord: {
        ...landlord.toObject(),
        profile: {
          ...landlord.profile,
          responseRate
        }
      },
      houses
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;