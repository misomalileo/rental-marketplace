// ======================================
// AI Concierge Chatbot Widget – Compact & Professional
// ======================================
(function() {
  // Create the widget elements (smaller, rounded, modern)
  const widgetHtml = `
    <div id="chatbot-widget" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: 'Inter', sans-serif;">
      <div id="chatbot-toggle" style="width: 52px; height: 52px; background: linear-gradient(135deg, #2563eb, #10b981); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: all 0.2s;">
        <i class="fas fa-robot" style="color: white; font-size: 24px;"></i>
      </div>
      <div id="chatbot-panel" style="display: none; position: absolute; bottom: 70px; right: 0; width: 300px; height: 420px; background: var(--card-bg, white); border-radius: 20px; box-shadow: 0 8px 20px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--input-border, #e2e8f0);">
        <div style="background: linear-gradient(135deg, #2563eb, #1e40af); color: white; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span><i class="fas fa-robot" style="margin-right: 6px;"></i> AI Concierge</span>
          <span id="chatbot-close" style="cursor: pointer; font-size: 20px;">&times;</span>
        </div>
        <div id="chatbot-messages" style="flex: 1; overflow-y: auto; padding: 12px; background: var(--input-bg, #f9fafb); font-size: 0.8rem;">
          <div style="margin-bottom: 8px; text-align: left;">
            <div style="display: inline-block; background: var(--card-bg, white); padding: 8px 12px; border-radius: 18px; max-width: 85%; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <i class="fas fa-smile-wink" style="color: #f59e0b; margin-right: 4px;"></i> Hi! Ask me about houses, rooms, hostels, or anything.
            </div>
          </div>
        </div>
        <div style="padding: 10px; border-top: 1px solid var(--input-border, #e2e8f0); display: flex; gap: 8px;">
          <input type="text" id="chatbot-input" placeholder="Type your question..." style="flex: 1; padding: 8px 12px; border: 1px solid var(--input-border, #cbd5e1); border-radius: 40px; background: var(--input-bg, white); color: var(--text-color, #1e293b); outline: none; font-size: 0.8rem;">
          <button id="chatbot-send" style="background: #2563eb; color: white; border: none; border-radius: 40px; padding: 6px 14px; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
            <i class="fas fa-paper-plane" style="font-size: 0.7rem;"></i> Send
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', widgetHtml);

  const toggleBtn = document.getElementById('chatbot-toggle');
  const panel = document.getElementById('chatbot-panel');
  const closeBtn = document.getElementById('chatbot-close');
  const sendBtn = document.getElementById('chatbot-send');
  const input = document.getElementById('chatbot-input');
  const messagesDiv = document.getElementById('chatbot-messages');

  let isLoading = false;

  function addMessage(text, isUser = false, isHtml = false) {
    const msgDiv = document.createElement('div');
    msgDiv.style.marginBottom = '8px';
    msgDiv.style.textAlign = isUser ? 'right' : 'left';
    const content = isHtml ? text : escapeHtml(text);
    msgDiv.innerHTML = `<div style="display: inline-block; background: ${isUser ? '#2563eb' : 'var(--card-bg, white)'}; color: ${isUser ? 'white' : 'var(--text-color, #1e293b)'}; padding: 8px 12px; border-radius: 18px; max-width: 85%; font-size: 0.8rem; word-wrap: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">${content}</div>`;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function getTypeEmoji(type) {
    const map = {
      'House': '🏠',
      'Hostel': '🏨',
      'Apartment': '🏢',
      'Room': '🛏️',
      'Office': '💼'
    };
    return map[type] || '🏠';
  }

  function formatSearchResults(houses) {
    if (!houses || houses.length === 0) {
      return 'Sorry, no properties found. Try different words.';
    }
    let typeLabel = 'properties';
    if (houses.length > 0) {
      const firstType = houses[0].type;
      if (houses.every(h => h.type === firstType)) {
        if (firstType === 'House') typeLabel = 'houses';
        else if (firstType === 'Hostel') typeLabel = 'hostels';
        else if (firstType === 'Apartment') typeLabel = 'apartments';
        else if (firstType === 'Room') typeLabel = 'rooms';
        else if (firstType === 'Office') typeLabel = 'offices';
      }
    }
    let html = `<div style="font-size: 0.75rem;"><strong>${houses.length} ${typeLabel} found:</strong><ul style="margin: 6px 0 0 16px; padding-left: 0;">`;
    houses.forEach(house => {
      const emoji = getTypeEmoji(house.type);
      const linkUrl = `/?house=${house.id}`;
      html += `<li style="margin-bottom: 4px; line-height: 1.3;">
        ${emoji} <a href="${linkUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 500;">${escapeHtml(house.name)}</a> – MWK ${house.price.toLocaleString()} (${escapeHtml(house.location)})
      </li>`;
    });
    html += '</ul></div>';
    return html;
  }

  async function sendMessage() {
    const message = input.value.trim();
    if (!message || isLoading) return;
    addMessage(message, true);
    input.value = '';
    isLoading = true;

    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.style.marginBottom = '8px';
    typingDiv.style.textAlign = 'left';
    typingDiv.innerHTML = `<div style="display: inline-block; background: var(--card-bg, white); padding: 8px 12px; border-radius: 18px; font-size: 0.7rem;"><i class="fas fa-ellipsis-h"></i> typing...</div>`;
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      typingDiv.remove();

      if (data.action === 'searchResults') {
        const formatted = formatSearchResults(data.houses);
        addMessage(formatted, false, true);
      } else {
        addMessage(data.text);
      }
    } catch (err) {
      typingDiv.remove();
      addMessage("Sorry, I'm having trouble connecting. Try again later.");
    } finally {
      isLoading = false;
    }
  }

  toggleBtn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  });
  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
  });
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
})();