// chat.js – fully working with debug logging
let socket;
let currentChatId = null;
let currentOtherUser = null;
let chats = [];
let typingTimeout = null;
let currentUser = null;

function getToken() {
  return localStorage.getItem("token");
}

// Check token
const token = getToken();
if (!token) {
  console.error("No token found, redirecting to login");
  window.location = "login.html";
}

// Debug: log token existence
console.log("Token found:", !!token);

function initSocket() {
  console.log("Initializing socket...");
  socket = io({
    auth: { token: token },
    transports: ['websocket', 'polling'] // fallback
  });

  socket.on("connect", () => {
    console.log("Socket connected successfully");
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
    document.getElementById("mainChat").innerHTML = `
      <div class="no-chat">
        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #e74c3c;"></i>
        <p>Unable to connect to chat server. Please refresh or try again later.</p>
      </div>
    `;
  });

  socket.on("newMessage", (data) => {
    console.log("Received newMessage", data);
    const { chatId, message } = data;
    if (currentChatId === chatId) {
      appendMessageToDOM(message, document.getElementById("messagesContainer"));
      markMessagesAsRead(currentChatId);
    }
    updateChatList();
    if (message.senderId !== currentUser?._id && currentChatId !== chatId) {
      if (Notification.permission === "granted") {
        new Notification("New message from " + (message.senderName || "Someone"), {
          body: message.text
        });
      }
    }
  });

  socket.on("messagesRead", ({ chatId }) => {
    console.log("Messages read event for chat", chatId);
    if (chatId === currentChatId) {
      updateReadStatus();
    }
    updateChatList();
  });

  socket.on("typing", ({ chatId, userId, isTyping }) => {
    if (chatId === currentChatId && userId !== currentUser._id) {
      const typingDiv = document.querySelector(".typing-indicator");
      if (typingDiv) typingDiv.style.display = isTyping ? "block" : "none";
    }
  });

  socket.on("userOnline", ({ userId, online }) => {
    console.log("User online status", userId, online);
    updateOnlineStatus(userId, online);
  });
}

async function loadChats() {
  console.log("Loading chats...");
  try {
    const res = await fetch("/api/chat/my", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    chats = await res.json();
    console.log("Chats loaded:", chats.length);
    updateChatList();
    if (currentChatId) {
      const stillExists = chats.some(c => c._id === currentChatId);
      if (!stillExists) {
        currentChatId = null;
        currentOtherUser = null;
        document.getElementById("mainChat").innerHTML = '<div class="no-chat"><i class="fas fa-comment-dots"></i><p>Select a conversation</p></div>';
      } else {
        loadMessages(currentChatId);
      }
    }
  } catch (err) {
    console.error("Error loading chats:", err);
    document.getElementById("mainChat").innerHTML = `
      <div class="no-chat">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load conversations. Please refresh the page.</p>
        <small>${err.message}</small>
      </div>
    `;
  }
}

function updateChatList() {
  const container = document.getElementById("chatList");
  if (!container) return;
  container.innerHTML = "";
  if (!chats.length) {
    container.innerHTML = '<li style="padding:1rem; text-align:center; color:#94a3b8;">No conversations yet</li>';
    return;
  }
  chats.forEach(chat => {
    const other = chat.participants.find(p => p._id !== currentUser._id);
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
        ${unread ? `<span class="badge" style="background:#2563eb; color:white; border-radius:12px; padding:2px 6px; margin-left:5px;">${unread}</span>` : ""}
      </div>
    `;
    container.appendChild(item);
  });
}

async function selectChat(chatId, otherUser) {
  console.log("Selecting chat", chatId);
  currentChatId = chatId;
  currentOtherUser = otherUser;
  await loadMessages(chatId);
  updateChatList();
  markMessagesAsRead(chatId);
}

async function loadMessages(chatId) {
  console.log("Loading messages for chat", chatId);
  try {
    const res = await fetch(`/api/chat/${chatId}`, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error("Failed to load messages");
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
        <p>Failed to load messages.</p>
      </div>
    `;
  }
}

function renderChatHeader(chat) {
  const other = chat.participants.find(p => p._id !== currentUser._id);
  const mainChatDiv = document.getElementById("mainChat");
  if (!mainChatDiv) return;
  const isOnline = chat.online || false;
  mainChatDiv.innerHTML = `
    <div class="chat-header">
      <div class="avatar">
        <span>${other.name?.charAt(0) || "?"}</span>
        <span class="online-dot" style="display: ${isOnline ? 'block' : 'none'}"></span>
      </div>
      <div class="chat-header-info">
        <h3>${other.name || "User"}</h3>
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
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });
    input.addEventListener("input", () => {
      socket.emit("typing", { chatId: currentChatId, isTyping: true });
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit("typing", { chatId: currentChatId, isTyping: false });
      }, 1000);
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
  div.setAttribute("data-id", msg._id);
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
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await fetch("/api/chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ chatId: currentChatId, text })
    });
    const data = await res.json();
    if (res.ok) {
      const tempMsg = {
        _id: data._id,
        text: data.text,
        sender: data.sender,
        createdAt: data.createdAt,
        read: false,
        delivered: false
      };
      appendMessageToDOM(tempMsg, document.getElementById("messagesContainer"));
      input.value = "";
      socket.emit("sendMessage", { chatId: currentChatId, text, messageId: data._id });
    } else {
      alert("Failed to send: " + data.message);
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
    await fetch(`/api/chat/${chatId}/read`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    });
    socket.emit("readMessages", { chatId });
    updateChatList();
  } catch (err) {
    console.error("Error marking read:", err);
  }
}

function updateReadStatus() {
  const messages = document.querySelectorAll(".message.sent .message-status");
  messages.forEach(span => {
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
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}

async function loadCurrentUser() {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: "Bearer " + token }
    });
    if (res.ok) {
      currentUser = await res.json();
      console.log("Current user loaded:", currentUser.name);
      initSocket();
      loadChats();
    } else {
      throw new Error("Not authenticated");
    }
  } catch (err) {
    console.error("Failed to load user:", err);
    window.location = "login.html";
  }
}

loadCurrentUser();

if ("Notification" in window) {
  Notification.requestPermission();
}