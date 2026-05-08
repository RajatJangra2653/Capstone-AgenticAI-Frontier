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
  if (agentSelector) {
    agentSelector.dispatchEvent(new Event('change'));
  }
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
    clearChat();
    const selectedText = agentSelector.options[agentSelector.selectedIndex].text;
    $('.header-title h2').textContent = selectedText;

    if (agentSelector.value === 'ITSupport-Agent') {
      chatInput.placeholder = 'Ask the IT Support Agent a question…';
    } else if (agentSelector.value === 'Compliance-Agent') {
      chatInput.placeholder = 'Ask the Compliance Agent a question…';
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

  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== btnMenu) {
      sidebar.classList.remove('open');
    }
  });

  $$('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.prompt;
      autoGrow(chatInput);
      chatInput.focus();
      sidebar.classList.remove('open');
    });
  });
}

// ── Ticket Creation Intent Detection ──────────────────────────────
function isTicketCreationIntent(text) {
  return /\b(create|raise|open|log|submit|file|new)\b.*\b(ticket|issue|request|incident)\b/i.test(text) ||
         /\b(ticket|issue|request|incident)\b.*\b(create|raise|open|log|submit|file|new)\b/i.test(text);
}

// ── Ticket Tracking Intent Detection ──────────────────────────────
function getTicketTrackingId(text) {
  const match = text.match(/\b(IT-\d+)\b/i);
  if (match && /\b(track|status|check|find|lookup|look up|fetch|get|show|where)\b/i.test(text)) {
    return match[1].toUpperCase();
  }
  return null;
}

// ── Fetch and Display Ticket ──────────────────────────────────────
async function trackTicket(ticketId) {
  showTyping();
  try {
    const res = await fetch(`/api/tickets/${ticketId}`);
    hideTyping();

    if (!res.ok) {
      appendMessage('agent', `**[Answered by: ITSupport-Agent]**\n\n❌ Ticket **${ticketId}** was not found. Please check the ID and try again.`);
      return;
    }

    const ticket = await res.json();
    const wrapper = document.createElement('div');
    wrapper.className = 'message agent';

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.style.background = 'linear-gradient(135deg,#8b5cf6,#c084fc)';
    avatar.style.color = '#fff';
    avatar.textContent = 'AI';

    const body = document.createElement('div');
    body.className = 'msg-body';

    const content = document.createElement('div');
    content.className = 'msg-content ticket-form-card';
    content.innerHTML = `
      <div class="ticket-form-header ticket-success">
        <span class="ticket-form-icon">📋</span>
        <strong>Ticket Details — ${ticket.id}</strong>
      </div>
      <div class="ticket-result">
        <div class="ticket-result-row">
          <span class="ticket-result-key">Ticket ID</span>
          <span class="ticket-result-val ticket-id-badge">${ticket.id}</span>
        </div>
        <div class="ticket-result-row">
          <span class="ticket-result-key">Title</span>
          <span class="ticket-result-val">${escapeHtml(ticket.title)}</span>
        </div>
        <div class="ticket-result-row">
          <span class="ticket-result-key">Raised By</span>
          <span class="ticket-result-val">${escapeHtml(ticket.user)}</span>
        </div>
        <div class="ticket-result-row">
          <span class="ticket-result-key">Category</span>
          <span class="ticket-result-val">${ticket.category}</span>
        </div>
        <div class="ticket-result-row">
          <span class="ticket-result-key">Priority</span>
          <span class="ticket-result-val ticket-priority-${ticket.priority.toLowerCase()}">${ticket.priority}</span>
        </div>
        <div class="ticket-result-row">
          <span class="ticket-result-key">Status</span>
          <span class="ticket-result-val ticket-status-open">${ticket.status}</span>
        </div>
        <div class="ticket-result-row">
          <span class="ticket-result-key">Created</span>
          <span class="ticket-result-val">${new Date(ticket.createdAt).toLocaleString()}</span>
        </div>
      </div>
      <p class="ticket-track-hint">${escapeHtml(ticket.description)}</p>
    `;

    body.appendChild(content);
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    chatMessages.appendChild(wrapper);
    scrollToBottom();

  } catch (err) {
    hideTyping();
    appendMessage('agent', `Network error while fetching ticket: ${err.message}`, [], true);
  }
}

