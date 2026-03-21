const token = localStorage.getItem("token");
if (!token) {
  console.log("No token, redirecting to login");
  window.location = "login.html";
}

console.log("Token found, user ID:", getUserIdFromToken());

let socket;
let currentChatId = null;
let chats = [];

const chatListEl = document.getElementById("chatList");
const mainChatEl = document.getElementById("mainChat");

const urlParams = new URLSearchParams(window.location.search);
const urlChatId = urlParams.get('chatId');
console.log("URL chatId:", urlChatId);

function connectSocket() {
  console.log("Connecting socket with token...");
  socket = io({
    auth: { token },
    transports: ['websocket']
  });
  socket.on("connect", () => console.log("✅ Socket connected, ID:", socket.id));
  socket.on("connect_error", (err) => {
    console.error("❌ Socket connection error:", err.message);
  });
  socket.on("newMessage", (data) => {
    console.log("New message received:", data);
    if (data.chatId === currentChatId) {
      appendMessage(data.message, true);
      // 🔊 Play notification sound
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(e => console.log("Audio play failed:", e));
    }
    loadChats(); // refresh list
  });
}
connectSocket();

async function loadChats() {
  console.log("Loading chats...");
  try {
    const res = await fetch("/api/chat/my", {
      headers: { Authorization: "Bearer " + token }
    });
    console.log("Chats response status:", res.status);
    if (!res.ok) throw new Error("Failed to load chats");
    chats = await res.json();
    console.log("Chats loaded:", chats.length);
    renderChatList();

    if (urlChatId) {
      console.log("Loading chat from URL:", urlChatId);
      loadChat(urlChatId);
    } else if (chats.length > 0) {
      currentChatId = chats[0]._id;
      loadChat(currentChatId);
    } else {
      mainChatEl.innerHTML = '<div class="no-chat">No conversations yet</div>';
    }
  } catch (err) {
    console.error("Failed to load chats:", err);
    mainChatEl.innerHTML = '<div class="no-chat">Error loading chats</div>';
  }
}

function renderChatList() {
  chatListEl.innerHTML = "";
  chats.forEach(chat => {
    const other = chat.participants.find(p => p._id !== getUserIdFromToken());
    const lastMsg = chat.messages.length ? chat.messages[chat.messages.length-1] : null;
    const item = document.createElement("li");
    item.className = `chat-item ${chat._id === currentChatId ? 'active' : ''}`;
    item.onclick = () => loadChat(chat._id);
    item.innerHTML = `
      <h4>${other ? other.name : 'Unknown'}</h4>
      <p>${lastMsg ? lastMsg.content.substring(0,30) + '...' : 'No messages'}</p>
      <small>${chat.house ? chat.house.name : 'General'}</small>
    `;
    chatListEl.appendChild(item);
  });
}

async function loadChat(chatId) {
  console.log("Loading chat:", chatId);
  try {
    const res = await fetch("/api/chat/" + chatId, {
      headers: { Authorization: "Bearer " + token }
    });
    console.log("Load chat response status:", res.status);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Chat not found: ${err}`);
    }
    const chat = await res.json();
    console.log("Chat loaded:", chat);
    currentChatId = chat._id;
    renderChat(chat);
  } catch (err) {
    console.error("Failed to load chat:", err);
    mainChatEl.innerHTML = '<div class="no-chat">Conversation not found</div>';
  }
}

function renderChat(chat) {
  const other = chat.participants.find(p => p._id !== getUserIdFromToken());
  mainChatEl.innerHTML = `
    <div class="chat-header">Chat with ${other ? other.name : 'Unknown'} about ${chat.house ? chat.house.name : 'property'}</div>
    <div class="messages" id="messages"></div>
    <div class="input-area">
      <input type="text" id="messageInput" placeholder="Type a message..." autocomplete="off">
      <button id="sendBtn">Send</button>
    </div>
  `;
  const messagesEl = document.getElementById("messages");
  chat.messages.forEach(msg => {
    appendMessage(msg, false);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;

  document.getElementById("sendBtn").onclick = sendMessage;
  document.getElementById("messageInput").onkeypress = (e) => {
    if (e.key === "Enter") sendMessage();
  };
}

function appendMessage(msg, fromSocket) {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;
  const userId = getUserIdFromToken();
  const isSent = msg.sender._id === userId;
  const div = document.createElement("div");
  div.className = `message ${isSent ? 'sent' : 'received'}`;
  div.innerHTML = `
    <div>${msg.content}</div>
    <small>${new Date(msg.createdAt).toLocaleTimeString()}</small>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const content = input.value.trim();
  if (!content || !currentChatId) return;
  console.log("Sending message:", content);
  input.value = "";
  const tempMsg = { content, sender: { _id: getUserIdFromToken() }, createdAt: new Date() };
  appendMessage(tempMsg, false);
  socket.emit("sendMessage", { chatId: currentChatId, content });
}

function getUserIdFromToken() {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch (e) {
    console.error("Failed to decode token", e);
    return null;
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location = "login.html";
}

loadChats();