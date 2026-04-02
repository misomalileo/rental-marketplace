const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const User = require('../models/User');
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
      // Filter out deleted messages for display
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

// DELETE /api/chat/:chatId/message/:messageId
router.delete('/:chatId/message/:messageId', auth, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    const message = chat.messages.id(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    // Only sender or admin can delete
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
          io.to(pStr).emit('messageDeleted', { chatId, messageId });
        }
      });
    }
    res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error('Error in DELETE message:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/chat/upload-image (optional, using Cloudinary)
router.post('/upload-image', auth, async (req, res) => {
  try {
    const { imageData } = req.body; // base64 or URL from frontend
    // In production, you'd upload to Cloudinary here and return URL
    // For now, accept a data URL and return it (or use Cloudinary)
    const imageUrl = imageData; // you can replace with actual upload
    res.json({ url: imageUrl });
  } catch (err) {
    res.status(500).json({ message: 'Upload failed' });
  }
});

// ... (rest of the routes: read, start remain same)
module.exports = router;