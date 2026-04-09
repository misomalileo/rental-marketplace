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

// LOGIN – with brute‑force protection and lockout
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
    user.passwordChangedAt = Date.now(); // optional: to invalidate old tokens later
    await user.save();

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