/* ═══════════════════════════════════════════════════════════════════
   Foundry IQ — HR Agent · Client Application
   ═══════════════════════════════════════════════════════════════════ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── DOM refs ──────────────────────────────────────────────────────
const chatMessages = $('#chatMessages');
const chatForm     = $('#chatForm');
const chatInput    = $('#chatInput');
const btnSend      = $('#btnSend');
const btnClear     = $('#btnClear');
const btnMenu      = $('#btnMenu');
const sidebar      = $('#sidebar');
const welcomeHero  = $('#welcomeHero');
const statusDot    = $('#statusDot');
const statusText   = $('#statusText');
const agentSelector = $('#agentSelector');

// ── State ─────────────────────────────────────────────────────────
let conversationHistory = [];   // kept client-side (stateless API)
let isProcessing = false;

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  wireEvents();
  autoGrow(chatInput);
});

// ── Health check ──────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();
    if (data.configured) {
      statusDot.className  = 'status-dot online';
      statusText.textContent = 'Connected';
    } else {
      statusDot.className  = 'status-dot offline';
      statusText.textContent = 'Not configured';
    }
  } catch {
    statusDot.className  = 'status-dot offline';
    statusText.textContent = 'Offline';
  }
}

// ── Events ────────────────────────────────────────────────────────
function wireEvents() {
  chatForm.addEventListener('submit', handleSubmit);

  agentSelector.addEventListener('change', () => {
    // When the agent is changed, clear the current conversation
    clearChat();
    // Update the title to match the selected agent
    const selectedText = agentSelector.options[agentSelector.selectedIndex].text;
    $('.header-title h2').textContent = selectedText;

    // Update the input placeholder
    if (agentSelector.value === 'ITSupport-Agent') {
      chatInput.placeholder = 'Ask the IT Support Agent a question…';
    } else if (agentSelector.value === 'Insight-Agent') {
      chatInput.placeholder = 'Ask the Insight Agent a question…';
    } else if (agentSelector.value === 'HR-Agent') {
      chatInput.placeholder = 'Ask the HR Agent a question…';
    } else {
      chatInput.placeholder = 'Ask the Orchestrator a question…';
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  btnClear.addEventListener('click', clearChat);
  btnMenu.addEventListener('click', () => sidebar.classList.toggle('open'));

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== btnMenu) {
      sidebar.classList.remove('open');
    }
  });

  // Quick prompts
  $$('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.prompt;
      autoGrow(chatInput);
      chatInput.focus();
      sidebar.classList.remove('open');
    });
  });
}

// ── Send message ──────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || isProcessing) return;

  // Hide welcome
  if (welcomeHero) welcomeHero.remove();

  // Add user message
  appendMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  chatInput.value = '';
  autoGrow(chatInput);
  setProcessing(true);
  showTyping();
  scrollToBottom();

  const agentId = agentSelector ? agentSelector.value : 'HR-Agent';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory, agentId })
    });

    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      appendMessage('agent', data.error || 'Something went wrong.', [], true);
    } else {
      let msg = data.message || 'No response from agent.';
      if (data.resolvedAgentId) {
        if (agentId === 'Orchestrator-Agent' && data.resolvedAgentId !== 'Orchestrator-Agent') {
          msg = `**[Auto-Routed to: ${data.resolvedAgentId}]**\n\n` + msg;
        } else {
          msg = `**[Answered by: ${data.resolvedAgentId}]**\n\n` + msg;
        }
      }
      const citations = data.citations || [];
      conversationHistory.push({ role: 'assistant', content: msg });
      appendMessage('agent', msg, citations);
    }
  } catch (err) {
    hideTyping();
    appendMessage('agent', `Network error: ${err.message}`, [], true);
  } finally {
    setProcessing(false);
    scrollToBottom();
  }
}

// ── Render message ────────────────────────────────────────────────
function appendMessage(role, text, citations = [], isError = false) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}${isError ? ' msg-error' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? 'U' : 'AI';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const content = document.createElement('div');
  content.className = 'msg-content';
  content.innerHTML = renderMarkdown(text);

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  body.appendChild(content);

  // Citations
  if (citations.length > 0) {
    const citWrap = document.createElement('div');
    citWrap.className = 'msg-citations';
    citations.forEach((c, i) => {
      const tag = document.createElement('span');
      tag.className = 'citation-tag';
      tag.textContent = c.title || c.url || `Source ${i + 1}`;
      tag.title = c.url || '';
      citWrap.appendChild(tag);
    });
    body.appendChild(citWrap);
  }

  body.appendChild(time);
  wrapper.appendChild(avatar);
  wrapper.appendChild(body);
  chatMessages.appendChild(wrapper);
  scrollToBottom();
}

// ── Typing indicator ──────────────────────────────────────────────
function showTyping() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.id = 'typingIndicator';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.style.background = 'linear-gradient(135deg,#8b5cf6,#c084fc)';
  avatar.style.color = '#fff';
  avatar.textContent = 'AI';

  const dots = document.createElement('div');
  dots.className = 'typing-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';

  el.appendChild(avatar);
  el.appendChild(dots);
  chatMessages.appendChild(el);
  scrollToBottom();
}

function hideTyping() {
  const el = $('#typingIndicator');
  if (el) el.remove();
}

// ── Helpers ───────────────────────────────────────────────────────
function setProcessing(flag) {
  isProcessing = flag;
  btnSend.disabled = flag;
}

function clearChat() {
  conversationHistory = [];
  chatMessages.innerHTML = '';

  // Dynamic welcome based on selected agent
  let assistantName = 'HR Assistant';
  let assistantDesc = 'company HR policies, leave rules, health plans, onboarding, and more';
  
  if (agentSelector && agentSelector.value === 'ITSupport-Agent') {
    assistantName = 'IT Support Agent';
    assistantDesc = 'IT issues, software requests, hardware troubleshooting, and network access';
  } else if (agentSelector && agentSelector.value === 'Insight-Agent') {
    assistantName = 'Insight Agent';
    assistantDesc = 'data analytics, company insights, reports, and performance metrics';
  } else if (agentSelector && agentSelector.value === 'HR-Agent') {
    assistantName = 'HR Assistant';
    assistantDesc = 'company HR policies, leave rules, health plans, onboarding, and more';
  } else {
    assistantName = 'AI Orchestrator';
    assistantDesc = 'all your IT, Data Insights, and HR needs. I will route your question to the right expert automatically';
  }

  // Recreate welcome
  const hero = document.createElement('div');
  hero.className = 'welcome-hero';
  hero.id = 'welcomeHero';
  hero.innerHTML = `
    <div class="welcome-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#grad)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#818cf8"/><stop offset="100%" style="stop-color:#c084fc"/></linearGradient></defs>
        <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    </div>
    <h2 class="welcome-title">Hello! I'm your ${assistantName}</h2>
    <p class="welcome-desc">I can answer questions about ${assistantDesc} — powered by <strong>Microsoft Foundry IQ</strong>.</p>
    <p class="welcome-hint">Type your question below to get started.</p>
  `;
  chatMessages.appendChild(hero);
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  el.addEventListener('input', () => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  });
}

// ── Simple markdown renderer ──────────────────────────────────────
function renderMarkdown(text) {
  let html = escapeHtml(text);
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Line breaks → paragraphs
  html = html.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  // Simple list detection
  html = html.replace(/<p>([-•]\s.*?(?:<br>[-•]\s.*?)*)<\/p>/g, (match, list) => {
    const items = list.split('<br>').map(i => `<li>${i.replace(/^[-•]\s*/, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  return html;
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return str.replace(/[&<>"]/g, c => map[c]);
}
