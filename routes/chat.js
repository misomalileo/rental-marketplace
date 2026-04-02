const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const auth = require('../middleware/auth');

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
      const lastMsg = chat.messages[chat.messages.length - 1];
      const unreadCount = chat.messages.filter(
        m => m.sender && safeToString(m.sender) !== userId && !m.read
      ).length;
      const messages = (chat.messages || []).map(m => ({
        _id: m._id,
        text: m.content || m.text || '',
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
    const messages = (chat.messages || []).map(m => ({
      _id: m._id,
      text: m.content || m.text || '',
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
    const { chatId, text } = req.body;
    const userId = req.user.id;
    if (!chatId || !text) return res.status(400).json({ message: 'chatId and text required' });
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID format' });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    const participants = (chat.participants || []).filter(p => p != null);
    if (!participants.some(p => safeToString(p) === userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const newMessage = {
      sender: req.user._id,
      content: text,
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
      if (msg.sender && safeToString(msg.sender) !== userId && !msg.read) {
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
          io.to(pStr).emit('messagesRead', {
            chatId,
            readBy: userId,
            readAt: new Date()
          });
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