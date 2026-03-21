const express = require("express");
const router = express.Router();
const Chat = require("../models/Chat");
const auth = require("../middleware/auth");

// Get or create chat between two users for a house
router.post("/start", auth, async (req, res) => {
  try {
    const { otherUserId, houseId } = req.body;
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, otherUserId] },
      house: houseId,
    }).populate("participants", "name email").populate("house", "name images");
    
    if (!chat) {
      chat = new Chat({
        participants: [req.user.id, otherUserId],
        house: houseId,
        messages: [],
      });
      await chat.save();
      // Repopulate after saving
      chat = await Chat.findById(chat._id)
        .populate("participants", "name email")
        .populate("house", "name images");
    }
    res.json(chat);
  } catch (err) {
    console.error("❌ Chat start error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get user's chats
router.get("/my", auth, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user.id })
      .populate("participants", "name email")
      .populate("house", "name images")
      .sort({ lastMessage: -1 });
    res.json(chats);
  } catch (err) {
    console.error("❌ Fetch chats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single chat with messages
router.get("/:chatId", auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate("participants", "name email")
      .populate("house", "name images")
      .populate("messages.sender", "name");
    
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    
    if (!chat.participants.some(p => p._id.toString() === req.user.id)) {
      return res.status(403).json({ message: "Not a participant" });
    }
    res.json(chat);
  } catch (err) {
    console.error("❌ Fetch chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Send a message (API fallback – mainly used via socket)
router.post("/:chatId/message", auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    
    if (!chat.participants.includes(req.user.id)) {
      return res.status(403).json({ message: "Not a participant" });
    }
    
    const message = {
      sender: req.user.id,
      content: req.body.content,
    };
    chat.messages.push(message);
    chat.lastMessage = new Date();
    await chat.save();
    
    // Emit socket event (handled in server.js)
    res.json(message);
  } catch (err) {
    console.error("❌ Send message error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;