// ── Show Ticket Form in Chat ──────────────────────────────────────
function showTicketForm() {
  const hero = $('#welcomeHero');
  if (hero) hero.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'message agent';
  wrapper.id = 'ticketFormWrapper';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.style.background = 'linear-gradient(135deg,#8b5cf6,#c084fc)';
  avatar.style.color = '#fff';
  avatar.textContent = 'AI';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const content = document.createElement('div');
  content.className = 'msg-content ticket-form-card';
  content.innerHTML = `
    <div class="ticket-form-header">
      <span class="ticket-form-icon">🎫</span>
      <strong>Create IT Support Ticket</strong>
    </div>
    <p class="ticket-form-desc">Please fill in the details below to create a support ticket.</p>
    <form id="ticketForm" class="ticket-form">
      <div class="ticket-field">
        <label for="ticketName">Your Name <span class="required">*</span></label>
        <input type="text" id="ticketName" placeholder="e.g. John Doe" required />
      </div>
      <div class="ticket-field">
        <label for="ticketTitle">Issue Title <span class="required">*</span></label>
        <input type="text" id="ticketTitle" placeholder="e.g. Laptop not booting" required />
      </div>
      <div class="ticket-field">
        <label for="ticketCategory">Category</label>
        <select id="ticketCategory">
          <option value="Hardware">🖥️ Hardware</option>
          <option value="Software">💿 Software</option>
          <option value="Network">🌐 Network / VPN</option>
          <option value="Access">🔑 Access / Permissions</option>
          <option value="Email">📧 Email</option>
          <option value="Other">📋 Other</option>
        </select>
      </div>
      <div class="ticket-field">
        <label for="ticketPriority">Priority <span class="required">*</span></label>
        <select id="ticketPriority" required>
          <option value="Low">🟢 Low</option>
          <option value="Medium" selected>🟡 Medium</option>
          <option value="High">🟠 High</option>
          <option value="Critical">🔴 Critical</option>
        </select>
      </div>
      <div class="ticket-field">
        <label for="ticketDescription">Description <span class="required">*</span></label>
        <textarea id="ticketDescription" rows="3" placeholder="Describe the issue in detail…" required></textarea>
      </div>
      <div class="ticket-form-actions">
        <button type="button" id="ticketCancel" class="ticket-btn ticket-btn-cancel">Cancel</button>
        <button type="submit" class="ticket-btn ticket-btn-submit">🎫 Create Ticket</button>
      </div>
    </form>
  `;

  body.appendChild(content);
  wrapper.appendChild(avatar);
  wrapper.appendChild(body);
  chatMessages.appendChild(wrapper);
  scrollToBottom();

  // Wire form events
  const form = $('#ticketForm');
  const cancelBtn = $('#ticketCancel');

  cancelBtn.addEventListener('click', () => {
    wrapper.remove();
    appendMessage('agent', 'Ticket creation cancelled. Let me know if you need anything else!');
    scrollToBottom();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#ticketName').value.trim();
    const title = $('#ticketTitle').value.trim();
    const category = $('#ticketCategory').value;
    const priority = $('#ticketPriority').value;
    const description = $('#ticketDescription').value.trim();

    if (!name || !title || !priority || !description) return;

    // Replace form with loading state
    content.innerHTML = `
      <div class="ticket-form-header">
        <span class="ticket-form-icon">⏳</span>
        <strong>Creating your ticket...</strong>
      </div>
    `;

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, user: name, priority, category })
      });

      const ticket = await res.json();

      if (!res.ok) {
        content.innerHTML = `
          <div class="ticket-form-header">
            <span class="ticket-form-icon">❌</span>
            <strong>Failed to create ticket</strong>
          </div>
          <p>${ticket.error || 'Something went wrong.'}</p>
        `;
        return;
      }

      // Show success card
      content.innerHTML = `
        <div class="ticket-form-header ticket-success">
          <span class="ticket-form-icon">✅</span>
          <strong>Ticket Created Successfully!</strong>
        </div>
        <div class="ticket-result">
          <div class="ticket-result-row">
            <span class="ticket-result-key">Ticket ID</span>
            <span class="ticket-result-val ticket-id-badge">${ticket.id}</span>
          </div>
          <div class="ticket-result-row">
            <span class="ticket-result-key">Title</span>
            <span class="ticket-result-val">${escapeHtml(ticket.title)}</span>
          </div>
          <div class="ticket-result-row">
            <span class="ticket-result-key">Raised By</span>
            <span class="ticket-result-val">${escapeHtml(ticket.user)}</span>
          </div>
          <div class="ticket-result-row">
            <span class="ticket-result-key">Category</span>
            <span class="ticket-result-val">${ticket.category}</span>
          </div>
          <div class="ticket-result-row">
            <span class="ticket-result-key">Priority</span>
            <span class="ticket-result-val ticket-priority-${ticket.priority.toLowerCase()}">${ticket.priority}</span>
          </div>
          <div class="ticket-result-row">
            <span class="ticket-result-key">Status</span>
            <span class="ticket-result-val ticket-status-open">${ticket.status}</span>
          </div>
        </div>
        <p class="ticket-track-hint">You can track this ticket using ID: <strong>${ticket.id}</strong></p>
      `;

      conversationHistory.push({
        role: 'assistant',
        content: `Ticket ${ticket.id} has been created successfully. Title: "${ticket.title}", Priority: ${ticket.priority}, Status: ${ticket.status}.`
      });

    } catch (err) {
      content.innerHTML = `
        <div class="ticket-form-header">
          <span class="ticket-form-icon">❌</span>
          <strong>Network error</strong>
        </div>
        <p>${err.message}</p>
      `;
    }

    scrollToBottom();
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

  const agentId = agentSelector ? agentSelector.value : 'HR-Agent';

  // Check if user wants to create a ticket (only for IT Support or Orchestrator)
  if (isTicketCreationIntent(text) && (agentId === 'ITSupport-Agent' || agentId === 'Orchestrator-Agent')) {
    appendMessage('agent', '**[Answered by: ITSupport-Agent]**\n\nSure! I can help you create a support ticket. Please fill out the form below with the required details.');
    showTicketForm();
    return;
  }

  // Check if user wants to track a ticket
  const trackId = getTicketTrackingId(text);
  if (trackId) {
    trackTicket(trackId);
    return;
  }

  setProcessing(true);
  showTyping();
  scrollToBottom();

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

  let assistantName = 'HR Assistant';
  let assistantDesc = 'company HR policies, leave rules, health plans, onboarding, and more';

  if (agentSelector && agentSelector.value === 'ITSupport-Agent') {
    assistantName = 'IT Support Agent';
    assistantDesc = 'IT issues, software requests, hardware troubleshooting, and ticket creation';
  } else if (agentSelector && agentSelector.value === 'Compliance-Agent') {
    assistantName = 'Compliance Agent';
    assistantDesc = 'company compliance, security audits, regulations, and risk management';
  } else if (agentSelector && agentSelector.value === 'HR-Agent') {
    assistantName = 'HR Assistant';
    assistantDesc = 'company HR policies, leave rules, health plans, onboarding, and more';
  } else {
    assistantName = 'AI Orchestrator';
    assistantDesc = 'all your IT, Data Insights, and HR needs. I will route your question to the right expert automatically';
  }

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
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
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
