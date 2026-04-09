const passport = require("passport");
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const User = require("../models/User");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  validateRegister,
  validateLogin,
  validateResetPassword,
  handleValidationErrors,
} = require("../middleware/validator");
const auth = require("../middleware/auth");

// Brute‑force protection constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// REGISTER – accepts role (free, landlord, premium_user)
// Now sets isEmailVerified to true immediately (no verification required)
router.post("/register", authLimiter, validateRegister, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password, phone, role = "free" } = req.body;

    if (!["free", "landlord", "premium_user"].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Enforce strong password
    const tempUser = new User();
    if (!tempUser.isPasswordStrong(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters, include uppercase, lowercase, and a number." });
    }

    const hashed = await bcrypt.hash(password, 12); // increased salt rounds for security
    const verificationToken = generateToken();

    const user = new User({
      name,
      email,
      password: hashed,
      phone,
      authProvider: "local",
      isEmailVerified: true,
      emailVerificationToken: verificationToken,
      role: role,
    });
    await user.save();

    res.json({ message: "Registration successful! You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// VERIFY EMAIL (optional – user can still verify if they want)
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

// FORGOT PASSWORD (unchanged)
router.post("/forgot-password", authLimiter, async (req, res) => {
  // ... (keep your existing implementation)
});

// RESET PASSWORD (unchanged)
router.post("/reset-password", validateResetPassword, handleValidationErrors, async (req, res) => {
  // ... (keep your existing implementation)
});

// ========== LOGIN (modified to support 2FA) ==========
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

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(403).json({ message: `Account locked. Try again in ${minutesLeft} minutes.` });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      // Increment failed attempts
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = Date.now() + LOCK_TIME;
        await user.save();
        return res.status(403).json({ message: `Too many failed attempts. Account locked for 15 minutes.` });
      }
      await user.save();
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Successful login – reset counters
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.passwordChangedAt = Date.now();
    await user.save();

    // ========== 2FA CHECK ==========
    if (user.twoFactorEnabled) {
      // Issue a temporary token (valid 5 minutes) that requires OTP verification
      const tempToken = jwt.sign(
        { id: user._id, role: user.role, twoFactorPending: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );
      return res.status(200).json({
        twoFactorRequired: true,
        tempToken: tempToken,
        message: "2FA code required"
      });
    }
    // ================================

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
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== 2FA ENDPOINTS (ADDED) ==========

// Step 1: Generate 2FA secret and QR code (requires user to be logged in)
router.post("/enable-2fa", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only allow for admin or premium users
    if (user.role !== "admin" && !user.role.includes("premium") && user.role !== "premium_user" && user.role !== "premium_landlord") {
      return res.status(403).json({ message: "2FA is only available for admin and premium users." });
    }

    // Generate a new secret
    const secret = speakeasy.generateSecret({ length: 20, name: `Khomo Lathu (${user.email})` });
    
    // Store the secret temporarily (not enabled yet)
    user.twoFactorSecret = secret.base32;
    await user.save();

    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    
    res.json({ secret: secret.base32, qrCodeUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Step 2: Verify OTP and enable 2FA
router.post("/verify-2fa", auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "OTP token required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.twoFactorSecret) return res.status(400).json({ message: "2FA not initiated. Please call /enable-2fa first." });

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: token,
      window: 1  // allow 1 step before/after for clock drift
    });

    if (!verified) {
      return res.status(400).json({ message: "Invalid OTP code" });
    }

    user.twoFactorEnabled = true;
    await user.save();

    res.json({ message: "2FA enabled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Disable 2FA (requires OTP)
router.post("/disable-2fa", auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "OTP token required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.twoFactorEnabled) return res.status(400).json({ message: "2FA is not enabled" });

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: token,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({ message: "Invalid OTP code" });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();

    res.json({ message: "2FA disabled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Verify OTP during login (after temporary token)
router.post("/verify-2fa-login", async (req, res) => {
  try {
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) {
      return res.status(400).json({ message: "Missing temporary token or OTP" });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired temporary token" });
    }

    if (!decoded.twoFactorPending) {
      return res.status(400).json({ message: "Invalid temporary token" });
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.twoFactorEnabled) {
      return res.status(400).json({ message: "2FA is not enabled for this user" });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: otp,
      window: 1
    });

    if (!verified) {
      return res.status(401).json({ message: "Invalid OTP code" });
    }

    // Generate final JWT
    const finalToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token: finalToken,
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

// ========== END 2FA ENDPOINTS ==========

// GET CURRENT USER (unchanged)
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GOOGLE LOGIN with role support
router.get("/google", (req, res, next) => {
  const role = req.query.role || "free";
  req.session.intendedRole = role;
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login.html?error=google-auth-failed",
    session: false
  }),
  async (req, res) => {
    try {
      const user = req.user;
      let finalRole = user.role;

      if (!user.role || user.role === "free") {
        const intendedRole = req.session.intendedRole || "free";
        if (intendedRole === "landlord" || intendedRole === "premium_user") {
          user.role = intendedRole;
          await user.save();
        }
        finalRole = user.role;
      } else {
        finalRole = user.role;
      }

      const token = jwt.sign(
        { id: user._id, role: finalRole },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );
      res.redirect(`/oauth-redirect.html?token=${token}&role=${finalRole}`);
    } catch (err) {
      console.error(err);
      res.redirect("/login.html?error=google-auth-failed");
    }
  }
);

module.exports = router;