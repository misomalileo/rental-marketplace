// ======================================
// AI KHOMO LATHU – Professional Concierge
// ======================================
(function() {
  // Widget HTML with suggested questions
  const widgetHtml = `
    <div id="chatbot-widget" style="position: fixed; bottom: 24px; right: 24px; z-index: 9999; font-family: 'Inter', sans-serif;">
      <div id="chatbot-toggle" style="width: 56px; height: 56px; background: linear-gradient(135deg, #2563eb, #0ea5e9); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.15); transition: all 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1);">
        <i class="fas fa-comment-dots" style="color: white; font-size: 24px;"></i>
      </div>
      <div id="chatbot-panel" style="display: none; position: absolute; bottom: 80px; right: 0; width: 380px; height: 520px; background: var(--card-bg, white); border-radius: 28px; box-shadow: 0 20px 35px -8px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--input-border, #e2e8f0); backdrop-filter: blur(0px);">
        <div style="background: linear-gradient(135deg, #1e293b, #0f172a); color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="background: rgba(255,255,255,0.15); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
              <i class="fas fa-robot" style="font-size: 18px;"></i>
            </div>
            <div>
              <span style="font-weight: 700; font-size: 0.95rem;">KHOMO LATHU AI</span>
              <span style="font-size: 0.65rem; opacity: 0.8; display: block;">Your property assistant</span>
            </div>
          </div>
          <span id="chatbot-close" style="cursor: pointer; font-size: 24px; opacity: 0.8; transition: opacity 0.2s;">&times;</span>
        </div>
        <div id="chatbot-messages" style="flex: 1; overflow-y: auto; padding: 16px; background: var(--input-bg, #f8fafc); font-size: 0.85rem; display: flex; flex-direction: column; gap: 12px;">
          <div style="text-align: left;">
            <div style="display: inline-block; background: var(--card-bg, white); padding: 12px 16px; border-radius: 20px; border-bottom-left-radius: 4px; max-width: 85%; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <i class="fas fa-sparkles" style="color: #f59e0b; margin-right: 6px;"></i> 
              Hello! I'm your AI assistant. I can help you find properties, explain how to list, or answer any questions.
            </div>
          </div>
          <div style="text-align: left;">
            <div style="display: inline-block; background: var(--card-bg, white); padding: 12px 16px; border-radius: 20px; border-bottom-left-radius: 4px; max-width: 85%;">
              <i class="fas fa-lightbulb" style="color: #10b981; margin-right: 6px;"></i>
              Try asking me:<br>
              • "Show me rooms under 150k"<br>
              • "Hostels near Lilongwe"<br>
              • "How do I list a property?"<br>
              • "Furnished apartments with parking"
            </div>
          </div>
        </div>
        <div style="padding: 12px 16px; border-top: 1px solid var(--input-border, #e2e8f0); background: var(--card-bg, white);">
          <div style="display: flex; gap: 8px;">
            <input type="text" id="chatbot-input" placeholder="Ask me anything..." style="flex: 1; padding: 10px 16px; border: 1px solid var(--input-border, #cbd5e1); border-radius: 40px; background: var(--input-bg, white); color: var(--text-color, #1e293b); outline: none; font-size: 0.85rem; transition: border 0.2s;">
            <button id="chatbot-send" style="background: #2563eb; color: white; border: none; border-radius: 40px; padding: 0 20px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 6px; transition: background 0.2s;">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
          <div id="suggested-questions" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;">
            <button class="suggested-q" data-q="rooms under 150k" style="background: #f1f5f9; border: none; border-radius: 30px; padding: 4px 12px; font-size: 0.7rem; cursor: pointer; color: #1e293b;">🏠 Rooms under 150k</button>
            <button class="suggested-q" data-q="hostels in Blantyre" style="background: #f1f5f9; border: none; border-radius: 30px; padding: 4px 12px; font-size: 0.7rem; cursor: pointer;">🏨 Hostels in Blantyre</button>
            <button class="suggested-q" data-q="furnished apartments with parking" style="background: #f1f5f9; border: none; border-radius: 30px; padding: 4px 12px; font-size: 0.7rem; cursor: pointer;">🛋️ Furnished apartments</button>
            <button class="suggested-q" data-q="how to become a landlord" style="background: #f1f5f9; border: none; border-radius: 30px; padding: 4px 12px; font-size: 0.7rem; cursor: pointer;">👑 Become a landlord</button>
          </div>
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
    msgDiv.style.marginBottom = '0';
    msgDiv.style.display = 'flex';
    msgDiv.style.justifyContent = isUser ? 'flex-end' : 'flex-start';
    const content = isHtml ? text : escapeHtml(text);
    msgDiv.innerHTML = `<div style="max-width: 85%; background: ${isUser ? '#2563eb' : 'var(--card-bg, white)'}; color: ${isUser ? 'white' : 'var(--text-color, #1e293b)'}; padding: 10px 14px; border-radius: 20px; ${isUser ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'} font-size: 0.85rem; word-wrap: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">${content}</div>`;
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

  function getPropertyIcon(type) {
    const icons = {
      'House': '<i class="fas fa-home"></i>',
      'Hostel': '<i class="fas fa-hotel"></i>',
      'Apartment': '<i class="fas fa-building"></i>',
      'Room': '<i class="fas fa-bed"></i>',
      'Office': '<i class="fas fa-briefcase"></i>'
    };
    return icons[type] || '<i class="fas fa-home"></i>';
  }

  function formatSearchResults(houses) {
    if (!houses || houses.length === 0) {
      return '<i class="fas fa-frown" style="color:#f59e0b;"></i> Sorry, no properties found. Try different words.';
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
    let html = `<div style="font-size: 0.8rem;"><strong><i class="fas fa-search"></i> ${houses.length} ${typeLabel} found:</strong><ul style="margin: 8px 0 0 20px; padding-left: 0;">`;
    houses.forEach(house => {
      const iconHtml = getPropertyIcon(house.type);
      const linkUrl = `/?house=${house.id}`;
      html += `<li style="margin-bottom: 8px; line-height: 1.3;">
        ${iconHtml} <a href="${linkUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 500;">${escapeHtml(house.name)}</a> – MWK ${house.price.toLocaleString()} (${escapeHtml(house.location)})
      </li>`;
    });
    html += '</ul></div>';
    return html;
  }

  async function sendMessage(messageText = null) {
    const message = messageText || input.value.trim();
    if (!message || isLoading) return;
    addMessage(message, true);
    if (!messageText) input.value = '';
    isLoading = true;

    // Typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.style.display = 'flex';
    typingDiv.style.justifyContent = 'flex-start';
    typingDiv.innerHTML = `<div style="background: var(--card-bg, white); padding: 10px 14px; border-radius: 20px; border-bottom-left-radius: 4px; font-size: 0.75rem;"><i class="fas fa-spinner fa-pulse"></i> Thinking...</div>`;
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
        let text = data.text;
        // Replace emojis with icons
        text = text.replace(/🤖/g, '<i class="fas fa-robot"></i>');
        text = text.replace(/✅/g, '<i class="fas fa-check-circle" style="color:#10b981;"></i>');
        text = text.replace(/❌/g, '<i class="fas fa-times-circle" style="color:#ef4444;"></i>');
        text = text.replace(/📢/g, '<i class="fas fa-bullhorn"></i>');
        text = text.replace(/💡/g, '<i class="fas fa-lightbulb"></i>');
        text = text.replace(/⭐/g, '<i class="fas fa-star" style="color:#fbbf24;"></i>');
        addMessage(text, false, true);
      }
    } catch (err) {
      typingDiv.remove();
      addMessage('<i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i> Sorry, I\'m having trouble connecting. Try again later.', false, true);
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
  sendBtn.addEventListener('click', () => sendMessage());
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  // Suggested questions
  document.querySelectorAll('.suggested-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-q');
      if (q) sendMessage(q);
    });
  });
})();