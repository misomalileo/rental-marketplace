// ======================================
// AI Concierge Chatbot Widget – Enhanced UI
// ======================================
(function() {
  // Create the widget elements
  const widgetHtml = `
    <div id="chatbot-widget" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: 'Inter', sans-serif;">
      <div id="chatbot-toggle" style="width: 60px; height: 60px; background: #3498db; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: transform 0.2s;">
        <i class="fas fa-robot" style="color: white; font-size: 28px;"></i>
      </div>
      <div id="chatbot-panel" style="display: none; position: absolute; bottom: 70px; right: 0; width: 350px; height: 500px; background: var(--card-bg, white); border-radius: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--input-border, #ddd);">
        <div style="background: var(--button-bg, #3498db); color: white; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span><i class="fas fa-robot"></i> AI Concierge</span>
          <span id="chatbot-close" style="cursor: pointer;">&times;</span>
        </div>
        <div id="chatbot-messages" style="flex: 1; overflow-y: auto; padding: 12px; background: var(--input-bg, #f9f9f9);">
          <div style="margin-bottom: 8px; text-align: left;">
            <div style="display: inline-block; background: var(--card-bg, white); padding: 8px 12px; border-radius: 18px; max-width: 80%; font-size: 0.85rem;">
              👋 Hi! I'm your AI concierge. Ask me anything about houses, rooms, hostels, apartments, or offices.
            </div>
          </div>
        </div>
        <div style="padding: 12px; border-top: 1px solid var(--input-border, #ddd); display: flex; gap: 8px;">
          <input type="text" id="chatbot-input" placeholder="Ask me about properties..." style="flex: 1; padding: 8px 12px; border: 1px solid var(--input-border, #ddd); border-radius: 30px; background: var(--input-bg, white); color: var(--text-color, #333); outline: none; font-size: 0.85rem;">
          <button id="chatbot-send" style="background: var(--button-bg, #3498db); color: white; border: none; border-radius: 30px; padding: 8px 16px; cursor: pointer; font-size: 0.85rem;">Send</button>
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
    msgDiv.innerHTML = `<div style="display: inline-block; background: ${isUser ? 'var(--button-bg, #3498db)' : 'var(--card-bg, white)'}; color: ${isUser ? 'white' : 'var(--text-color, #333)'}; padding: 8px 12px; border-radius: 18px; max-width: 80%; font-size: 0.85rem; word-wrap: break-word;">${content}</div>`;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
      return c;
    });
  }

  // Map property type to emoji
  function getTypeEmoji(type) {
    const map = {
      'House': '🏠',
      'Hostel': '🏨',
      'Apartment': '🏢',
      'Room': '🛏️',
      'Office': '🏢'
    };
    return map[type] || '🏠';
  }

  // Format search results with correct emojis and wording
  function formatSearchResults(houses) {
    if (!houses || houses.length === 0) {
      return 'Sorry, I couldn’t find any properties matching your request.';
    }
    // Determine the property type from the first result (if all same type)
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
    let html = `<div style="font-size: 0.8rem;"><strong>Here are some ${typeLabel} that match your request:</strong><ul style="margin: 8px 0 0 16px; padding-left: 0;">`;
    houses.forEach(house => {
      const emoji = getTypeEmoji(house.type);
      const linkUrl = `/?house=${house.id}`;
      html += `<li style="margin-bottom: 6px; line-height: 1.3;">
        ${emoji} <a href="${linkUrl}" target="_blank" style="color: var(--button-bg, #3498db); text-decoration: none; font-weight: 500;">${escapeHtml(house.name)}</a> – MWK ${house.price.toLocaleString()} (${escapeHtml(house.location)})
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
    typingDiv.innerHTML = `<div style="display: inline-block; background: var(--card-bg, white); padding: 8px 12px; border-radius: 18px; font-size: 0.8rem;">🤖 typing...</div>`;
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
      addMessage("Sorry, I'm having trouble connecting. Please try again later.");
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