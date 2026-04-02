const session = require("express-session");
const passport = require("passport");
require("./config/googleAuth");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const Chat = require("./models/Chat");
const User = require("./models/User");
const LeaseNegotiation = require("./models/LeaseNegotiation"); // Added for socket events
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { limiter } = require("./middleware/rateLimiter");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" } // Restrict in production
});

// ===============================
// PROXY TRUST (for Render / reverse proxies)
// ===============================
app.set("trust proxy", 1);

// ===============================
// SECURITY MIDDLEWARE (custom CSP)
// ===============================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://cdn.socket.io",
          "'unsafe-inline'",
          "'unsafe-eval'",
        ],
        scriptSrcAttr: null,
        styleSrc: [
          "'self'",
          "https://unpkg.com",
          "https://fonts.googleapis.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "'unsafe-inline'",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: [
          "'self'",
          "data:",
          "https://maps.google.com",
          "https://*.tile.openstreetmap.org",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "https://res.cloudinary.com",
          "https://images.pexels.com",
        ],
        connectSrc: [
          "'self'",
          "https://maps.google.com",
          "http://localhost:5000",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "wss://*.ngrok-free.dev",
          "https://*.ngrok-free.dev",
          "https://*.tile.openstreetmap.org",
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
          "https://rental-marketplace-irmj.onrender.com",
          "wss://rental-marketplace-irmj.onrender.com",
        ],
        upgradeInsecureRequests: [],
      },
    },
  })
);
app.use(cookieParser());

// ===============================
// OTHER MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/", limiter);

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Serve contracts folder for generated PDFs
const contractsDir = path.join(__dirname, "contracts");
if (!fs.existsSync(contractsDir)) fs.mkdirSync(contractsDir, { recursive: true });
app.use("/contracts", express.static(contractsDir));

app.use(session({
  secret: process.env.SESSION_SECRET || "your-secret-key",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// ===============================
// DATABASE CONNECTION
// ===============================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));

// ===============================
// SOCKET.IO – Real‑time chat + lease negotiation
// ===============================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return next(new Error("Authentication error"));
    socket.userId = user.id;
    next();
  });
});

io.on("connection", async (socket) => {
  console.log("🟢 User connected:", socket.userId);
  socket.join(socket.userId);
  socket.broadcast.emit("userOnline", { userId: socket.userId, online: true });

  try {
    await User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() });
  } catch (err) {
    console.error("Failed to update lastSeen on connect:", err);
  }

  // Existing chat events
  socket.on("sendMessage", async (data) => {
    try {
      const { chatId, text, messageId } = data;
      if (!chatId) return;
      const chat = await Chat.findById(chatId);
      if (!chat) return;
      const otherParticipant = chat.participants.find(p => p && p.toString && p.toString() !== socket.userId);
      if (otherParticipant) {
        io.to(otherParticipant.toString()).emit("newMessage", {
          chatId,
          message: {
            _id: messageId,
            text,
            senderId: socket.userId,
            senderName: "User",
            createdAt: new Date()
          }
        });
      }
    } catch (err) {
      console.error("Socket sendMessage error:", err);
    }
  });

  socket.on("readMessages", async ({ chatId }) => {
    try {
      const userId = socket.userId;
      if (!chatId) return;
      const chat = await Chat.findById(chatId);
      if (!chat) return;
      const otherParticipant = chat.participants.find(p => p && p.toString && p.toString() !== userId);
      if (otherParticipant) {
        io.to(otherParticipant.toString()).emit("messagesRead", {
          chatId,
          readBy: userId,
          readAt: new Date()
        });
      }
    } catch (err) {
      console.error("Socket readMessages error:", err);
    }
  });

  socket.on("typing", ({ chatId, isTyping }) => {
    Chat.findById(chatId).then(chat => {
      if (!chat) return;
      const otherParticipant = chat.participants.find(p => p && p.toString && p.toString() !== socket.userId);
      if (otherParticipant) {
        io.to(otherParticipant.toString()).emit("typing", {
          chatId,
          userId: socket.userId,
          isTyping
        });
      }
    }).catch(err => console.error("Socket typing error:", err));
  });

  // NEW: Join a lease negotiation room
  socket.on("join-negotiation", (negotiationId) => {
    socket.join(`negotiation_${negotiationId}`);
    console.log(`User ${socket.userId} joined negotiation ${negotiationId}`);
  });

  // NEW: Send message in negotiation chat
  socket.on("negotiation-message", async ({ negotiationId, text }) => {
    try {
      const negotiation = await LeaseNegotiation.findById(negotiationId);
      if (!negotiation) return;
      const userId = socket.userId;
      let sender = "unknown";
      if (negotiation.landlordId.toString() === userId) sender = "landlord";
      else if (negotiation.tenantId && negotiation.tenantId.toString() === userId) sender = "tenant";
      else sender = "ai";
      io.to(`negotiation_${negotiationId}`).emit("negotiation-message", {
        sender,
        text,
        time: new Date()
      });
    } catch (err) {
      console.error("Negotiation message error:", err);
    }
  });

  socket.on("disconnect", async () => {
    console.log("🔴 User disconnected:", socket.userId);
    try {
      await User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() });
    } catch (err) {
      console.error("Failed to update lastSeen on disconnect:", err);
    }
    socket.broadcast.emit("userOnline", { userId: socket.userId, online: false });
  });
});

