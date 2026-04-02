// chat.js – final with delete, image upload, no duplicates
let socket;
let currentChatId = null;
let currentOtherUser = null;
let chats = [];
let typingTimeout = null;
let currentUser = null;

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
    console.error("Socket error:", err);
    document.getElementById("mainChat").innerHTML = `<div class="no-chat"><p>Connection failed. Refresh.</p></div>`;
  });
  socket.on("newMessage", (data) => {
    const { chatId, message } = data;
    if (currentChatId === chatId) {
      const existing = document.querySelector(`.message[data-id="${message._id}"]`);
      if (!existing) appendMessageToDOM(message, document.getElementById("messagesContainer"));
      markMessagesAsRead(currentChatId);
    }
    updateChatList();
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
  socket.on("messageDeleted", ({ chatId, messageId }) => {
    if (chatId === currentChatId) {
      const msgElement = document.querySelector(`.message[data-id="${messageId}"]`);
      if (msgElement) msgElement.remove();
    }
    updateChatList();
  });
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
        // load directly
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
          }
        } catch (err) { console.error(err); }
      }
    }
  } catch (err) {
    console.error("Error loading chats:", err);
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
    const other = chat.participants.find(p => p && p._id !== currentUser._id);
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
        ${unread ? `<span class="unread-badge">${unread}</span>` : ""}
      </div>
    `;
    container.appendChild(item);
  });
}

async function selectChat(chatId, otherUser) {
  if (currentChatId === chatId) return;
  currentChatId = chatId;
  currentOtherUser = otherUser;
  await loadMessages(chatId);
  updateChatList();
  markMessagesAsRead(chatId);
}

async function loadMessages(chatId) {
  try {
    const res = await fetch(`/api/chat/${chatId}`, { headers: { Authorization: "Bearer " + token } });
    if (res.status === 403) {
      console.warn("Not authorized, reloading chats");
      await loadChats();
      return;
    }
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    const chat = await res.json();
    renderMessages(chat.messages);
    renderChatHeader(chat);
    const messagesDiv = document.querySelector(".messages");
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } catch (err) {
    console.error(err);
    document.getElementById("mainChat").innerHTML = `<div class="no-chat"><p>Failed to load messages</p></div>`;
  }
}

function renderChatHeader(chat) {
  const other = chat.participants.find(p => p && p._id !== currentUser._id);
  const mainChatDiv = document.getElementById("mainChat");
  if (!mainChatDiv) return;
  mainChatDiv.innerHTML = `
    <div class="chat-header">
      <div class="avatar">${other?.name?.charAt(0) || "?"}</div>
      <div class="chat-header-info">
        <h3>${other?.name || "User"}</h3>
        <p class="typing-indicator" style="display:none;">Typing...</p>
      </div>
    </div>
    <div class="messages" id="messagesContainer"></div>
    <div class="input-area">
      <button class="attach-btn" id="attachBtn"><i class="fas fa-paperclip"></i></button>
      <input type="text" id="messageInput" placeholder="Type a message..." autocomplete="off">
      <button id="sendBtn"><i class="fas fa-paper-plane"></i></button>
      <input type="file" id="fileInput" class="file-input" accept="image/*">
    </div>
  `;
  const input = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  const attachBtn = document.getElementById("attachBtn");
  const fileInput = document.getElementById("fileInput");
  if (input && sendBtn) {
    input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
    input.addEventListener("input", () => {
      socket.emit("typing", { chatId: currentChatId, isTyping: true });
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => socket.emit("typing", { chatId: currentChatId, isTyping: false }), 1000);
    });
    sendBtn.onclick = sendMessage;
    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = uploadImage;
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
  let contentHtml = "";
  if (msg.type === "image") {
    contentHtml = `<img src="${msg.text}" alt="image" style="max-width:200px; max-height:200px; border-radius:12px;">`;
  } else {
    contentHtml = `<div class="message-text">${escapeHtml(msg.text)}</div>`;
  }
  div.innerHTML = `
    ${contentHtml}
    <div class="message-time">
      ${new Date(msg.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
      ${isSent ? `<span class="message-status">${getStatusIcon(msg)}</span>` : ""}
    </div>
    ${isSent ? `<div class="message-delete" onclick="deleteMessage('${msg._id}')"><i class="fas fa-trash-alt"></i></div>` : ""}
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function getStatusIcon(msg) {
  if (msg.read) return '<i class="fas fa-check-double" style="color:#34b7f1;"></i>';
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
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ chatId: currentChatId, text, type: "text" })
    });
    const data = await res.json();
    if (res.ok) {
      const tempMsg = {
        _id: data._id,
        text: data.text,
        sender: data.sender,
        createdAt: data.createdAt,
        read: false,
        delivered: false,
        type: "text"
      };
      appendMessageToDOM(tempMsg, document.getElementById("messagesContainer"));
      input.value = "";
      socket.emit("sendMessage", { chatId: currentChatId, text, messageId: data._id });
    } else {
      alert("Failed to send: " + data.message);
    }
  } catch (err) {
    console.error(err);
    alert("Network error");
  } finally {
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

async function uploadImage() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  if (!file) return;
  // Convert to base64 or upload to Cloudinary
  const reader = new FileReader();
  reader.onload = async (e) => {
    const imageData = e.target.result;
    // Send as message
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ chatId: currentChatId, text: imageData, type: "image" })
      });
      const data = await res.json();
      if (res.ok) {
        const tempMsg = {
          _id: data._id,
          text: data.text,
          sender: data.sender,
          createdAt: data.createdAt,
          read: false,
          delivered: false,
          type: "image"
        };
        appendMessageToDOM(tempMsg, document.getElementById("messagesContainer"));
        socket.emit("sendMessage", { chatId: currentChatId, text: imageData, messageId: data._id });
      } else {
        alert("Image send failed");
      }
    } catch (err) {
      console.error(err);
      alert("Upload error");
    }
  };
  reader.readAsDataURL(file);
  fileInput.value = "";
}

async function deleteMessage(messageId) {
  if (!confirm("Delete this message?")) return;
  try {
    const res = await fetch(`/api/chat/${currentChatId}/message/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });
    if (res.ok) {
      const msgElement = document.querySelector(`.message[data-id="${messageId}"]`);
      if (msgElement) msgElement.remove();
    } else {
      alert("Delete failed");
    }
  } catch (err) {
    console.error(err);
    alert("Network error");
  }
}

async function markMessagesAsRead(chatId) {
  try {
    await fetch(`/api/chat/${chatId}/read`, { method: "POST", headers: { Authorization: "Bearer " + token } });
    socket.emit("readMessages", { chatId });
    updateChatList();
  } catch (err) { console.error(err); }
}

function updateReadStatus() {
  document.querySelectorAll(".message.sent .message-status").forEach(span => {
    span.innerHTML = '<i class="fas fa-check-double" style="color:#34b7f1;"></i>';
  });
}

function updateOnlineStatus(userId, online) {
  if (currentOtherUser && currentOtherUser._id === userId) {
    const typingDiv = document.querySelector(".typing-indicator");
    if (typingDiv) typingDiv.style.display = online ? "block" : "none";
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
    } else throw new Error();
  } catch (err) {
    window.location = "login.html";
  }
}
loadCurrentUser();