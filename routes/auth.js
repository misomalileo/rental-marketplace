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

    const hashed = await bcrypt.hash(password, 10);
    // Optional: generate verification token, but we won't require verification
    const verificationToken = generateToken();

    const user = new User({
      name,
      email,
      password: hashed,
      phone,
      authProvider: "local",
      isEmailVerified: true, // ✅ Auto-verified
      emailVerificationToken: verificationToken, // still store but not used
      role: role,
    });
    await user.save();

    // Optionally send a welcome email (without verification link)
    // const { sendEmail } = require("../utils/emailService");
    // await sendEmail({ ... });

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
  // ... (same as before)
});

// RESET PASSWORD (unchanged)
router.post("/reset-password", validateResetPassword, handleValidationErrors, async (req, res) => {
  // ... (same as before)
});

// LOGIN – no longer checks email verification
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

    // No email verification check – all users can log in immediately
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