app.set('io', io);

// ===============================
// ROUTES – with logging
// ===============================
console.log("📦 Registering routes...");

const authRoutes = require("./routes/auth");
const houseRoutes = require("./routes/houses");
const adminRoutes = require("./routes/admin");
const contactRoutes = require("./routes/contact");
const profileRoutes = require("./routes/profile");
const reportRoutes = require("./routes/report");
const chatRoutes = require("./routes/chat");
const paymentRoutes = require("./routes/payment");
const bookingRoutes = require("./routes/booking");
const chatbotRoutes = require("./routes/chatbot");
const premiumRoutes = require("./routes/premium");

app.use("/api/auth", authRoutes);
console.log("✅ /api/auth");
app.use("/api/houses", houseRoutes);
console.log("✅ /api/houses");
app.use("/api/admin", adminRoutes);
console.log("✅ /api/admin");
app.use("/api/contact", contactRoutes);
console.log("✅ /api/contact");
app.use("/api/profile", profileRoutes);
console.log("✅ /api/profile");
app.use("/api/report", reportRoutes);
console.log("✅ /api/report");
app.use("/api/chat", chatRoutes);
console.log("✅ /api/chat");
app.use("/api/payment", paymentRoutes);
console.log("✅ /api/payment");
app.use("/api/bookings", bookingRoutes);
console.log("✅ /api/bookings");
app.use("/api/chatbot", chatbotRoutes);
console.log("✅ /api/chatbot");
app.use("/api/premium", premiumRoutes);
console.log("✅ /api/premium");

// === OFFERS ROUTE ===
try {
  const offerRoutes = require("./routes/offers");
  app.use("/api/offers", offerRoutes);
  console.log("✅ /api/offers");
} catch (err) {
  console.error("❌ Failed to load offers route:", err.message);
}

// === LEASE NEGOTIATION ROUTE ===
try {
  const leaseRoutes = require("./routes/lease");
  app.use("/api/lease", leaseRoutes);
  console.log("✅ /api/lease");
} catch (err) {
  console.error("❌ Failed to load lease route:", err.message);
}

// ===============================
// DEBUG ENDPOINTS
// ===============================
app.get("/api/db-test", async (req, res) => {
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.buildInfo();
    const collections = await mongoose.connection.db.listCollections().toArray();
    res.json({
      connected: true,
      version: info.version,
      collections: collections.map(c => c.name)
    });
  } catch (err) {
    console.error("DB test error:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Test houses route directly
app.get("/api/houses-test", async (req, res) => {
  try {
    const House = require("./models/House");
    const count = await House.countDocuments();
    const sample = await House.findOne().populate('owner', 'name');
    res.json({ success: true, houseCount: count, sampleHouse: sample });
  } catch (err) {
    console.error("Houses test error:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ===============================
// CRON JOB FOR SUBSCRIPTION EXPIRY
// ===============================
require('./utils/cron');

// ===============================
// TEST ROUTE
// ===============================
app.get("/", (req, res) => {
  res.send("🏠 House Marketplace API Running");
});

// ======================================
// HOUSE SHARE PAGE
// ======================================
app.get('/house/:id', async (req, res) => {
  try {
    const House = require('./models/House');
    const house = await House.findById(req.params.id).populate('owner', 'name');
    if (!house) return res.status(404).send('House not found');

    const title = `${house.name} - ${house.location}`;
    const description = house.description || `MWK ${house.price.toLocaleString()} ${house.type === 'Hostel' ? 'per room' : 'per month'}. ${house.bedrooms} bedrooms.`;
    const imageUrl = house.images?.[0] || 'https://rental-marketplace-irmj.onrender.com/default-house.jpg';
    const pageUrl = `https://rental-marketplace-irmj.onrender.com/house/${house._id}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:image" content="${imageUrl}" />
        <meta property="og:url" content="${pageUrl}" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${title}" />
        <meta name="twitter:description" content="${description}" />
        <meta name="twitter:image" content="${imageUrl}" />
        <meta http-equiv="refresh" content="0; url=/?house=${house._id}" />
      </head>
      <body>
        <p>Redirecting to <a href="/?house=${house._id}">${title}</a>...</p>
      </body>
      </html>
    `;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

// ======================================
// SITEMAP.XML
// ======================================
app.get('/sitemap.xml', async (req, res) => {
  try {
    const House = require('./models/House');
    const houses = await House.find().select('_id updatedAt');
    const urls = houses.map(h => `
    <url>
      <loc>https://rental-marketplace-irmj.onrender.com/house/${h._id}</loc>
      <lastmod>${h.updatedAt.toISOString().split('T')[0]}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.8</priority>
    </url>
    `).join('');
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://rental-marketplace-irmj.onrender.com/</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
      </url>
      ${urls}
    </urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating sitemap');
  }
});

// ===============================
// GLOBAL ERROR HANDLER
// ===============================
app.use((err, req, res, next) => {
  console.error("🔥 Global error:", err.stack);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});