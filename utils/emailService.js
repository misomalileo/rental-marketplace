const nodemailer = require("nodemailer");
const dns = require("dns");
require("dotenv").config();

// ============================================================
// FORCE IPv4 FOR ALL HOSTNAME RESOLUTIONS (Gmail & Google)
// ============================================================
const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  // Force IPv4 for any Google/Gmail domain
  if (hostname.includes("gmail.com") || hostname.includes("google.com")) {
    options.family = 4;
  }
  return originalLookup(hostname, options, callback);
};

// ============================================================
// CREATE TRANSPORTER WITH EXPLICIT IPv4 SOCKET OPTIONS
// ============================================================
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // only for development
  },
  // Force socket to use IPv4 only
  socketOptions: {
    family: 4
  },
  // Additional connection options
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

// ============================================================
// GENERIC SEND EMAIL (used by emailNotification.js)
// ============================================================
async function sendEmail({ to, subject, html }) {
  const mailOptions = {
    from: `"Khomo Lathu" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };
  await transporter.sendMail(mailOptions);
}

// ============================================================
// VERIFICATION EMAIL
// ============================================================
async function sendVerificationEmail(email, token) {
  const verificationUrl = `${process.env.FRONTEND_URL || "https://rental-marketplace-irmj.onrender.com"}/verify-email.html?token=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to Khomo Lathu!</h2>
      <p>Please click the button below to verify your email address:</p>
      <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(105deg, #FF8C42, #E67E22); color: white; padding: 12px 24px; text-decoration: none; border-radius: 30px; margin: 20px 0;">Verify Email</a>
      <p>Or copy this link: <br> ${verificationUrl}</p>
      <p>If you didn't create an account, you can ignore this email.</p>
    </div>
  `;
  await sendEmail({ to: email, subject: "Verify Your Email - Khomo Lathu", html });
}

// ============================================================
// PASSWORD RESET EMAIL
// ============================================================
async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${process.env.FRONTEND_URL || "https://rental-marketplace-irmj.onrender.com"}/reset-password.html?token=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(105deg, #FF8C42, #E67E22); color: white; padding: 12px 24px; text-decoration: none; border-radius: 30px; margin: 20px 0;">Reset Password</a>
      <p>If you didn't request this, you can ignore this email.</p>
    </div>
  `;
  await sendEmail({ to: email, subject: "Reset Your Password - Khomo Lathu", html });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendEmail };