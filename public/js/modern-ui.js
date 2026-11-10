/* =====================================================================
   KHOMO LATHU – MODERN UI helper
   Replaces emojis/unicode symbols with coloured Font Awesome icons,
   everywhere (static HTML + anything your scripts add later).
   ===================================================================== */
(function () {
  'use strict';

  var MAP = {
    '🔥': ['fas fa-fire', '#ff5a1f'],
    '🚀': ['fas fa-rocket', '#ff5a1f'],
    '💰': ['fas fa-coins', '#16a34a'],
    '✅': ['fas fa-check-circle', '#00a699'],
    '✔': ['fas fa-check', '#00a699'],
    '✓': ['fas fa-check', '#00a699'],
    '✨': ['fas fa-wand-magic-sparkles', '#a855f7'],
    '📍': ['fas fa-location-dot', '#ff385c'],
    '🤖': ['fas fa-robot', '#8b5cf6'],
    '⚠️': ['fas fa-triangle-exclamation', '#ff9f1c'],
    '⚠': ['fas fa-triangle-exclamation', '#ff9f1c'],
    '📊': ['fas fa-chart-column', '#3b82f6'],
    '⭐': ['fas fa-star', '#ffb400'],
    '💡': ['fas fa-lightbulb', '#f59e0b'],
    '🚫': ['fas fa-ban', '#e5383b'],
    '❌': ['fas fa-circle-xmark', '#e5383b'],
    '🗑': ['fas fa-trash-can', '#e5383b'],
    '★': ['fas fa-star ml-star', '#ffb400'],
    '☆': ['far fa-star ml-star empty', '#d4d4d8'],
    '▼': ['fas fa-chevron-down', 'currentColor']
  };

  var KEYS = Object.keys(MAP).sort(function (a, b) { return b.length - a.length; });
  var RE = new RegExp('(' + KEYS.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')\\uFE0F?', 'g');

  function iconFor(ch) {
    var d = MAP[ch] || MAP[ch.replace(/\uFE0F/g, '')];
    if (!d) return null;
    var i = document.createElement('i');
    i.className = d[0] + ' ml-ico';
    if (d[1] !== 'currentColor') i.style.color = d[1];
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function convertText(node) {
    var text = node.nodeValue;
    if (!text || !RE.test(text)) { RE.lastIndex = 0; return; }
    RE.lastIndex = 0;
    var frag = document.createDocumentFragment(), last = 0, m;
    while ((m = RE.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var ic = iconFor(m[1]);
      frag.appendChild(ic || document.createTextNode(m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, TITLE: 1, CODE: 1, PRE: 1 };

  function walk(root) {
    if (!root || root.nodeType === 8) return;
    if (root.nodeType === 3) { if (root.parentNode && !SKIP[root.parentNode.nodeName]) convertText(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.parentNode || SKIP[n.parentNode.nodeName]) return NodeFilter.FILTER_REJECT;
        return /[🔥🚀💰✅✔✓✨📍🤖⚠📊⭐💡🚫❌🗑★☆▼]/u.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(convertText);
  }

  var busy = false;
  function start() {
    walk(document.body);
    new MutationObserver(function (muts) {
      if (busy) return;
      busy = true;
      muts.forEach(function (m) {
        m.addedNodes.forEach(walk);
        if (m.type === 'characterData') walk(m.target);
      });
      busy = false;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  /* Scroll-reveal for cards added dynamically */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.style.opacity = 1; io.unobserve(e.target); } });
    }, { threshold: .08 });
    window.addEventListener('load', function () {
      document.querySelectorAll('.stat-card, .chart-card, .table-card, .card').forEach(function (el) {
        el.style.opacity = 0; el.style.transition = 'opacity .7s ease'; io.observe(el);
      });
    });
  }
})();
