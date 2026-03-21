const express = require("express");
const router = express.Router();
const User = require("../models/User");
const House = require("../models/House");
const Report = require("../models/Report");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const { logAdminAction } = require("../middleware/audit");

// GET DASHBOARD STATS
router.get("/stats", auth, admin, async (req, res) => {
  try {
    const totalLandlords = await User.countDocuments({ role: "landlord" });
    const totalHouses = await House.countDocuments();
    const totalViewsAgg = await House.aggregate([{ $group: { _id: null, total: { $sum: "$views" } } }]);
    const totalViews = totalViewsAgg[0]?.total || 0;
    const pendingVerifications = await User.countDocuments({ role: "landlord", verified: false });
    const premiumLandlords = await User.countDocuments({ role: "landlord", verificationType: "premium" });
    const officialLandlords = await User.countDocuments({ role: "landlord", verificationType: "official" });

    const housesPerMonth = await House.aggregate([
      { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      totalLandlords,
      totalHouses,
      totalViews,
      pendingVerifications,
      premiumLandlords,
      officialLandlords,
      housesPerMonth
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET ALL LANDLORDS
router.get("/landlords", auth, admin, async (req, res) => {
  try {
    const landlords = await User.find({ role: "landlord" })
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(landlords);
  } catch (err) {
    console.error("Landlords fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// VERIFY LANDLORD
router.put("/verify/:id", auth, admin, async (req, res) => {
  try {
    const { type } = req.body;
    if (!["official", "premium"].includes(type)) {
      return res.status(400).json({ message: "Invalid verification type" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Landlord not found" });
    }

    user.verified = true;
    user.verificationType = type;
    await user.save();

    await logAdminAction(req.user.id, "verify_landlord", user._id, "User", { type });

    res.json({ message: `Landlord verified as ${type}`, user });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ error: err.message });
  }
});

// BAN LANDLORD
router.delete("/ban/:id", auth, admin, async (req, res) => {
  try {
    await House.deleteMany({ owner: req.params.id });
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ message: "Landlord not found" });
    }
    await logAdminAction(req.user.id, "ban_landlord", deletedUser._id, "User", { email: deletedUser.email });
    res.json({ message: "Landlord banned and all houses removed" });
  } catch (err) {
    console.error("Ban error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET ALL HOUSES
router.get("/houses", auth, admin, async (req, res) => {
  try {
    const houses = await House.find().populate("owner", "name email phone").sort({ createdAt: -1 });
    res.json(houses);
  } catch (err) {
    console.error("Houses fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE HOUSE
router.delete("/house/:id", auth, admin, async (req, res) => {
  try {
    const deletedHouse = await House.findByIdAndDelete(req.params.id);
    if (!deletedHouse) {
      return res.status(404).json({ message: "House not found" });
    }
    await logAdminAction(req.user.id, "delete_house", deletedHouse._id, "House", { name: deletedHouse.name });
    res.json({ message: "House deleted" });
  } catch (err) {
    console.error("Delete house error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// TOGGLE FEATURED (admin)
// ======================================
router.put("/house/:id/toggle-featured", auth, admin, async (req, res) => {
  try {
    const house = await House.findById(req.params.id);
    if (!house) {
      return res.status(404).json({ message: "House not found" });
    }
    house.featured = !house.featured;
    await house.save();
    await logAdminAction(req.user.id, "toggle_featured", house._id, "House", { featured: house.featured });
    res.json({ message: `Featured ${house.featured ? "enabled" : "disabled"}`, featured: house.featured });
  } catch (err) {
    console.error("Toggle featured error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET ALL REPORTS
router.get("/reports", auth, admin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reporter", "name email")
      .populate("house", "name")
      .populate("landlord", "name email")
      .populate("resolvedBy", "name");
    res.json(reports);
  } catch (err) {
    console.error("Reports fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// RESOLVE REPORT
router.put("/report/:id/resolve", auth, admin, async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status: "resolved", resolvedBy: req.user.id },
      { new: true }
    );
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    await logAdminAction(req.user.id, "resolve_report", report._id, "Report", { reportId: report._id });
    res.json({ message: "Report resolved", report });
  } catch (err) {
    console.error("Resolve report error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;