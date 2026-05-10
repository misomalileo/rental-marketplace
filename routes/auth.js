const express = require("express");
const router = express.Router();
const supabase = require("../utils/supabaseClient");
const authenticate = require("../middleware/authenticate");

// ========== REGISTER ==========
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, role = "free" } = req.body;

    // Sign up with Supabase - sends confirmation email via your custom SMTP
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          name: name,
          phone: phone,
          role: role,
        },
      },
    });

    if (signUpError) {
      return res.status(400).json({ message: signUpError.message });
    }

    // If email confirmation is required, user is not yet logged in
    if (signUpData.user && !signUpData.user.email_confirmed_at) {
      return res.status(201).json({ 
        message: "Registration successful! Please check your email to verify your account before logging in."
      });
    }

    // If no confirmation required (e.g., you disabled it), they are logged in
    res.status(201).json({ 
      message: "Account created successfully! You are now logged in.",
      session: signUpData.session 
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Registration failed: " + (err.message || "Unknown error") });
  }
});

// ========== LOGIN ==========
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (signInError) {
      return res.status(401).json({ message: signInError.message });
    }

    // Check if email is verified
    if (!signInData.user.email_confirmed_at) {
      return res.status(403).json({ message: "Please verify your email address before logging in. Check your inbox (including spam)." });
    }

    // Login successful
    res.status(200).json({
      token: signInData.session.access_token,
      user: {
        id: signInData.user.id,
        email: signInData.user.email,
        name: signInData.user.user_metadata.name,
        role: signInData.user.user_metadata.role,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== GOOGLE LOGIN ==========
router.get("/google", async (req, res) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.FRONTEND_URL}/oauth-redirect.html`,
    },
  });
  if (error) {
    return res.status(500).json({ message: error.message });
  }
  res.redirect(data.url);
});

// ========== RESEND VERIFICATION ==========
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({ message: "Verification email resent. Please check your inbox." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to resend verification email" });
  }
});

// ========== FORGOT PASSWORD ==========
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password.html`,
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({ message: "If that email is registered, you will receive a password reset link." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== RESET PASSWORD ==========
router.post("/reset-password", async (req, res) => {
  try {
    const { access_token, newPassword } = req.body;

    // Set the session using the token from the reset link URL
    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token: "" });
    if (sessionError) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Update the user's password
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      return res.status(400).json({ message: updateError.message });
    }

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========== GET CURRENT USER (protected) ==========
router.get("/me", authenticate, async (req, res) => {
  res.json(req.user);
});

// ========== LOGOUT ==========
router.post("/logout", authenticate, async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;