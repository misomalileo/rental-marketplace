const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const House = require("../models/House");
const auth = require("../middleware/auth");

// Helper: check if a date range overlaps with existing unavailable dates
function isOverlapping(start, end, unavailableDates) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  for (let d of unavailableDates) {
    const uStart = new Date(d);
    const uEnd = new Date(d);
    uEnd.setDate(uEnd.getDate() + 1); // treat each date as a full day
    if (startDate < uEnd && endDate > uStart) {
      return true;
    }
  }
  return false;
}

// Helper: get all approved bookings for a house
async function getApprovedDates(houseId) {
  const approved = await Booking.find({ house: houseId, status: "approved" });
  const dates = [];
  approved.forEach(b => {
    let current = new Date(b.startDate);
    while (current <= b.endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
  });
  return dates;
}

// Create a booking request (tenant)
router.post("/", auth, async (req, res) => {
  try {
    const { houseId, startDate, endDate, message } = req.body;
    const house = await House.findById(houseId);
    if (!house) return res.status(404).json({ message: "House not found" });
    if (house.owner.toString() === req.user.id) {
      return res.status(400).json({ message: "You cannot book your own house" });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      return res.status(400).json({ message: "End date must be after start date" });
    }
    if (start < new Date()) {
      return res.status(400).json({ message: "Cannot book past dates" });
    }

    // Get existing unavailable dates from house
    const existingUnavailable = house.unavailableDates || [];
    // Also get approved bookings
    const approvedDates = await getApprovedDates(houseId);
    const allBlocked = [...existingUnavailable, ...approvedDates];
    if (isOverlapping(start, end, allBlocked)) {
      return res.status(400).json({ message: "Selected dates are already booked" });
    }

    const tenant = req.user; // from auth middleware
    const booking = new Booking({
      house: houseId,
      tenant: tenant.id,
      startDate: start,
      endDate: end,
      message,
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      houseName: house.name
    });
    await booking.save();

    res.status(201).json({ message: "Booking request sent", booking });
  } catch (err) {
    console.error("Booking creation error:", err);
    res.status(500).json({ message: "Failed to create booking" });
  }
});

// Get tenant's own bookings
router.get("/my", auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ tenant: req.user.id })
      .populate("house", "name images location")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

// Get bookings for a specific house (landlord only)
router.get("/house/:houseId", auth, async (req, res) => {
  try {
    const house = await House.findById(req.params.houseId);
    if (!house) return res.status(404).json({ message: "House not found" });
    if (house.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not your house" });
    }
    const bookings = await Booking.find({ house: req.params.houseId })
      .populate("tenant", "name email")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

// Update booking status (landlord only)
router.put("/:id", auth, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const booking = await Booking.findById(req.params.id).populate("house");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Check if user is the owner of the house
    if (booking.house.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (booking.status !== "pending") {
      return res.status(400).json({ message: `Booking already ${booking.status}` });
    }

    if (status === "approved") {
      // Add dates to house.unavailableDates
      const start = new Date(booking.startDate);
      const end = new Date(booking.endDate);
      const newDates = [];
      let current = new Date(start);
      while (current <= end) {
        newDates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      // Avoid duplicates
      const house = booking.house;
      const existing = house.unavailableDates.map(d => new Date(d).toISOString());
      const toAdd = newDates.filter(d => !existing.includes(d.toISOString()));
      house.unavailableDates.push(...toAdd);
      await house.save();
    }

    booking.status = status;
    await booking.save();

    res.json({ message: `Booking ${status}`, booking });
  } catch (err) {
    console.error("Booking update error:", err);
    res.status(500).json({ message: "Failed to update booking" });
  }
});

// Cancel a pending booking (tenant only)
router.delete("/:id", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.tenant.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (booking.status !== "pending") {
      return res.status(400).json({ message: `Cannot cancel a ${booking.status} booking` });
    }
    await booking.deleteOne();
    res.json({ message: "Booking cancelled" });
  } catch (err) {
    res.status(500).json({ message: "Failed to cancel booking" });
  }
});

module.exports = router;