const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail({ to, subject, html }) {
  const msg = {
    to,
    from: process.env.EMAIL_FROM,
    subject,
    html,
  };
  try {
    await sgMail.send(msg);
    console.log(`✅ Email sent to ${to}`);
  } catch (err) {
    console.error('❌ Email error:', err);
    throw err; // rethrow so caller can handle
  }
}

module.exports = { sendEmail };