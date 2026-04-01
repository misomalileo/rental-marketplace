const passport = require("passport");
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
// const ActivityLog = require("../models/ActivityLog"); // optional – uncomment if you have this model
const { authLimiter } = require("../middleware/rateLimiter");
const {
  validateRegister,
  validateLogin,
  validateResetPassword,
  handleValidationErrors,
} = require("../middleware/validator");
const auth = require("../middleware/auth");

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// REGISTER – accepts optional role (free, landlord, premium_user)
router.post("/register", authLimiter, validateRegister, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password, phone, role = "free" } = req.body;

    // Allowed roles during registration: free, landlord, premium_user
    if (!["free", "landlord", "premium_user"].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const verificationToken = generateToken();

    const user = new User({
      name,
      email,
      password: hashed,
      phone,
      authProvider: "local",
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      role: role, // free, landlord, or premium_user
    });
    await user.save();

    const { sendEmail } = require("../utils/emailService");
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email.html?token=${verificationToken}`;
    await sendEmail({
      to: email,
      subject: "Verify your email address",
      html: `
        <h1>Welcome to Khomo Lathu</h1>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>If you did not create an account, you can ignore this email.</p>
      `,
    });

    res.json({ message: "Registration successful! Please check your email to verify your account." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// VERIFY EMAIL
router.get("/verify-email/:token", async (req, res) => {
  try {
    const user = await User.findOne({ emailVerificationToken: req.params.token });
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/login.html?error=invalid-verification-token`);
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    res.redirect(`${process.env.FRONTEND_URL}/login.html?verified=true`);
  } catch (err) {
    console.error(err);
    res.redirect(`${process.env.FRONTEND_URL}/login.html?error=verification-failed`);
  }
});

// FORGOT PASSWORD
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: "If an account with that email exists, a reset link has been sent." });
    }

    const resetToken = generateToken();
    user.passwordResetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();

    const { sendEmail } = require("../utils/emailService");
    const resetLink = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: "Password Reset Request",
      html: `
        <h1>Reset Your Password</h1>
        <p>Click the link below to reset your password. It expires in 1 hour.</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>If you didn't request this, ignore this email.</p>
      `,
    });

    res.json({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ message: "Reset failed" });
  }
});

// LOGIN
router.post("/login", authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (user.authProvider === "google" && !user.password) {
      return res.status(400).json({
        message: "This email uses Google Sign-In. Please click 'Login with Google'."
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!user.isEmailVerified && user.role !== 'admin') {
      return res.status(403).json({ message: "Please verify your email before logging in." });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Optional activity log – uncomment if you have ActivityLog model
    // await ActivityLog.create({
    //   user: user._id,
    //   action: "login",
    //   details: { method: "local" },
    //   ip: req.ip,
    //   userAgent: req.headers['user-agent']
    // });

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        role: user.role,
        verified: user.verified,
        verificationType: user.verificationType,
        isEmailVerified: user.isEmailVerified,
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET CURRENT USER
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    console.error(err);
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