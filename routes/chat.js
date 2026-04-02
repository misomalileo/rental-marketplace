const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const User = require('../models/User');
const auth = require('../middleware/auth');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary for image uploads
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'chat-images', allowed_formats: ['jpg', 'png', 'jpeg', 'gif'] }
});
const upload = multer({ storage });

function safeToString(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value._id) return value._id.toString();
  return value.toString();
}

// GET /api/chat/my
router.get('/my', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'name profilePicture')
      .sort({ lastMessage: -1 });

    const enriched = chats.map(chat => {
      const validParticipants = (chat.participants || []).filter(p => p && p._id);
      const visibleMessages = (chat.messages || []).filter(m => !m.deleted);
      const lastMsg = visibleMessages[visibleMessages.length - 1];
      const unreadCount = visibleMessages.filter(
        m => m.sender && safeToString(m.sender) !== userId && !m.read
      ).length;

      const messages = visibleMessages.map(m => ({
        _id: m._id,
        text: m.content || m.text || '',
        type: m.type || 'text',
        sender: m.sender,
        read: m.read,
        delivered: true,
        createdAt: m.createdAt
      }));

      return {
        _id: chat._id,
        participants: validParticipants,
        messages,
        lastMessage: lastMsg ? (lastMsg.content || lastMsg.text || '') : '',
        lastMessageAt: lastMsg ? lastMsg.createdAt : chat.updatedAt,
        unreadCount,
        online: false
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error('Error in /my:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/chat/:chatId
router.get('/:chatId', auth, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID format' });
    }
    const chat = await Chat.findById(chatId).populate('participants', 'name profilePicture');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    const validParticipants = (chat.participants || []).filter(p => p && p._id);
    const isAuthorized = validParticipants.some(p => safeToString(p._id) === userId);
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const visibleMessages = (chat.messages || []).filter(m => !m.deleted);
    const messages = visibleMessages.map(m => ({
      _id: m._id,
      text: m.content || m.text || '',
      type: m.type || 'text',
      sender: m.sender,
      read: m.read,
      delivered: true,
      createdAt: m.createdAt
    }));
    res.json({
      _id: chat._id,
      participants: validParticipants,
      messages
    });
  } catch (err) {
    console.error('Error in GET /:chatId:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/chat/send
router.post('/send', auth, async (req, res) => {
  try {
    const { chatId, text, type = "text" } = req.body;
    const userId = req.user.id;
    if (!chatId || (!text && type !== "image")) return res.status(400).json({ message: 'chatId and text or image required' });
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID format' });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    const participants = (chat.participants || []).filter(p => p != null);
    if (!participants.some(p => safeToString(p) === userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const senderId = new mongoose.Types.ObjectId(userId);
    const newMessage = {
      sender: senderId,
      content: text,
      type: type,
      read: false,
      createdAt: new Date()
    };
    chat.messages.push(newMessage);
    chat.lastMessage = new Date();
    await chat.save();

    const savedMessage = chat.messages[chat.messages.length - 1];
    const responseMessage = {
      _id: savedMessage._id,
      text: savedMessage.content,
      type: savedMessage.type,
      sender: savedMessage.sender,
      read: savedMessage.read,
      delivered: true,
      createdAt: savedMessage.createdAt
    };

    const io = req.app.get('io');
    if (io) {
      participants.forEach(participantId => {
        const pStr = safeToString(participantId);
        if (pStr && pStr !== userId) {
          io.to(pStr).emit('newMessage', {
            chatId: chat._id,
            message: {
              ...responseMessage,
              senderId: savedMessage.sender,
              senderName: req.user.name
            }
          });
        }
      });
    }

    res.status(201).json(responseMessage);
  } catch (err) {
    console.error('Error in POST /send:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/chat/upload
router.post('/upload', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({ url: req.file.path });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Upload failed' });
  }
});

// DELETE /api/chat/message/:messageId
router.delete('/message/:messageId', auth, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }
    // Find chat containing this message
    const chat = await Chat.findOne({ 'messages._id': messageId });
    if (!chat) return res.status(404).json({ message: 'Message not found' });
    const message = chat.messages.id(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (safeToString(message.sender) !== userId) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }
    message.deleted = true;
    await chat.save();
    const io = req.app.get('io');
    if (io) {
      const participants = (chat.participants || []).filter(p => p != null);
      participants.forEach(participantId => {
        const pStr = safeToString(participantId);
        if (pStr) {
          io.to(pStr).emit('messageDeleted', { chatId: chat._id, messageId });
        }
      });
    }
    res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error('Error in DELETE message:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/chat/:chatId
router.delete('/:chatId', auth, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.participants.some(p => safeToString(p) === userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    // Soft delete: mark all messages as deleted and clear lastMessage
    chat.messages.forEach(m => { m.deleted = true; });
    chat.lastMessage = null;
    await chat.save();
    const io = req.app.get('io');
    if (io) {
      const participants = (chat.participants || []).filter(p => p != null);
      participants.forEach(participantId => {
        const pStr = safeToString(participantId);
        if (pStr) {
          io.to(pStr).emit('chatDeleted', { chatId });
        }
      });
    }
    res.json({ message: 'Conversation deleted' });
  } catch (err) {
    console.error('Error in DELETE chat:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/chat/:chatId/read
router.post('/:chatId/read', auth, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID format' });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    let updated = false;
    chat.messages.forEach(msg => {
      if (msg.sender && safeToString(msg.sender) !== userId && !msg.read && !msg.deleted) {
        msg.read = true;
        updated = true;
      }
    });
    if (updated) await chat.save();
    const io = req.app.get('io');
    if (io) {
      const participants = (chat.participants || []).filter(p => p != null);
      participants.forEach(participantId => {
        const pStr = safeToString(participantId);
        if (pStr && pStr !== userId) {
          io.to(pStr).emit('messagesRead', { chatId, readBy: userId, readAt: new Date() });
        }
      });
    }
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('Error in POST /:chatId/read:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/chat/start
router.post('/start', auth, async (req, res) => {
  try {
    const { recipientId, houseId } = req.body;
    const userId = req.user.id;
    if (!recipientId) return res.status(400).json({ message: 'recipientId required' });
    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({ message: 'Invalid recipient ID format' });
    }
    let chat;
    if (houseId) {
      chat = await Chat.findOne({
        participants: { $all: [userId, recipientId], $size: 2 },
        house: houseId
      });
    } else {
      chat = await Chat.findOne({
        participants: { $all: [userId, recipientId], $size: 2 },
        house: { $exists: false }
      });
    }
    if (chat) return res.json({ chatId: chat._id });
    chat = new Chat({
      participants: [userId, recipientId],
      house: houseId || null,
      messages: [],
      lastMessage: new Date()
    });
    await chat.save();
    res.status(201).json({ chatId: chat._id });
  } catch (err) {
    console.error('Error in POST /start:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;