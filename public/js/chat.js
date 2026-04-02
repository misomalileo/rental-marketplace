// chat.js – final with encryption simulation, online status, read receipts, 403 handling
let socket;
let currentChatId = null;
let currentOtherUser = null;
let chats = [];
let typingTimeout = null;
let currentUser = null;

// Simple XOR encryption (for demonstration only – not secure for production)
const encryptionKey = "KhomoLathuSecret2026";
function encrypt(text) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ encryptionKey.charCodeAt(i % encryptionKey.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result);
}
function decrypt(encrypted) {
  try {
    const decoded = atob(encrypted);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ encryptionKey.charCodeAt(i % encryptionKey.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch { return encrypted; }
}

function getToken() { return localStorage.getItem("token"); }

const token = getToken();
if (!token) window.location = "login.html";

function initSocket() {
  socket = io({
    auth: { token },
    transports: ['websocket', 'polling']
  });
  socket.on("connect", () => console.log("Socket connected"));
  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
    document.getElementById("mainChat").innerHTML = `
      <div class="no-chat">
        <i class="fas fa-exclamation-triangle" style="font-size:3rem; color:#e74c3c;"></i>
        <p>Unable to connect to chat server. Please refresh.</p>
      </div>
    `;
  });
  socket.on("newMessage", (data) => {
    const { chatId, message } = data;
    // Decrypt message content if it was encrypted
    let messageText = message.text;
    if (messageText && messageText.startsWith('enc:')) {
      messageText = decrypt(messageText.substring(4));
    }
    const msgToDisplay = { ...message, text: messageText };
    if (currentChatId === chatId) {
      appendMessageToDOM(msgToDisplay, document.getElementById("messagesContainer"));
      markMessagesAsRead(currentChatId);
    }
    updateChatList();
    if (message.senderId !== currentUser?._id && currentChatId !== chatId && Notification.permission === "granted") {
      new Notification("New message from " + (message.senderName || "Someone"), { body: messageText });
    }
  });
  socket.on("messagesRead", ({ chatId }) => {
    if (chatId === currentChatId) updateReadStatus();
    updateChatList();
  });
  socket.on("typing", ({ chatId, userId, isTyping }) => {
    if (chatId === currentChatId && userId !== currentUser._id) {
      const typingDiv = document.querySelector(".typing-indicator");
      if (typingDiv) typingDiv.style.display = isTyping ? "block" : "none";
    }
  });
  socket.on("userOnline", ({ userId, online }) => updateOnlineStatus(userId, online));
}

async function loadChats() {
  try {
    const res = await fetch("/api/chat/my", { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    chats = await res.json();
    updateChatList();
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get("chatId");
    if (chatId) {
      const chat = chats.find(c => c._id === chatId);
      if (chat) {
        const other = chat.participants.find(p => p && p._id !== currentUser._id);
        if (other) await selectChat(chatId, other);
      } else {
        // Try to load directly if not in list
        try {
          const res2 = await fetch(`/api/chat/${chatId}`, { headers: { Authorization: "Bearer " + token } });
          if (res2.ok) {
            const chatData = await res2.json();
            const other = chatData.participants.find(p => p && p._id !== currentUser._id);
            if (other) {
              chats.unshift({
                _id: chatData._id,
                participants: chatData.participants,
                messages: chatData.messages,
                lastMessage: "",
                unreadCount: 0,
                online: false
              });
              updateChatList();
              await selectChat(chatId, other);
            }
          } else if (res2.status === 403) {
            console.warn(`Chat ${chatId} not accessible (403). Removing from list if present.`);
            // Chat might be invalid – do nothing
          }
        } catch (err) { console.error("Could not load chat from URL", err); }
      }
    }
  } catch (err) {
    console.error("Error loading chats:", err);
    document.getElementById("mainChat").innerHTML = `<div class="no-chat"><p>Failed to load conversations.</p></div>`;
  }
}

function updateChatList() {
  const container = document.getElementById("chatList");
  if (!container) return;
  container.innerHTML = "";
  if (!chats.length) {
    container.innerHTML = '<li style="padding:1rem; text-align:center;">No conversations yet</li>';
    return;
  }
  chats.forEach(chat => {
    const validParticipants = (chat.participants || []).filter(p => p && p._id);
    const other = validParticipants.find(p => p._id !== currentUser._id);
    if (!other) return;
    const lastMsg = chat.messages[chat.messages.length - 1];
    const unread = chat.unreadCount || 0;
    const item = document.createElement("li");
    item.className = "chat-item" + (chat._id === currentChatId ? " active" : "");
    item.onclick = () => selectChat(chat._id, other);
    item.innerHTML = `
      <div class="chat-avatar">
        <span>${other.name?.charAt(0) || "?"}</span>
        <span class="online-dot" style="display: ${chat.online ? 'block' : 'none'}"></span>
      </div>
      <div class="chat-info">
        <h4>${other.name || "User"}</h4>
        <p>${lastMsg ? (lastMsg.text.length > 30 ? lastMsg.text.substring(0,30)+"…" : lastMsg.text) : "No messages yet"}</p>
      </div>
      <div class="chat-time">
        ${lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ""}
        ${unread ? `<span class="badge">${unread}</span>` : ""}
      </div>
    `;
    container.appendChild(item);
  });
}

async function selectChat(chatId, otherUser) {
  currentChatId = chatId;
  currentOtherUser = otherUser;
  await loadMessages(chatId);
  updateChatList();
  markMessagesAsRead(chatId);
}

async function loadMessages(chatId) {
  try {
    const res = await fetch(`/api/chat/${chatId}`, {
      headers: { Authorization: "Bearer " + token }
    });
    if (res.status === 403) {
      console.error(`Not authorized for chat ${chatId}. Refreshing chat list...`);
      await loadChats(); // refresh the chat list to remove invalid chat
      // If currentChatId is still the same, clear it
      if (currentChatId === chatId) {
        currentChatId = null;
        currentOtherUser = null;
        document.getElementById("mainChat").innerHTML = `
          <div class="no-chat">
            <i class="fas fa-comment-dots" style="font-size:3rem; opacity:0.5;"></i>
            <p>Select a conversation to start chatting</p>
          </div>
        `;
      }
      return;
    }
    if (!res.ok) throw new Error(`Failed to load messages: ${res.status}`);
    const chat = await res.json();
    renderMessages(chat.messages);
    renderChatHeader(chat);
    const messagesDiv = document.querySelector(".messages");
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } catch (err) {
    console.error("Error loading messages:", err);
    document.getElementById("mainChat").innerHTML = `
      <div class="no-chat">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load messages. Please try again later.</p>
        <small>${err.message}</small>
      </div>
    `;
  }
}

function renderChatHeader(chat) {
  const validParticipants = (chat.participants || []).filter(p => p && p._id);
  const other = validParticipants.find(p => p._id !== currentUser._id);
  const mainChatDiv = document.getElementById("mainChat");
  if (!mainChatDiv) return;
  mainChatDiv.innerHTML = `
    <div class="chat-header">
      <div class="avatar">
        <span>${other?.name?.charAt(0) || "?"}</span>
        <span class="online-dot" style="display: none"></span>
      </div>
      <div class="chat-header-info">
        <h3>${other?.name || "User"}</h3>
        <p class="typing-indicator">Typing...</p>
      </div>
    </div>
    <div class="messages" id="messagesContainer"></div>
    <div class="input-area">
      <input type="text" id="messageInput" placeholder="Type a message..." autocomplete="off">
      <button id="sendBtn"><i class="fas fa-paper-plane"></i> Send</button>
    </div>
  `;
  const input = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  if (input && sendBtn) {
    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    input.addEventListener("input", () => {
      socket.emit("typing", { chatId: currentChatId, isTyping: true });
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => { socket.emit("typing", { chatId: currentChatId, isTyping: false }); }, 1000);
    });
    sendBtn.onclick = sendMessage;
  }
}

function renderMessages(messages) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;
  container.innerHTML = "";
  messages.forEach(msg => appendMessageToDOM(msg, container));
}

