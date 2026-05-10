const express = require("express");
const router = express.Router();
const { sendEmail } = require("../utils/emailService");

router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    console.log("Contact message:", { name, email, subject, message });

    // Optionally send email to admin
    await sendEmail({
      to: process.env.ADMIN_EMAIL || "admin@example.com",
      subject: `Contact Form: ${subject}`,
      html: `<p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <p><strong>Subject:</strong> ${subject}</p>
             <p><strong>Message:</strong><br>${message}</p>`
    });

    res.json({ message: "Message sent to admin" });
  } catch (err) {
    console.error("Contact error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

module.exports = router;