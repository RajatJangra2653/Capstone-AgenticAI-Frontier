import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Persistent Ticket Storage (JSON file) ──────────────────────────────
import { readFileSync, writeFileSync, existsSync } from 'fs';

const TICKETS_FILE = join(__dirname, 'tickets.json');

function loadTickets() {
  if (existsSync(TICKETS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(TICKETS_FILE, 'utf-8'));
      return { tickets: data.tickets || [], nextId: data.nextId || 1000 };
    } catch { /* corrupt file, start fresh */ }
  }
  return { tickets: [], nextId: 1000 };
}

function saveTickets() {
  writeFileSync(TICKETS_FILE, JSON.stringify({ tickets, nextId: nextTicketId }, null, 2));
}

const ticketData = loadTickets();
let tickets = ticketData.tickets;
let nextTicketId = ticketData.nextId;
console.log(`✓ Loaded ${tickets.length} existing ticket(s) from storage`);

// ── Configuration ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const FOUNDRY_ENDPOINT = process.env.FOUNDRY_ENDPOINT ? process.env.FOUNDRY_ENDPOINT.replace(/\/$/, '') : undefined;
const PROJECT_NAME     = process.env.PROJECT_NAME;        // e.g. my-project

// ── Azure credential (service-principal or DefaultAzureCredential) ─────
let credential;
if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
  credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );
  console.log('✓ Using ClientSecretCredential (service principal)');
} else {
  credential = new DefaultAzureCredential();
  console.log('✓ Using DefaultAzureCredential (az login / managed identity)');
}

// ── Helper: get bearer token ───────────────────────────────────────────
async function getBearerToken() {
  const tokenResponse = await credential.getToken('https://ai.azure.com/.default');
  return tokenResponse.token;
}

