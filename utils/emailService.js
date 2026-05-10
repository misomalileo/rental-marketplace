const nodemailer = require("nodemailer");

// Create transporter for Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,   // your Gmail address
    pass: process.env.EMAIL_PASS,   // your Gmail App Password (not normal password)
  },
});

async function sendEmail({ to, subject, html }) {
  const mailOptions = {
    from: `"Khomo Lathu" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}`);
  } catch (err) {
    console.error("❌ Email error:", err);
    throw err; // Let the caller handle the failure
  }
}

async function sendVerificationEmail(to, verificationToken) {
  const baseUrl = process.env.FRONTEND_URL || "https://rental-marketplace-irmj.onrender.com";
  const verificationLink = `${baseUrl}/verify-email.html?token=${verificationToken}`;
  const subject = "Verify Your Email Address – Khomo Lathu";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Welcome to Khomo Lathu!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationLink}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 30px;">Verify Email</a>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all;">${verificationLink}</p>
      <p>If you did not create an account, please ignore this email.</p>
      <hr>
      <small>Khomo Lathu – Trusted Rentals in Malawi</small>
    </div>
  `;
  return sendEmail({ to, subject, html });
}

async function sendPasswordResetEmail(to, resetToken) {
  const baseUrl = process.env.FRONTEND_URL || "https://rental-marketplace-irmj.onrender.com";
  const resetLink = `${baseUrl}/reset-password.html?token=${resetToken}`;
  const subject = "Reset Your Password – Khomo Lathu";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Password Reset Request</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetLink}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 30px;">Reset Password</a>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;
  return sendEmail({ to, subject, html });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };