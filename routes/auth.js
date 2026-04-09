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
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/emailService");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000;

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ========== REGISTER ==========
router.post("/register", authLimiter, validateRegister, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password, phone, role = "free" } = req.body;
    if (!["free", "landlord", "premium_user"].includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already registered" });

    const tempUser = new User();
    if (!tempUser.isPasswordStrong(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters, include uppercase, lowercase, and a number." });
    }

    const hashed = await bcrypt.hash(password, 12);
    const verificationToken = generateToken();

    const user = new User({
      name, email, password: hashed, phone, authProvider: "local",
      isEmailVerified: false, emailVerificationToken: verificationToken, role,
    });
    await user.save();

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailErr) { console.error("Email send failed:", emailErr); }

    res.json({ message: "Registration successful! Please check your email to verify your account." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// ========== VERIFY EMAIL ==========
router.get("/verify-email/:token", async (req, res) => {
  try {
    const user = await User.findOne({ emailVerificationToken: req.params.token });
    if (!user) return res.status(400).json({ message: "Invalid or expired verification link." });
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();
    res.json({ message: "Email verified successfully! You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Verification failed." });
  }
});

// ========== RESEND VERIFICATION ==========
router.post("/resend-verification", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

    const token = user.emailVerificationToken || generateToken();
    if (!user.emailVerificationToken) {
      user.emailVerificationToken = token;
      await user.save();
    }
    await sendVerificationEmail(email, token);
    res.json({ message: "Verification email resent. Please check your inbox." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to resend verification email" });
  }
});

// ========== FORGOT PASSWORD ==========
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ message: "If that email is registered, you will receive a password reset link." });
    const resetToken = generateToken();
    user.passwordResetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;
    await user.save();
    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (emailErr) { console.error("Email send failed:", emailErr); }
    res.json({ message: "If that email is registered, you will receive a password reset link." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== RESET PASSWORD ==========
router.post("/reset-password", validateResetPassword, handleValidationErrors, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({
      passwordResetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });
    if (!user) return res.status(400).json({ message: "Invalid or expired reset token" });

    const tempUser = new User();
    if (!tempUser.isPasswordStrong(newPassword)) {
      return res.status(400).json({ message: "Password must be at least 8 characters, include uppercase, lowercase, and a number." });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = undefined;
    user.resetTokenExpiry = undefined;
    user.passwordChangedAt = Date.now();
    await user.save();

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== LOGIN (with fixed 2FA handling) ==========
router.post("/login", authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "Invalid email or password" });
    if (user.authProvider === "google" && !user.password) {
      return res.status(400).json({ message: "This email uses Google Sign-In. Please click 'Login with Google'." });
    }
    if (!user.isEmailVerified) {
      return res.status(403).json({ message: "Please verify your email address before logging in." });
    }
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(403).json({ message: `Account locked. Try again in ${minutesLeft} minutes.` });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = Date.now() + LOCK_TIME;
        await user.save();
        return res.status(403).json({ message: `Too many failed attempts. Account locked for 15 minutes.` });
      }
      await user.save();
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.passwordChangedAt = Date.now();
    await user.save();

    // 2FA enabled – return temporary token
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { id: user._id, role: user.role, twoFactorPending: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );
      return res.json({
        twoFactorRequired: true,
        tempToken: tempToken,
        message: "2FA code required"
      });
    }

    // No 2FA – return final token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({
      token,
      user: {
        _id: user._id, name: user.name, role: user.role,
        verified: user.verified, verificationType: user.verificationType,
        isEmailVerified: user.isEmailVerified,
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== 2FA ENDPOINTS ==========
router.post("/enable-2fa", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin" && !user.role.includes("premium")) {
      return res.status(403).json({ message: "2FA is only available for admin and premium users." });
    }
    const secret = speakeasy.generateSecret({ length: 20, name: `Khomo Lathu (${user.email})` });
    user.twoFactorSecret = secret.base32;
    await user.save();
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCodeUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/verify-2fa", auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "OTP token required" });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.twoFactorSecret) return res.status(400).json({ message: "2FA not initiated." });

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token,
      window: 1
    });
    if (!verified) return res.status(400).json({ message: "Invalid OTP code" });

    user.twoFactorEnabled = true;
    await user.save();
    res.json({ message: "2FA enabled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

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
      token,
      window: 1
    });
    if (!verified) return res.status(400).json({ message: "Invalid OTP code" });

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();
    res.json({ message: "2FA disabled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

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
    if (!verified) return res.status(401).json({ message: "Invalid OTP code" });

    const finalToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({
      token: finalToken,
      user: {
        _id: user._id, name: user.name, role: user.role,
        verified: user.verified, verificationType: user.verificationType,
        isEmailVerified: user.isEmailVerified,
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== GET CURRENT USER (with safe fallback for decryption errors) ==========
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("Error in /me:", err);
    // If the error is related to decryption, return a partial user or a clear error
    if (err.message && (err.message.includes("decrypt") || err.message.includes("cipher"))) {
      // Fallback: fetch user without encrypted fields (not possible because plugin auto-decrypts)
      // Instead, we return a generic error and advise the admin to run migration
      return res.status(500).json({ message: "Data decryption failed. Please run the encryption migration script." });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// ========== GOOGLE LOGIN ==========
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
      if (!user) return res.redirect("/login.html?error=google-auth-failed");
      let finalRole = user.role;
      if (!user.role || user.role === "free") {
        const intendedRole = req.session.intendedRole || "free";
        if (intendedRole === "landlord" || intendedRole === "premium_user") {
          user.role = intendedRole;
          await user.save().catch(err => console.error("Save error:", err));
        }
        finalRole = user.role;
      }
      const token = jwt.sign(
        { id: user._id, role: finalRole },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );
      res.redirect(`/oauth-redirect.html?token=${token}&role=${finalRole}`);
    } catch (err) {
      console.error("Google callback error:", err);
      res.redirect("/login.html?error=google-auth-failed");
    }
  }
);

module.exports = router;