// ── POST /api/chat ─────────────────────────────────────────────────────
// Proxies the user's conversation to the Foundry Responses API.
// The client sends the full message history (since the API is stateless).
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, agentId } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    if (!FOUNDRY_ENDPOINT || !PROJECT_NAME) {
      return res.status(500).json({
        error: 'Server misconfigured — FOUNDRY_ENDPOINT and PROJECT_NAME must be set in .env'
      });
    }

    // Determine target agent based on agentId from frontend
    let targetAppName;
    let targetModel;
    let resolvedAgentId = agentId;

    // Local intent routing fallback if Orchestrator is selected
    if (agentId === 'Orchestrator-Agent') {
      const latestMessage = messages[messages.length - 1]?.text?.toLowerCase() || 
                            messages[messages.length - 1]?.content?.toLowerCase() || '';
      
      if (latestMessage.match(/\b(leave|holiday|salary|onboarding|health|insurance|parental|sick|policy|flexible|work|remote|hours|benefits|pay)\b/)) {
        resolvedAgentId = 'HR-Agent';
      } else if (latestMessage.match(/\b(password|laptop|vpn|network|software|hardware|login|access|wifi|computer|monitor|mouse|keyboard|printer|email)\b/)) {
        resolvedAgentId = 'ITSupport-Agent';
      } else if (latestMessage.match(/\b(compliance|audit|security|gdpr|regulation|legal|risk|privacy|governance)\b/)) {
        resolvedAgentId = 'Compliance-Agent';
      }
    }

    switch (resolvedAgentId) {
      case 'ITSupport-Agent':
        targetAppName = process.env.AGENT_APP_IT || 'ITSupport-Agent';
        targetModel = process.env.AGENT_MODEL_IT || 'gpt-4.1';
        break;
      case 'Compliance-Agent':
        targetAppName = process.env.AGENT_APP_COMPLIANCE || 'Compliance-Agent';
        targetModel = process.env.AGENT_MODEL_COMPLIANCE || 'gpt-4.1';
        break;
      case 'HR-Agent':
        targetAppName = process.env.AGENT_APP_HR || 'HR-Agent';
        targetModel = process.env.AGENT_MODEL_HR || 'gpt-4.1';
        break;
      case 'Orchestrator-Agent':
      default:
        targetAppName = process.env.AGENT_APP_ORCHESTRATOR || 'Orchestrator-Agent';
        targetModel = process.env.AGENT_MODEL_ORCHESTRATOR || 'gpt-4.1';
        break;
    }

    const token = await getBearerToken();

    // Foundry Responses API (OpenAI-compatible)
    const url = `${FOUNDRY_ENDPOINT}/api/projects/${PROJECT_NAME}/applications/${targetAppName}/protocols/openai/responses?api-version=2025-11-15-preview`;

    const body = {
      input: messages,
      model: targetModel
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Foundry API error ${response.status}:`, errorText);
      return res.status(response.status).json({
        error: `Foundry API returned ${response.status}`,
        detail: errorText
      });
    }

    const data = await response.json();

    // Extract the assistant message from the Responses API output
    let assistantMessage = '';
    let citations = [];

    if (data.output) {
      for (const item of data.output) {
        if (item.type === 'message' && item.role === 'assistant') {
          for (const content of item.content || []) {
            if (content.type === 'output_text') {
              assistantMessage += content.text;
              // Collect annotations / citations
              if (content.annotations) {
                citations.push(...content.annotations);
              }
            }
          }
        }
      }
    }

    // Fallback: some responses use a simpler structure
    if (!assistantMessage && data.choices) {
      assistantMessage = data.choices[0]?.message?.content || '';
    }

    return res.json({
      message: assistantMessage || 'No response from agent.',
      citations,
      raw: data,
      resolvedAgentId
    });
  } catch (err) {
    console.error('Chat proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── IT Support Ticket API ──────────────────────────────────────────────

// Create a new ticket
app.post('/api/tickets', (req, res) => {
  const { title, description, user, priority, category } = req.body;
  
  if (!title || !description || !user || !priority) {
    return res.status(400).json({ error: 'title, description, user, and priority are required' });
  }

  const newTicket = {
    id: `IT-${nextTicketId++}`,
    title,
    description,
    user,
    priority: priority || 'Medium',
    category: category || 'General',
    status: 'Open',
    createdAt: new Date().toISOString()
  };

  tickets.push(newTicket);
  saveTickets();
  console.log(`🎫 Ticket created: ${newTicket.id} — "${newTicket.title}" [${newTicket.priority}]`);
  return res.status(201).json(newTicket);
});

// Get all tickets
app.get('/api/tickets', (req, res) => {
  return res.json(tickets);
});

// Get ticket status by ID
app.get('/api/tickets/:id', (req, res) => {
  const ticketId = req.params.id;
  const ticket = tickets.find(t => t.id === ticketId);
  
  if (!ticket) {
    return res.status(404).json({ error: `Ticket ${ticketId} not found` });
  }
  
  return res.json(ticket);
});

// ── Health check ───────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    configured: !!(FOUNDRY_ENDPOINT && PROJECT_NAME),
    endpoint: FOUNDRY_ENDPOINT ? `${FOUNDRY_ENDPOINT} (connected)` : 'not set'
  });
});

// ── SPA fallback ───────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Foundry IQ Agent App running at  http://localhost:${PORT}`);
  console.log(`   Foundry endpoint:  ${FOUNDRY_ENDPOINT || '⚠  NOT SET'}`);
  console.log(`   Project:           ${PROJECT_NAME || '⚠  NOT SET'}`);
  console.log(`   Orchestrator App:  ${process.env.AGENT_APP_ORCHESTRATOR || '⚠  NOT SET'}`);
  console.log(`   HR Agent App:      ${process.env.AGENT_APP_HR || '⚠  NOT SET'}`);
  console.log(`   IT Agent App:      ${process.env.AGENT_APP_IT || '⚠  NOT SET'}`);
  console.log(`   Compliance Agent App: ${process.env.AGENT_APP_COMPLIANCE || '⚠  NOT SET'}\n`);
});
