// ======================================
// AI KHOMO LATHU – Intelligent Concierge (Masterpiece Edition)
// ======================================
(function() {
  // Widget HTML (modern, glass-morphism, suggested questions)
  const widgetHtml = `
    <div id="chatbot-widget" style="position: fixed; bottom: 24px; right: 24px; z-index: 9999; font-family: 'Inter', sans-serif;">
      <div id="chatbot-toggle" style="width: 60px; height: 60px; background: linear-gradient(135deg, #8B5CF6, #EC4899); border-radius: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 8px 20px rgba(139,92,246,0.4); transition: all 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1);">
        <i class="fas fa-robot" style="color: white; font-size: 28px;"></i>
      </div>
      <div id="chatbot-panel" style="display: none; position: absolute; bottom: 80px; right: 0; width: 380px; height: 560px; background: rgba(255,255,255,0.98); backdrop-filter: blur(10px); border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);">
        <div style="background: linear-gradient(135deg, #8B5CF6, #EC4899); color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 8px;"><i class="fas fa-brain"></i> Khomo Lathu AI</span>
          <span id="chatbot-close" style="cursor: pointer; font-size: 24px; line-height: 1;">&times;</span>
        </div>
        <div id="chatbot-messages" style="flex: 1; overflow-y: auto; padding: 16px; background: #f9fafb; font-size: 0.85rem; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; gap: 10px; align-items: flex-start;">
            <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #8B5CF6, #EC4899); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i class="fas fa-robot" style="color: white; font-size: 14px;"></i>
            </div>
            <div style="background: white; padding: 12px 16px; border-radius: 20px; border-top-left-radius: 4px; max-width: 85%; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <i class="fas fa-sparkles" style="color: #8B5CF6; margin-right: 6px;"></i> Hello! I'm Khomo Lathu AI. Ask me about properties, listings, or how to use the platform.
            </div>
          </div>
          <div id="suggested-questions" style="margin-top: 8px;">
            <div style="font-size: 0.7rem; color: #64748b; margin-bottom: 8px;"><i class="fas fa-lightbulb"></i> Try asking:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <button class="suggested-q" data-q="Show me all houses">🏠 All houses</button>
              <button class="suggested-q" data-q="Show me all rooms">🛏️ All rooms</button>
              <button class="suggested-q" data-q="Hostels in Lilongwe">🏨 Hostels in Lilongwe</button>
              <button class="suggested-q" data-q="Apartments with parking">🚗 Apartments with parking</button>
              <button class="suggested-q" data-q="How do I list a property?">📋 How to list?</button>
              <button class="suggested-q" data-q="Become a premium landlord">⭐ Premium landlord</button>
            </div>
          </div>
        </div>
        <div style="padding: 12px 16px; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; background: white;">
          <input type="text" id="chatbot-input" placeholder="Type your question..." style="flex: 1; padding: 10px 16px; border: 1px solid #cbd5e1; border-radius: 40px; background: white; color: #1e293b; outline: none; font-size: 0.85rem;">
          <button id="chatbot-send" style="background: linear-gradient(135deg, #8B5CF6, #EC4899); color: white; border: none; border-radius: 40px; padding: 8px 20px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
            <i class="fas fa-paper-plane"></i> Send
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
  const suggestedContainer = document.getElementById('suggested-questions');

  let isLoading = false;

  function addMessage(text, isUser = false, isHtml = false) {
    const msgDiv = document.createElement('div');
    msgDiv.style.display = 'flex';
    msgDiv.style.gap = '10px';
    msgDiv.style.alignItems = 'flex-start';
    msgDiv.style.marginBottom = '12px';
    if (isUser) {
      msgDiv.style.flexDirection = 'row-reverse';
      msgDiv.innerHTML = `
        <div style="width: 32px; height: 32px; background: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i class="fas fa-user" style="color: white; font-size: 14px;"></i>
        </div>
        <div style="background: #2563eb; color: white; padding: 10px 14px; border-radius: 20px; border-top-right-radius: 4px; max-width: 85%; font-size: 0.85rem; word-wrap: break-word;">${isHtml ? text : escapeHtml(text)}</div>
      `;
    } else {
      msgDiv.innerHTML = `
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #8B5CF6, #EC4899); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i class="fas fa-robot" style="color: white; font-size: 14px;"></i>
        </div>
        <div style="background: white; padding: 10px 14px; border-radius: 20px; border-top-left-radius: 4px; max-width: 85%; font-size: 0.85rem; word-wrap: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">${isHtml ? text : escapeHtml(text)}</div>
      `;
    }
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function formatSearchResults(houses, queryType = 'properties') {
    if (!houses || houses.length === 0) {
      return `<div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-frown" style="color: #f59e0b;"></i> No ${queryType} found. Try different words.</div>`;
    }
    let typeLabel = queryType;
    if (houses.length > 0) {
      const firstType = houses[0].type;
      if (houses.every(h => h.type === firstType)) {
        if (firstType === 'House') typeLabel = 'houses';
        else if (firstType === 'Hostel') typeLabel = 'hostels';
        else if (firstType === 'Apartment') typeLabel = 'apartments';
        else if (firstType === 'Room') typeLabel = 'rooms';
        else if (firstType === 'Office') typeLabel = 'offices';
        else typeLabel = 'properties';
      }
    }
    let html = `<div><strong><i class="fas fa-search"></i> Found ${houses.length} ${typeLabel}:</strong><ul style="margin: 8px 0 0 20px; padding-left: 0;">`;
    houses.forEach(house => {
      const iconMap = {
        'House': '🏠', 'Hostel': '🏨', 'Apartment': '🏢', 'Room': '🛏️', 'Office': '💼'
      };
      const icon = iconMap[house.type] || '🏠';
      const linkUrl = `/?house=${house.id}`;
      html += `<li style="margin-bottom: 8px; line-height: 1.3;">
        ${icon} <a href="${linkUrl}" target="_blank" style="color: #8B5CF6; text-decoration: none; font-weight: 500;">${escapeHtml(house.name)}</a> – MWK ${house.price.toLocaleString()} (${escapeHtml(house.location)})
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

    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.style.display = 'flex';
    typingDiv.style.gap = '10px';
    typingDiv.style.alignItems = 'flex-start';
    typingDiv.style.marginBottom = '12px';
    typingDiv.innerHTML = `
      <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #8B5CF6, #EC4899); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <i class="fas fa-robot" style="color: white; font-size: 14px;"></i>
      </div>
      <div style="background: white; padding: 10px 14px; border-radius: 20px; border-top-left-radius: 4px;">
        <i class="fas fa-spinner fa-pulse"></i> Thinking...
      </div>
    `;
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
        const formatted = formatSearchResults(data.houses, data.queryType || 'properties');
        addMessage(formatted, false, true);
      } else {
        let text = data.text;
        // Enhance with icons
        text = text.replace(/houses/gi, '<i class="fas fa-home"></i> houses');
        text = text.replace(/rooms/gi, '<i class="fas fa-bed"></i> rooms');
        text = text.replace(/hostels/gi, '<i class="fas fa-hotel"></i> hostels');
        text = text.replace(/apartments/gi, '<i class="fas fa-building"></i> apartments');
        text = text.replace(/offices/gi, '<i class="fas fa-briefcase"></i> offices');
        text = text.replace(/landlord/gi, '<i class="fas fa-user-tie"></i> landlord');
        text = text.replace(/tenant/gi, '<i class="fas fa-user"></i> tenant');
        text = text.replace(/premium/gi, '<i class="fas fa-crown"></i> premium');
        addMessage(text, false, true);
      }
    } catch (err) {
      typingDiv.remove();
      addMessage('<i class="fas fa-exclamation-triangle"></i> Sorry, I\'m having trouble connecting. Try again later.', false, true);
    } finally {
      isLoading = false;
    }
  }

  // Event listeners
  toggleBtn.addEventListener('click', () => {
    const isVisible = panel.style.display === 'flex';
    panel.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible && messagesDiv.querySelectorAll('.message').length === 0) {
      // Auto-focus input
      setTimeout(() => input.focus(), 300);
    }
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