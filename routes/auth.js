const passport = require("passport");
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  validateRegister,
  validateLogin,
  validateResetPassword,
  handleValidationErrors,
} = require("../middleware/validator");
const auth = require("../middleware/auth"); // for /me

// Helper to generate token
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// REGISTER
router.post("/register", authLimiter, validateRegister, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashed,
      phone,
      authProvider: "local",
      isEmailVerified: true,
    });
    await user.save();
    res.json({ message: "Account created successfully. You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// FORGOT PASSWORD
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const resetToken = generateToken();
    user.passwordResetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    const resetLink = `${process.env.BASE_URL}/reset-password.html?token=${resetToken}`;
    const { sendEmail } = require("../utils/emailService");
    await sendEmail({
      to: email,
      subject: "Password Reset",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password. Link expires in 1 hour.</p>`,
    });
    res.json({ message: "Password reset email sent" });
  } catch (err) {
    res.status(500).json({ message: "Error sending reset email" });
  }
});

// RESET PASSWORD
router.post("/reset-password", validateResetPassword, handleValidationErrors, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({
      passwordResetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Reset failed" });
  }
});

// LOGIN
router.post("/login", authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.authProvider === "google" && !user.password) {
      return res.status(400).json({
        message: "This email uses Google Sign-In. Please click 'Login with Google'."
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        verified: user.verified,
        verificationType: user.verificationType,
        isEmailVerified: user.isEmailVerified,
        subscriptionExpiresAt: user.subscriptionExpiresAt // include for dashboard
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET CURRENT USER (for dashboard)
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GOOGLE LOGIN
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login.html?error=google-auth-failed",
    session: false
  }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user._id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.redirect(`/oauth-redirect.html?token=${token}&role=${req.user.role}`);
  }
);

module.exports = router;