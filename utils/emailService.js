const { Resend } = require('resend');
require('dotenv').config();

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

// Sender email: use a verified domain or the default Resend test sender
const FROM_EMAIL = process.env.EMAIL_FROM || 'onboarding@resend.dev';

// ============================================================
// GENERIC SEND EMAIL (used by emailNotification.js)
// ============================================================
async function sendEmail({ to, subject, html }) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Khomo Lathu <${FROM_EMAIL}>`,
      to: [to],
      subject: subject,
      html: html,
    });
    if (error) {
      console.error('Resend error:', error);
      throw new Error(error.message);
    }
    console.log(`✅ Email sent to ${to}, id: ${data?.id}`);
    return data;
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
    throw err;
  }
}

// ============================================================
// VERIFICATION EMAIL
// ============================================================
async function sendVerificationEmail(email, token) {
  const verificationUrl = `${process.env.FRONTEND_URL || "https://rental-marketplace-irmj.onrender.com"}/verify-email.html?token=${token}`;
  const html = `
    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 28px; padding: 20px; border: 1px solid #e2e8f0;">
      <h2 style="color: #2563eb; margin-bottom: 16px;">✨ Welcome to Khomo Lathu!</h2>
      <p>Please click the button below to verify your email address:</p>
      <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(105deg, #FF8C42, #E67E22); color: white; padding: 12px 24px; text-decoration: none; border-radius: 30px; margin: 20px 0;">Verify Email</a>
      <p>Or copy this link: <br> ${verificationUrl}</p>
      <p>If you didn't create an account, you can ignore this email.</p>
      <hr style="margin: 20px 0;">
      <small>Khomo Lathu – Trusted Rentals in Malawi</small>
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
    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 28px; padding: 20px; border: 1px solid #e2e8f0;">
      <h2 style="color: #2563eb;">🔐 Password Reset Request</h2>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(105deg, #FF8C42, #E67E22); color: white; padding: 12px 24px; text-decoration: none; border-radius: 30px; margin: 20px 0;">Reset Password</a>
      <p>If you didn't request this, you can ignore this email.</p>
      <hr style="margin: 20px 0;">
      <small>Khomo Lathu – Trusted Rentals in Malawi</small>
    </div>
  `;
  await sendEmail({ to: email, subject: "Reset Your Password - Khomo Lathu", html });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendEmail };