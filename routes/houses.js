const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const House = require("../models/House");
const Review = require("../models/Review");
const ActivityLog = require("../models/ActivityLog");
const auth = require("../middleware/auth");
const {
  validateHouse,
  handleValidationErrors,
} = require("../middleware/validator");

// ======================================
// CLOUDINARY CONFIGURATION
// ======================================
console.log("🔧 Configuring Cloudinary...");
console.log("CLOUDINARY_CLOUD_NAME:", process.env.CLOUDINARY_CLOUD_NAME);
console.log("CLOUDINARY_API_KEY:", process.env.CLOUDINARY_API_KEY ? "***" : "missing");
console.log("CLOUDINARY_API_SECRET:", process.env.CLOUDINARY_API_SECRET ? "***" : "missing");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ======================================
// MULTER STORAGE (Cloudinary)
// ======================================
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "rental-marketplace",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    transformation: [{ width: 800, height: 600, crop: "limit" }],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ======================================
// UPLOAD HOUSE
// ======================================
router.post(
  "/",
  auth,
  (req, res, next) => {
    upload.array("images", 5)(req, res, (err) => {
      if (err) {
        console.error("❌ Multer/Cloudinary upload error:", err);
        return res.status(400).json({
          message: "Image upload failed. " + (err.message || "Unknown error"),
        });
      }
      next();
    });
  },
  validateHouse,
  handleValidationErrors,
  async (req, res) => {
    try {
      console.log("📤 Upload request received");
      console.log("req.files:", req.files ? `${req.files.length} files` : "no files");

      if (!req.files || req.files.length === 0) {
        console.warn("⚠️ No files uploaded");
        return res.status(400).json({ message: "At least one image is required" });
      }

      const images = req.files.map((file) => {
        console.log("✅ Uploaded file:", file.path);
        return file.path;
      });

      const house = new House({
        name: req.body.name,
        location: req.body.location,
        price: req.body.price,
        bedrooms: req.body.bedrooms || 0,
        bathrooms: req.body.bathrooms || 0,
        type: req.body.type || "House",
        description: req.body.description || "",
        phone: req.body.phone,
        lat: req.body.lat || null,
        lng: req.body.lng || null,
        images,
        owner: req.user.id,
        condition: req.body.condition || "Good",
        vacancies: req.body.vacancies || 0,
        wifi: req.body.wifi === "on" || req.body.wifi === "true",
        parking: req.body.parking === "on" || req.body.parking === "true",
        furnished: req.body.furnished === "on" || req.body.furnished === "true",
        petFriendly: req.body.petFriendly === "on" || req.body.petFriendly === "true",
        pool: req.body.pool === "on" || req.body.pool === "true",
        ac: req.body.ac === "on" || req.body.ac === "true",
        gender: req.body.gender || "none",
        unavailableDates: req.body.unavailableDates
          ? JSON.parse(req.body.unavailableDates).map((d) => new Date(d))
          : [],
        selfContained: req.body.selfContained === "on" || req.body.selfContained === "true",
      });

      await house.save();

      // Log activity
      await ActivityLog.create({
        user: req.user.id,
        action: "upload_house",
        target: house._id,
        targetModel: "House",
        details: { name: house.name },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      console.log("✅ House saved with ID:", house._id);
      res.json({ message: "House uploaded successfully", house });
    } catch (err) {
      console.error("❌ Upload error:", err);
      res.status(500).json({ message: "Upload failed: " + err.message });
    }
  }
);

// ======================================
// UPDATE HOUSE
// ======================================
router.put(
  "/:id",
  auth,
  (req, res, next) => {
    upload.array("images", 5)(req, res, (err) => {
      if (err) {
        console.error("❌ Multer/Cloudinary update error:", err);
        return res.status(400).json({
          message: "Image upload failed. " + (err.message || "Unknown error"),
        });
      }
      next();
    });
  },
  validateHouse,
  handleValidationErrors,
  async (req, res) => {
    try {
      const house = await House.findOne({ _id: req.params.id, owner: req.user.id });
      if (!house) {
        return res.status(404).json({ message: "House not found or not owned by you" });
      }

      // Update fields
      house.name = req.body.name || house.name;
      house.location = req.body.location || house.location;
      house.price = req.body.price || house.price;
      house.bedrooms = req.body.bedrooms || house.bedrooms;
      house.bathrooms = req.body.bathrooms || house.bathrooms;
      house.type = req.body.type || house.type;
      house.description = req.body.description || house.description;
      house.phone = req.body.phone || house.phone;
      house.lat = req.body.lat || house.lat;
      house.lng = req.body.lng || house.lng;
      house.condition = req.body.condition || house.condition;
      house.vacancies = req.body.vacancies || house.vacancies;
      house.wifi = req.body.wifi === "on" || req.body.wifi === "true";
      house.parking = req.body.parking === "on" || req.body.parking === "true";
      house.furnished = req.body.furnished === "on" || req.body.furnished === "true";
      house.petFriendly = req.body.petFriendly === "on" || req.body.petFriendly === "true";
      house.pool = req.body.pool === "on" || req.body.pool === "true";
      house.ac = req.body.ac === "on" || req.body.ac === "true";
      house.gender = req.body.gender || house.gender;
      house.selfContained = req.body.selfContained === "on" || req.body.selfContained === "true";
      if (req.body.unavailableDates) {
        house.unavailableDates = JSON.parse(req.body.unavailableDates).map((d) => new Date(d));
      }

      if (req.files && req.files.length > 0) {
        console.log("🖼️ Updating images:", req.files.length);
        house.images = req.files.map((f) => f.path);
      }

      await house.save();

      // Log activity
      await ActivityLog.create({
        user: req.user.id,
        action: "update_house",
        target: house._id,
        targetModel: "House",
        details: { name: house.name },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      console.log("✅ House updated:", house._id);
      res.json({ message: "House updated successfully", house });
    } catch (err) {
      console.error("❌ Update error:", err);
      res.status(500).json({ message: "Update failed: " + err.message });
    }
  }
);

// ======================================
// TEST CLOUDINARY UPLOAD
// ======================================
router.post(
  "/test-upload",
  auth,
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        console.error("❌ Test upload error:", err);
        return res.status(400).json({
          message: "Test upload failed. " + (err.message || "Unknown error"),
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      console.log("✅ Test upload succeeded:", req.file.path);
      res.json({
        message: "Test upload successful",
        url: req.file.path,
      });
    } catch (err) {
      console.error("❌ Test upload error:", err);
      res.status(500).json({ message: "Test upload failed: " + err.message });
    }
  }
);

// ======================================
// GET MY HOUSES
// ======================================
router.get("/my-houses", auth, async (req, res) => {
  try {
    const houses = await House.find({ owner: req.user.id })
      .populate("ratings.user", "name")
      .sort({ createdAt: -1 });
    res.json(houses);
  } catch (err) {
    res.status(500).json({ message: "Error loading houses" });
  }
});

// ======================================
// DELETE HOUSE
// ======================================
router.delete("/:id", auth, async (req, res) => {
  try {
    await House.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    await ActivityLog.create({
      user: req.user.id,
      action: "delete_house",
      target: req.params.id,
      targetModel: "House",
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ message: "House deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
});

// ======================================
// GET ALL HOUSES (public) with filters, sorting
// ======================================
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sort || "default";

    let houseFilter = {};
    if (req.query.minPrice) houseFilter.price = { $gte: Number(req.query.minPrice) };
    if (req.query.maxPrice) {
      if (houseFilter.price) houseFilter.price.$lte = Number(req.query.maxPrice);
      else houseFilter.price = { $lte: Number(req.query.maxPrice) };
    }
    if (req.query.bedrooms) houseFilter.bedrooms = Number(req.query.bedrooms);
    if (req.query.type) houseFilter.type = req.query.type;
    if (req.query.wifi === "true") houseFilter.wifi = true;
    if (req.query.parking === "true") houseFilter.parking = true;
    if (req.query.furnished === "true") houseFilter.furnished = true;
    if (req.query.petFriendly === "true") houseFilter.petFriendly = true;
    if (req.query.pool === "true") houseFilter.pool = true;
    if (req.query.ac === "true") houseFilter.ac = true;

    let sortStage = { featured: -1, createdAt: -1 };
    if (sortBy === "price_asc") sortStage = { price: 1 };
    else if (sortBy === "price_desc") sortStage = { price: -1 };
    else if (sortBy === "newest") sortStage = { createdAt: -1 };
    else if (sortBy === "rating") sortStage = { averageRating: -1 };

    const pipeline = [
      { $match: houseFilter },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "ownerInfo",
        },
      },
      { $unwind: "$ownerInfo" },
      {
        $addFields: {
          owner: {
            _id: "$ownerInfo._id",
            name: "$ownerInfo.name",
            verificationType: "$ownerInfo.verificationType",
            verified: "$ownerInfo.verified",
            phone: "$ownerInfo.phone",
          },
        },
      },
      { $project: { ownerInfo: 0 } },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit },
    ];

    const houses = await House.aggregate(pipeline);

    const countPipeline = [
      { $match: houseFilter },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "ownerInfo",
        },
      },
      { $unwind: "$ownerInfo" },
      { $count: "total" },
    ];
    const countResult = await House.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    res.json({
      houses,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("❌ Error fetching houses:", err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// INCREMENT VIEW COUNT
// ======================================
router.put("/:id/view", async (req, res) => {
  try {
    const house = await House.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    res.json({ views: house.views });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// RATE HOUSE (star rating)
// ======================================
router.post("/:id/rate", auth, async (req, res) => {
  try {
    const house = await House.findById(req.params.id);
    const existingRating = house.ratings.find((r) => r.user.toString() === req.user.id);
    if (existingRating) {
      return res.status(400).json({ message: "You already rated this house" });
    }
    house.ratings.push({ user: req.user.id, value: req.body.value });
    const total = house.ratings.reduce((sum, r) => sum + r.value, 0);
    house.averageRating = total / house.ratings.length;
    await house.save();
    res.json({ message: "Rating submitted", average: house.averageRating });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// ADD REVIEW (written review)
// ======================================
router.post("/:id/review", auth, async (req, res) => {
  try {
    const house = await House.findById(req.params.id);
    if (!house) return res.status(404).json({ message: "House not found" });

    const existing = await Review.findOne({ house: req.params.id, tenant: req.user.id });
    if (existing) {
      return res.status(400).json({ message: "You already reviewed this house" });
    }

    const review = new Review({
      house: req.params.id,
      tenant: req.user.id,
      rating: req.body.rating,
      comment: req.body.comment,
    });
    await review.save();

    // Recalculate average rating
    const allReviews = await Review.find({ house: req.params.id });
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    house.averageRating = avg;
    await house.save();

    res.json({ message: "Review added", review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// ======================================
// GET REVIEWS FOR A HOUSE
// ======================================
router.get("/:id/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ house: req.params.id })
      .populate("tenant", "name")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// GET VIEW STATS (for landlord dashboard)
// ======================================
router.get("/stats/:id", auth, async (req, res) => {
  try {
    const house = await House.findOne({ _id: req.params.id, owner: req.user.id });
    if (!house) return res.status(404).json({ message: "House not found" });

    // Generate mock data for last 30 days (replace with real data from a View model)
    const viewsData = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      viewsData.push({
        date: date.toISOString().split('T')[0],
        views: Math.floor(Math.random() * 50),
      });
    }
    res.json({ views: viewsData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================
// FEATURE HOUSE (mock payment)
// ======================================
router.put("/:id/feature", auth, async (req, res) => {
  try {
    const house = await House.findOne({ _id: req.params.id, owner: req.user.id });
    if (!house) {
      return res.status(404).json({ message: "House not found or not owned by you" });
    }
    if (house.featured) {
      return res.status(400).json({ message: "House already featured" });
    }
    house.featured = true;
    await house.save();
    res.json({ message: "House featured successfully! (Payment simulated)" });
  } catch (err) {
    console.error("Feature error:", err);
    res.status(500).json({ message: "Failed to feature house" });
  }
});

module.exports = router;