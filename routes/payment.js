const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../models/User");
const House = require("../models/House");
const auth = require("../middleware/auth");

// PayChangu configuration
const PAYCHANGU_SECRET = process.env.PAYCHANGU_SECRET_KEY;
const PAYCHANGU_API = process.env.PAYCHANGU_API_URL;

// Helper to determine mobile money provider
function getProvider(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('26588')) return 'airtel';
  if (digits.startsWith('26599')) return 'tnm';
  return 'airtel';
}

// Initiate payment for landlord verification
router.post("/verify", auth, async (req, res) => {
  try {
    const { type, phone } = req.body;
    console.log("🔹 Verification payment initiated for user:", req.user.id, "type:", type);
    if (!["official", "premium"].includes(type)) {
      return res.status(400).json({ message: "Invalid verification type" });
    }
    const amount = type === "official" ? 2500 : 5000;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.verificationType === type || (type === "premium" && user.verificationType === "premium")) {
      return res.status(400).json({ message: `You are already ${user.verificationType}` });
    }

    const txRef = `VERIFY_${user._id}_${Date.now()}`;

    const requestBody = {
      amount: amount.toString(),
      currency: "MWK",
      email: user.email || "customer@example.com",
      first_name: user.name ? user.name.split(' ')[0] : "Landlord",
      last_name: user.name ? user.name.split(' ').slice(1).join(' ') || "User" : "User",
      callback_url: `${process.env.BASE_URL}/api/payment/callback`,
      return_url: `${process.env.BASE_URL}/dashboard.html`,
      tx_ref: txRef,
      customization: {
        title: `Landlord Verification (${type})`,
        description: `Payment for ${type} verification`
      },
      meta: {
        user_id: user._id.toString(),
        type: type
      }
    };

    console.log("🔹 Sending to PayChangu:", requestBody);

    const response = await axios.post(`${PAYCHANGU_API}/payment`, requestBody, {
      headers: {
        "Authorization": `Bearer ${PAYCHANGU_SECRET}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    console.log("🔹 PayChangu response:", response.data);

    if (response.data.status === "success") {
      res.json({ 
        message: "Payment initiated", 
        payment_url: response.data.data.checkout_url,
        tx_ref: txRef
      });
    } else {
      throw new Error(response.data.message || "Payment initiation failed");
    }
  } catch (err) {
    console.error("❌ Verification payment error:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment initiation failed" });
  }
});

// Initiate payment for featuring a house
router.put("/house/:id/feature", auth, async (req, res) => {
  console.log("🔹 FEATURE ROUTE HIT – House ID:", req.params.id);
  console.log("🔹 Authenticated user ID:", req.user.id);
  console.log("🔹 Request body:", req.body);
  try {
    const { phone } = req.body;
    const house = await House.findOne({ _id: req.params.id, owner: req.user.id });
    if (!house) {
      console.log("❌ House not found or not owned by user");
      return res.status(404).json({ message: "House not found or not owned by you" });
    }
    if (house.featured) {
      console.log("❌ House already featured");
      return res.status(400).json({ message: "House already featured" });
    }

    const amount = 5000;
    const user = await User.findById(req.user.id);
    const txRef = `FEATURE_${house._id}_${Date.now()}`;

    const requestBody = {
      amount: amount.toString(),
      currency: "MWK",
      email: user.email || "customer@example.com",
      first_name: user.name ? user.name.split(' ')[0] : "Landlord",
      last_name: user.name ? user.name.split(' ').slice(1).join(' ') || "User" : "User",
      callback_url: `${process.env.BASE_URL}/api/payment/callback`,
      return_url: `${process.env.BASE_URL}/dashboard.html`,
      tx_ref: txRef,
      customization: {
        title: `Feature House: ${house.name}`,
        description: `Payment to feature your property`
      },
      meta: {
        house_id: house._id.toString(),
        user_id: user._id.toString()
      }
    };

    console.log("🔹 Sending to PayChangu:", requestBody);

    const response = await axios.post(`${PAYCHANGU_API}/payment`, requestBody, {
      headers: {
        "Authorization": `Bearer ${PAYCHANGU_SECRET}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    console.log("🔹 PayChangu response:", response.data);

    if (response.data.status === "success") {
      res.json({ 
        message: "Payment initiated", 
        payment_url: response.data.data.checkout_url,
        tx_ref: txRef
      });
    } else {
      throw new Error(response.data.message || "Payment initiation failed");
    }
  } catch (err) {
    console.error("❌ Feature payment error:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment initiation failed" });
  }
});

// Callback endpoint for PayChangu to notify payment status
router.post("/callback", async (req, res) => {
  try {
    const { tx_ref, status, amount, currency } = req.body;
    console.log("📞 Payment callback received:", { tx_ref, status, amount, currency });

    if (status === "successful") {
      if (tx_ref.startsWith("VERIFY_")) {
        const parts = tx_ref.split('_');
        const userId = parts[1];
        const type = amount === "2500" ? "official" : "premium";
        
        // Update user verification and set subscription expiry (30 days from now)
        const user = await User.findById(userId);
        if (user) {
          // If already subscribed, extend from current expiry, else from now
          let expiryDate = new Date();
          if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()) {
            expiryDate = new Date(user.subscriptionExpiresAt);
            expiryDate.setDate(expiryDate.getDate() + 30);
          } else {
            expiryDate.setDate(expiryDate.getDate() + 30);
          }
          user.verified = true;
          user.verificationType = type;
          user.subscriptionExpiresAt = expiryDate;
          await user.save();
          console.log(`✅ User ${userId} verified as ${type}, subscription until ${expiryDate}`);
        }
      } else if (tx_ref.startsWith("FEATURE_")) {
        const parts = tx_ref.split('_');
        const houseId = parts[1];
        await House.findByIdAndUpdate(houseId, { featured: true });
        console.log(`✅ House ${houseId} featured`);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Callback error:", err);
    res.sendStatus(500);
  }
});

module.exports = router;