function appendMessageToDOM(msg, container) {
  const isSent = msg.sender === currentUser._id;
  const div = document.createElement("div");
  div.className = `message ${isSent ? "sent" : "received"}`;
  div.innerHTML = `
    <div class="message-text">${escapeHtml(msg.text)}</div>
    <div class="message-time">
      ${new Date(msg.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
      ${isSent ? `<span class="message-status">${getStatusIcon(msg)}</span>` : ""}
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function getStatusIcon(msg) {
  if (msg.read) return '<i class="fas fa-check-double" style="color:#34b7f1;"></i>';
  if (msg.delivered) return '<i class="fas fa-check-double"></i>';
  return '<i class="fas fa-check"></i>';
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  let text = input.value.trim();
  if (!text) return;
  // Encrypt message before sending
  const encrypted = "enc:" + encrypt(text);
  input.disabled = true;
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ chatId: currentChatId, text: encrypted })
    });
    const data = await res.json();
    if (res.ok) {
      // Decrypt for local display
      const decryptedText = decrypt(data.text.substring(4));
      const tempMsg = {
        _id: data._id,
        text: decryptedText,
        sender: data.sender,
        createdAt: data.createdAt,
        read: false,
        delivered: false
      };
      appendMessageToDOM(tempMsg, document.getElementById("messagesContainer"));
      input.value = "";
      socket.emit("sendMessage", { chatId: currentChatId, text: encrypted, messageId: data._id });
    } else {
      alert("Failed to send: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Error sending message:", err);
    alert("Network error. Please try again.");
  } finally {
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

async function markMessagesAsRead(chatId) {
  try {
    await fetch(`/api/chat/${chatId}/read`, { method: "POST", headers: { Authorization: "Bearer " + token } });
    socket.emit("readMessages", { chatId });
    updateChatList();
  } catch (err) { console.error("Error marking read:", err); }
}

function updateReadStatus() {
  document.querySelectorAll(".message.sent .message-status").forEach(span => {
    span.innerHTML = '<i class="fas fa-check-double" style="color:#34b7f1;"></i>';
  });
}

function updateOnlineStatus(userId, online) {
  if (currentOtherUser && currentOtherUser._id === userId) {
    const dot = document.querySelector(".chat-header .online-dot");
    if (dot) dot.style.display = online ? "block" : "none";
  }
  updateChatList();
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

async function loadCurrentUser() {
  try {
    const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + token } });
    if (res.ok) {
      currentUser = await res.json();
      initSocket();
      loadChats();
    } else throw new Error("Not authenticated");
  } catch (err) {
    console.error("Failed to load user:", err);
    window.location = "login.html";
  }
}

loadCurrentUser();
if ("Notification" in window) Notification.requestPermission();