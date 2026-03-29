const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET /api/chat/my – all chats for current user
router.get('/my', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'name profilePicture')
      .sort({ lastMessage: -1 });

    const enriched = chats.map(chat => {
      const lastMsg = chat.messages[chat.messages.length - 1];
      const unreadCount = chat.messages.filter(
        m => m.sender.toString() !== userId.toString() && !m.read
      ).length;

      // Map messages: convert `content` to `text`
      const messages = chat.messages.map(m => ({
        _id: m._id,
        text: m.content || m.text || '',  // fallback for old messages
        sender: m.sender,
        read: m.read,
        delivered: true,
        createdAt: m.createdAt
      }));

      return {
        _id: chat._id,
        participants: chat.participants,
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
    const chat = await Chat.findById(req.params.chatId)
      .populate('participants', 'name profilePicture');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Check if user is participant
    if (!chat.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Map messages: convert `content` to `text`
    const messages = chat.messages.map(m => ({
      _id: m._id,
      text: m.content || m.text || '',
      sender: m.sender,
      read: m.read,
      delivered: true,
      createdAt: m.createdAt
    }));

    res.json({
      _id: chat._id,
      participants: chat.participants,
      messages
    });
  } catch (err) {
    console.error('Error in GET /:chatId:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/chat/send – send a message
router.post('/send', auth, async (req, res) => {
  try {
    const { chatId, text } = req.body;
    if (!chatId || !text) return res.status(400).json({ message: 'chatId and text required' });

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.participants.includes(req.user._id)) {
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
      chat.participants.forEach(participantId => {
        io.to(participantId.toString()).emit('newMessage', {
          chatId: chat._id,
          message: {
            ...responseMessage,
            senderId: savedMessage.sender,
            senderName: req.user.name
          }
        });
      });
    }

    res.status(201).json(responseMessage);
  } catch (err) {
    console.error('Error in POST /send:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/chat/:chatId/read – mark messages as read
router.post('/:chatId/read', auth, async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user._id;
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    let updated = false;
    chat.messages.forEach(msg => {
      if (msg.sender.toString() !== userId.toString() && !msg.read) {
        msg.read = true;
        updated = true;
      }
    });
    if (updated) await chat.save();

    const io = req.app.get('io');
    if (io) {
      chat.participants.forEach(participantId => {
        if (participantId.toString() !== userId.toString()) {
          io.to(participantId.toString()).emit('messagesRead', {
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

// POST /api/chat/start – start a new chat with another user
router.post('/start', auth, async (req, res) => {
  try {
    const { recipientId, houseId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ message: 'recipientId is required' });
    }

    // Check if a chat already exists
    let chat;
    if (houseId) {
      chat = await Chat.findOne({
        participants: { $all: [req.user._id, recipientId], $size: 2 },
        house: houseId
      });
    } else {
      chat = await Chat.findOne({
        participants: { $all: [req.user._id, recipientId], $size: 2 },
        house: { $exists: false }
      });
    }

    if (chat) {
      return res.json({ chatId: chat._id });
    }

    // Create new chat
    chat = new Chat({
      participants: [req.user._id, recipientId],
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