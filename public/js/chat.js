let socket;
let currentChatId = null;
let currentOtherUser = null;
let chats = [];
let typingTimeout = null;
let currentUser = null;
let currentContextMessage = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function getToken() { return localStorage.getItem("token"); }
const token = getToken();
if (!token) window.location = "login.html";

// ========== CUSTOM MODAL (replaces alert/confirm) ==========
function showModal(message, type = 'info', onConfirm = null, onCancel = null) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';
  let icon = '<i class="fas fa-info-circle"></i>';
  let title = 'Information';
  if (type === 'success') { icon = '<i class="fas fa-check-circle" style="color: #10b981;"></i>'; title = 'Success'; }
  else if (type === 'error') { icon = '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>'; title = 'Error'; }
  else if (type === 'confirm') { icon = '<i class="fas fa-question-circle" style="color: #f59e0b;"></i>'; title = 'Confirmation'; }
  overlay.innerHTML = `<div class="custom-modal">${icon}<h3>${title}</h3><p>${message}</p><div class="custom-modal-buttons">${type === 'confirm' ? '<button class="custom-modal-btn confirm">Yes, Proceed</button><button class="custom-modal-btn cancel">Cancel</button>' : '<button class="custom-modal-btn confirm">OK</button>'}</div></div>`;
  document.body.appendChild(overlay);
  const confirmBtn = overlay.querySelector('.confirm');
  const cancelBtn = overlay.querySelector('.cancel');
  confirmBtn?.addEventListener('click', () => { overlay.remove(); if (onConfirm) onConfirm(); });
  cancelBtn?.addEventListener('click', () => { overlay.remove(); if (onCancel) onCancel(); });
}

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
      scrollMessagesToBottom();
    }
    updateChatList();
    if (message.senderId !== currentUser?._id && currentChatId !== chatId && Notification.permission === "granted") {
      new Notification("New message from " + (message.senderName || "Someone"), { body: message.text?.substring(0, 50) || "Media" });
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
  socket.on("messageDeleted", ({ chatId, messageId }) => {
    if (chatId === currentChatId) {
      const msg = document.querySelector(`.message[data-id="${messageId}"]`);
      if (msg) msg.remove();
    }
    updateChatList();
  });
  socket.on("chatDeleted", ({ chatId }) => {
    if (currentChatId === chatId) {
      currentChatId = null;
      currentOtherUser = null;
      document.getElementById("mainChat").innerHTML = `<div class="no-chat"><i class="fas fa-comment-dots"></i><p>Conversation deleted</p></div>`;
      if (window.innerWidth <= 768) document.getElementById("sidebar").classList.remove("hide");
    }
    loadChats();
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
    container.innerHTML = '<li style="padding:0.8rem; text-align:center; color:#64748b;">No conversations yet</li>';
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
        <p>${lastMsg ? (lastMsg.text?.length > 25 ? lastMsg.text.substring(0,25)+"…" : (lastMsg.text || "Media")) : "No messages yet"}</p>
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
  if (otherUser._id) {
    try {
      const res = await fetch(`/api/auth/user/${otherUser._id}`, { headers: { Authorization: "Bearer " + token } });
      if (res.ok) {
        const userData = await res.json();
        updateLastSeen(userData.lastSeen, userData.online);
      }
    } catch (err) { console.error("Failed to fetch last seen", err); }
  }
  // On mobile, hide sidebar and show chat
  if (window.innerWidth <= 768) {
    document.getElementById("sidebar").classList.add("hide");
  }
}

function updateLastSeen(lastSeen, online) {
  const statusEl = document.querySelector(".chat-header-info p:not(.typing-indicator)");
  if (!statusEl) return;
  if (online) {
    statusEl.innerHTML = "Online";
  } else if (lastSeen) {
    const seenDate = new Date(lastSeen);
    const now = new Date();
    const diff = Math.floor((now - seenDate) / 1000 / 60);
    if (diff < 1) statusEl.innerHTML = "Last seen just now";
    else if (diff < 60) statusEl.innerHTML = `Last seen ${diff} min ago`;
    else statusEl.innerHTML = `Last seen ${seenDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  } else {
    statusEl.innerHTML = "Offline";
  }
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
    if (!document.getElementById("messagesContainer")) {
      renderChatHeader(chat);
    }
    renderMessages(chat.messages);
    scrollMessagesToBottom();
    attachScrollToBottomButton();
  } catch (err) {
    console.error("Error loading messages:", err);
    document.getElementById("mainChat").innerHTML = `<div class="no-chat"><p>Failed to load messages</p></div>`;
  }
}

function renderChatHeader(chat) {
  const other = chat.participants.find(p => p && p._id !== currentUser._id);
  const mainChatDiv = document.getElementById("mainChat");
  if (!mainChatDiv) return;
  mainChatDiv.innerHTML = `
    <div class="chat-header">
      <button class="mobile-back" id="mobileBackBtn"><i class="fas fa-arrow-left"></i></button>
      <div class="avatar">${other?.name?.charAt(0) || "?"}</div>
      <div class="chat-header-info">
        <h3>${other?.name || "User"}</h3>
        <p class="status-text">Online</p>
        <p class="typing-indicator" style="display:none;">Typing...</p>
      </div>
      <div class="chat-actions">
        <i class="fas fa-trash-alt" id="deleteChatBtn" title="Delete conversation"></i>
      </div>
    </div>
    <div class="quick-replies" id="quickReplies"></div>
    <div class="messages" id="messagesContainer"></div>
    <div class="input-area">
      <button class="emoji-btn" id="emojiBtn"><i class="far fa-smile-wink"></i></button>
      <button class="attach-btn" id="attachBtn"><i class="fas fa-paperclip"></i></button>
      <button class="voice-btn" id="voiceBtn"><i class="fas fa-microphone"></i></button>
      <input type="text" id="messageInput" placeholder="Type a message..." autocomplete="off">
      <button class="send-btn" id="sendBtn"><i class="fas fa-paper-plane"></i></button>
    </div>
    <div class="scroll-to-bottom" id="scrollToBottomBtn"><i class="fas fa-arrow-down"></i></div>
  `;
  document.getElementById("mobileBackBtn")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("hide");
    currentChatId = null;
    currentOtherUser = null;
    mainChatDiv.innerHTML = `<div class="no-chat"><i class="fas fa-comment-dots"></i><p>Select a conversation</p></div>`;
  });
  document.getElementById("deleteChatBtn").addEventListener("click", () => deleteChat());
  document.getElementById("attachBtn").addEventListener("click", () => attachFile());
  document.getElementById("emojiBtn").addEventListener("click", () => toggleEmojiPicker());
  document.getElementById("voiceBtn").addEventListener("click", () => toggleVoiceRecording());
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
  // Quick replies
  const quickContainer = document.getElementById("quickReplies");
  const replies = ["🏠 Is this house available?", "💰 What's the price?", "👀 Can I view it?"];
  quickContainer.innerHTML = replies.map(text => `<button class="quick-reply-btn" data-text="${text}">${text}</button>`).join("");
  document.querySelectorAll(".quick-reply-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("messageInput").value = btn.getAttribute("data-text");
      sendMessage();
    });
  });
  attachScrollToBottomButton();
}

function toggleEmojiPicker() {
  let picker = document.querySelector("emoji-picker");
  if (!picker) {
    picker = document.createElement("emoji-picker");
    picker.classList.add("emoji-picker-container");
    document.body.appendChild(picker);
    picker.addEventListener("emoji-click", (e) => {
      const input = document.getElementById("messageInput");
      if (input) {
        input.value += e.detail.unicode;
        input.focus();
      }
      picker.style.display = "none";
    });
  }
  if (picker.style.display === "none" || !picker.style.display) {
    picker.style.display = "block";
  } else {
    picker.style.display = "none";
  }
}

async function toggleVoiceRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (event) => { audioChunks.push(event.data); };
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const file = new File([audioBlob], "voice-message.webm", { type: 'audio/webm' });
      await sendAudioFile(file);
      stream.getTracks().forEach(track => track.stop());
      document.getElementById("voiceBtn").innerHTML = '<i class="fas fa-microphone"></i>';
      isRecording = false;
    };
    mediaRecorder.start();
    isRecording = true;
    document.getElementById("voiceBtn").innerHTML = '<i class="fas fa-stop-circle"></i>';
    setTimeout(() => { if (isRecording) stopRecording(); }, 60000);
  } catch (err) {
    console.error("Microphone error:", err);
    showModal("Could not access microphone. Please check permissions.", "error");
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) mediaRecorder.stop();
}

async function sendAudioFile(file) {
  const formData = new FormData();
  formData.append("image", file);
  try {
    const uploadRes = await fetch("/api/chat/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (uploadRes.ok) {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ chatId: currentChatId, text: uploadData.url, type: "audio" })
      });
      if (res.ok) {
        const data = await res.json();
        const tempMsg = {
          _id: data._id,
          text: data.text,
          sender: data.sender,
          createdAt: data.createdAt,
          read: false,
          delivered: false,
          type: "audio"
        };
        appendMessageToDOM(tempMsg, document.getElementById("messagesContainer"));
        socket.emit("sendMessage", { chatId: currentChatId, text: uploadData.url, messageId: data._id, type: "audio" });
        scrollMessagesToBottom();
      } else {
        showModal("Failed to send voice message", "error");
      }
    } else {
      showModal("Upload failed", "error");
    }
  } catch (err) {
    console.error("Voice upload error:", err);
    showModal("Network error", "error");
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
  let content = "";
  if (msg.type === "image") {
    content = `<img src="${msg.text}" style="max-width:180px; border-radius:12px; cursor:pointer;" onclick="window.open('${msg.text}')">`;
  } else if (msg.type === "audio") {
    content = `<div class="audio-message"><audio controls src="${msg.text}" style="max-width:180px; height:32px;"></audio></div>`;
  } else {
    content = `<div class="message-text">${escapeHtml(msg.text)}</div>`;
  }
  div.innerHTML = `
    ${content}
    <div class="message-time">
      ${new Date(msg.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
      ${isSent ? `<span class="message-status">${getStatusIcon(msg)}</span>` : ""}
    </div>
  `;
  container.appendChild(div);
  if (isSent) {
    div.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      currentContextMessage = msg._id;
      showContextMenu(e.clientX, e.clientY);
    });
    div.addEventListener("touchstart", (e) => {
      let timer;
      timer = setTimeout(() => {
        currentContextMessage = msg._id;
        showContextMenu(e.touches[0].clientX, e.touches[0].clientY);
      }, 500);
      div.addEventListener("touchend", () => clearTimeout(timer));
      div.addEventListener("touchmove", () => clearTimeout(timer));
    });
  }
  // Reaction picker (long press)
  div.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showReactionPicker(e.clientX, e.clientY, msg._id);
  });
  div.addEventListener("touchstart", (e) => {
    let timer;
    timer = setTimeout(() => {
      showReactionPicker(e.touches[0].clientX, e.touches[0].clientY, msg._id);
    }, 500);
    div.addEventListener("touchend", () => clearTimeout(timer));
    div.addEventListener("touchmove", () => clearTimeout(timer));
  });
}

function showReactionPicker(x, y, messageId) {
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.minWidth = "160px";
  menu.innerHTML = `
    <div data-reaction="❤️">❤️ Love</div>
    <div data-reaction="👍">👍 Like</div>
    <div data-reaction="😂">😂 Funny</div>
    <div data-reaction="😮">😮 Wow</div>
    <div data-reaction="😢">😢 Sad</div>
    <div data-reaction="😡">😡 Angry</div>
  `;
  document.body.appendChild(menu);
  document.querySelectorAll("[data-reaction]").forEach(el => {
    el.addEventListener("click", async () => {
      const emoji = el.getAttribute("data-reaction");
      await sendReaction(messageId, emoji);
      menu.remove();
    });
  });
  document.addEventListener("click", () => menu.remove(), { once: true });
}

async function sendReaction(messageId, emoji) {
  const reactionText = `Reacted with ${emoji} to a message`;
  try {
    const res = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ chatId: currentChatId, text: reactionText, type: "text" })
    });
    if (!res.ok) showModal("Failed to send reaction", "error");
  } catch (err) { console.error(err); }
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
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
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
        delivered: false,
        type: "text"
      };
      appendMessageToDOM(tempMsg, document.getElementById("messagesContainer"));
      input.value = "";
      socket.emit("sendMessage", { chatId: currentChatId, text, messageId: data._id });
      scrollMessagesToBottom();
    } else {
      showModal("Failed to send: " + (data.message || "Unknown error"), "error");
    }
  } catch (err) {
    console.error("Error sending message:", err);
    showModal("Network error. Please try again.", "error");
  } finally {
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

async function attachFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    try {
      const uploadRes = await fetch("/api/chat/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok) {
        const res = await fetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ chatId: currentChatId, text: uploadData.url, type: "image" })
        });
        if (res.ok) {
          const data = await res.json();
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
          socket.emit("sendMessage", { chatId: currentChatId, text: uploadData.url, messageId: data._id, type: "image" });
          scrollMessagesToBottom();
        } else {
          showModal("Failed to send image", "error");
        }
      } else {
        showModal("Upload failed", "error");
      }
    } catch (err) {
      console.error("Upload error:", err);
      showModal("Network error", "error");
    }
  };
  input.click();
}

function showContextMenu(x, y) {
  const existing = document.querySelector(".context-menu");
  if (existing) existing.remove();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.innerHTML = `<div id="deleteMsgBtn">Delete for me</div>`;
  document.body.appendChild(menu);
  document.getElementById("deleteMsgBtn").onclick = () => {
    deleteMessage(currentContextMessage);
    menu.remove();
  };
  document.addEventListener("click", () => menu.remove(), { once: true });
}

async function deleteMessage(messageId) {
  showModal("Delete this message?", "confirm", async () => {
    try {
      const res = await fetch(`/api/chat/message/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) {
        const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
        if (msgEl) msgEl.remove();
      } else {
        showModal("Failed to delete message", "error");
      }
    } catch (err) {
      console.error("Delete error:", err);
      showModal("Network error", "error");
    }
  });
}

async function deleteChat() {
  showModal("Delete this entire conversation? This cannot be undone.", "confirm", async () => {
    try {
      const res = await fetch(`/api/chat/${currentChatId}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) {
        currentChatId = null;
        currentOtherUser = null;
        document.getElementById("mainChat").innerHTML = `<div class="no-chat"><i class="fas fa-comment-dots"></i><p>Conversation deleted</p></div>`;
        if (window.innerWidth <= 768) document.getElementById("sidebar").classList.remove("hide");
        loadChats();
      } else {
        showModal("Failed to delete conversation", "error");
      }
    } catch (err) {
      console.error("Delete chat error:", err);
      showModal("Network error", "error");
    }
  });
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
    const statusEl = document.querySelector(".chat-header-info p:not(.typing-indicator)");
    if (statusEl) statusEl.innerHTML = online ? "Online" : "Offline";
  }
  updateChatList();
}

function scrollMessagesToBottom() {
  const container = document.getElementById("messagesContainer");
  if (container) container.scrollTop = container.scrollHeight;
  const btn = document.getElementById("scrollToBottomBtn");
  if (btn) btn.classList.remove("visible");
}

function attachScrollToBottomButton() {
  const container = document.getElementById("messagesContainer");
  const btn = document.getElementById("scrollToBottomBtn");
  if (!container || !btn) return;
  container.addEventListener("scroll", () => {
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    if (atBottom) btn.classList.remove("visible");
    else btn.classList.add("visible");
  });
  btn.addEventListener("click", () => container.scrollTo({ top: container.scrollHeight, behavior: "smooth" }));
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
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