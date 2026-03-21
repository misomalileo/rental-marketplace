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
require("dotenv").config();

const { limiter } = require("./middleware/rateLimiter");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

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
// SOCKET.IO – Real‑time chat
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

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.userId);
  socket.join(socket.userId);

  socket.on("sendMessage", async (data) => {
    try {
      const { chatId, content } = data;
      const chat = await Chat.findById(chatId);
      if (!chat) return;
      if (!chat.participants.includes(socket.userId)) return;

      const message = {
        sender: socket.userId,
        content,
        read: false,
        createdAt: new Date(),
      };
      chat.messages.push(message);
      chat.lastMessage = new Date();
      await chat.save();

      chat.participants.forEach(participantId => {
        io.to(participantId.toString()).emit("newMessage", {
          chatId,
          message: {
            ...message,
            sender: { _id: socket.userId, name: "You" }
          }
        });
      });
    } catch (err) {
      console.error("Socket message error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.userId);
  });
});

// ===============================
// ROUTES
// ===============================
const authRoutes = require("./routes/auth");
const houseRoutes = require("./routes/houses");
const adminRoutes = require("./routes/admin");
const contactRoutes = require("./routes/contact");
const profileRoutes = require("./routes/profile");
const reportRoutes = require("./routes/report");
const chatRoutes = require("./routes/chat");
const paymentRoutes = require("./routes/payment");
const bookingRoutes = require("./routes/booking");

app.use("/api/auth", authRoutes);
app.use("/api/houses", houseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/bookings", bookingRoutes);

// ===============================
// DEBUG ENDPOINT – TEST MONGODB CONNECTION
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

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});