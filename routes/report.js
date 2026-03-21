const express = require("express");
const router = express.Router();
const Report = require("../models/Report");
const auth = require("../middleware/auth");

// Submit a report
router.post("/", auth, async (req, res) => {
  try {
    const { houseId, landlordId, reason, description } = req.body;
    const report = new Report({
      reporter: req.user.id,
      house: houseId,
      landlord: landlordId,
      reason,
      description,
    });
    await report.save();
    res.json({ message: "Report submitted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: get all reports (add admin middleware)
router.get("/admin", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const reports = await Report.find().populate("reporter house landlord");
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;