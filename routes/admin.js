const express = require("express");
const router = express.Router();
const User = require("../models/User");
const House = require("../models/House");
const Report = require("../models/Report");
const ActivityLog = require("../models/ActivityLog");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const { logAdminAction } = require("../middleware/audit");

// ========== DASHBOARD STATS ==========
router.get("/stats", auth, admin, async (req, res) => {
  try {
    const totalLandlords = await User.countDocuments({ role: "landlord" });
    const totalPremiumUsers = await User.countDocuments({ role: "premium_user" });
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
      totalPremiumUsers,
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

// ========== PAGINATED LANDLORDS ==========
router.get("/landlords", auth, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ role: "landlord" })
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments({ role: "landlord" })
    ]);

    res.json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error("Landlords fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== VERIFY LANDLORD ==========
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

// ========== BAN LANDLORD ==========
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

// ========== PAGINATED HOUSES ==========
router.get("/houses", auth, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [houses, total] = await Promise.all([
      House.find()
        .populate("owner", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      House.countDocuments()
    ]);

    res.json({
      houses,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error("Houses fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== DELETE HOUSE ==========
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

// ========== TOGGLE FEATURED ==========
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

// ========== PREMIUM USERS (PAGINATED) ==========
router.get("/premium-users", auth, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ role: "premium_user" })
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments({ role: "premium_user" })
    ]);

    res.json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error("Premium users fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== REVOKE PREMIUM ==========
router.put("/revoke-premium/:userId", auth, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role !== "premium_user") {
      return res.status(400).json({ message: "User is not a premium user" });
    }
    user.role = "free";
    user.subscriptionExpiresAt = null;
    await user.save();
    await logAdminAction(req.user.id, "revoke_premium", user._id, "User", { email: user.email });
    res.json({ message: "Premium status revoked" });
  } catch (err) {
    console.error("Revoke premium error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== REPORTS (ALL) ==========
router.get("/reports", auth, admin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reporter", "name email")
      .populate("house", "name")
      .populate("landlord", "name email")
      .populate("resolvedBy", "name")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    console.error("Reports fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== RESOLVE REPORT ==========
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

// ========== REAL-TIME MONITORING ==========
router.get("/real-time", auth, admin, async (req, res) => {
  try {
    const activeUsers = await ActivityLog.distinct('user', {
      createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) }
    });
    const newListingsToday = await House.countDocuments({
      createdAt: { $gt: new Date().setHours(0,0,0,0) }
    });
    const totalHouses = await House.countDocuments();
    const totalViewsAgg = await House.aggregate([{ $group: { _id: null, total: { $sum: "$views" } } }]);

    res.json({
      activeUsers: activeUsers.length,
      newListingsToday,
      revenue: 0,
      totalHouses,
      totalViews: totalViewsAgg[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ACTIVITY LOGS (PAGINATED) ==========
router.get("/activity-logs", auth, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      ActivityLog.find()
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ActivityLog.countDocuments()
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CSV EXPORT (HOUSES) ==========
router.get("/export/csv", auth, admin, async (req, res) => {
  try {
    const houses = await House.find().populate("owner", "name email");
    const fields = ["ID", "Name", "Location", "Price", "Type", "Bedrooms", "Owner", "Views", "Created At"];
    const csvData = houses.map(h => [
      h._id, h.name, h.location, h.price, h.type, h.bedrooms, h.owner?.name || "Unknown", h.views, h.createdAt.toISOString()
    ]);
    const csv = [fields, ...csvData].map(row => row.join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=houses_export.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;