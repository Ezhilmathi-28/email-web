# AI Mail — Autonomous AI-Powered Email Client

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20.x%20LTS-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.21.x-lightgrey.svg)](https://expressjs.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-2.5%20Flash-orange.svg)](https://ai.google.dev/)
[![Gmail API](https://img.shields.io/badge/Gmail%20API-v1-red.svg)](https://developers.google.com/gmail/api)

> **Final-Year CSE Capstone / Portfolio Project**  
> A full-stack, enterprise-grade email web application featuring an **Autonomous AI Copilot that programmatically controls the User Interface** — dynamically typing into compose forms, filtering mailboxes, navigating threads, performing real-time Server-Sent Events (SSE) synchronization, and drafting context-aware replies using Google Gemini.

---

## 📌 Executive Summary

Modern email workflows are burdened with repetitive manual tasks: sorting through threads, manually extracting action items, drafting repetitive replies, and navigating nested folders. Standard LLM-assisted email tools function merely as conversational chatbots disconnected from the underlying application state.

**AI Mail** re-architects the email experience by introducing an **AI Copilot that controls the UI programmatically**. Rather than simply returning text in a chat bubble, the assistant interprets natural language instructions, analyzes live application state, and dispatches executable UI command payloads. The user visibly watches the interface respond in real time—fields fill in with typing animations, filters adjust dynamically, and relevant email threads open automatically.

---

## 🚀 Key Features & Capabilities

### 1. The AI Controls the UI (Agentic UI Automation)
- **Live Visual Form Typing**:
  - *Example*: `"Send an email to john@example.com with subject 'Meeting Tomorrow' and body 'Let's meet at 3pm'"`
  - *Behavior*: Automatically launches the compose modal and **visibly types the recipient, subject, and body into the form fields**, giving real-time visual feedback of the AI's actions.
- **Human-in-the-Loop Send Confirmation**:
  - Emits an interactive confirmation card directly in the assistant panel with **"Send Now"** and **"Edit Draft"** options before triggering irreversible mail actions.
- **Natural Language Mailbox Filtering**:
  - *Examples*: `"Show me emails from the last 10 days"`, `"Show only unread emails from this week"`, `"Find the email from Sarah about the project update"`
  - *Behavior*: Parses temporal expressions, sender queries, and keywords, instantly updating the mailbox list and synchronizing filter controls.
- **Context-Aware Navigation & Thread Opening**:
  - *Example*: `"Open the latest email from David"`
  - *Behavior*: Scans active mail headers, resolves the target entity, and opens the detailed email reader view.
- **Context-Aware Smart Replies**:
  - *Example*: `"Reply to this"` (while viewing an email)
  - *Behavior*: Analyzes the active thread context, addresses the sender, sets `Re: [Subject]`, and drafts an appropriate contextual response.
- **One-Click Summarization & Action Item Extraction**:
  - Summarizes long email bodies into structured key takeaways, action items, and sentiment analysis.
- **Clickable Quick-Reply Chips**:
  - Generates 3 professional response options that can be inserted into the compose box with a single click.

### 2. Real-Time Mail Synchronization
- Built on **Server-Sent Events (SSE)** via `/api/gmail/sync-stream`.
- Background change detection polls mailbox history and broadcasts `NEW_EMAIL` events to active browser sessions.
- Incoming messages appear at the top of the mailbox in real time without requiring manual page reloads.
- Includes a webhook receiver endpoint (`/api/gmail/webhook`) compatible with Google Cloud Pub/Sub push notifications.

### 3. Full-Featured Gmail API v1 Client
- **Secure Google OAuth 2.0**: Implements authorization code flow with offline access (refresh tokens) and granular scopes (`gmail.readonly`, `gmail.send`, `gmail.modify`).
- **Inbox & Sent Mail Folders**: Reads live email threads with sender avatars, parsed recipient headers, snippets, and timestamps.
- **Read/Unread Tracking**: Automatically marks unread emails as read upon opening.
- **Star & Trash Management**: Toggles starred status and moves unwanted messages to trash.
- **RFC 2822 Compliant Sending**: Encodes MIME messages with base64url encoding and preserves thread relationships (`In-Reply-To` and `References` headers).
- **Resilient Fallback Mode**: Gracefully transitions to a mock preview dataset if OAuth credentials are not yet configured, ensuring zero application crashes during review.

### 4. Modern, Accessible User Interface
- **Clean 3-Column Layout**: Sidebar navigation, searchable mailbox list, detailed reader view, and dedicated AI Copilot panel.
- **Dark Mode / Light Mode**: Seamless theme toggle with CSS custom properties and persistent state in `localStorage`.
- **Keyboard Shortcuts**: `⌘K` / `Ctrl+K` for instant search focus, `Esc` to dismiss modals.
- **Strict Security Architecture**: Zero hardcoded secrets; defense-in-depth `.gitignore` protecting credentials and tokens.

---

## 🛠️ Technology Stack

| Layer | Technologies | Rationale & Architecture Role |
|---|---|---|
| **Frontend UI** | HTML5, CSS3, Vanilla ES6+ Modules | Lightweight, zero-dependency, ultra-fast DOM manipulation for smooth typing animations and state synchronization. |
| **Backend Framework** | Node.js (v20 LTS), Express.js (ESM) | Non-blocking asynchronous I/O ideal for concurrent API proxying, SSE streaming, and LLM orchestration. |
| **AI / LLM Engine** | Google Gemini 2.5 Flash (`@google/genai`) | High-speed, cost-effective multimodal LLM with exceptional structured JSON tool/action calling capabilities. |
| **Mail Provider API** | Google Gmail API v1 (`googleapis`) | Direct integration with Google mail infrastructure for authentication, message retrieval, and delivery. |
| **Authentication** | Google OAuth 2.0 (Authorization Code Flow) | Industry-standard secure delegated access with token auto-refresh and local persistent credential storage. |
| **Real-Time Sync** | Server-Sent Events (SSE) | Unidirectional HTTP streaming protocol for lightweight, firewall-friendly real-time browser updates. |
| **Security & Config** | `dotenv`, `.gitignore` | Environment segregation ensuring API keys, OAuth client secrets, and access tokens never enter source control. |

---

## 🏛️ System Architecture

### Architectural Overview Diagram

```
+-----------------------------------------------------------------------------------+
|                                   FRONTEND (SPA)                                  |
|                                                                                   |
|   +------------------+     +-------------------+     +------------------------+   |
|   |   Sidebar & Nav  |     |   Mailbox List    |     |   Email Reader View    |   |
|   +------------------+     +-------------------+     +------------------------+   |
|                              ▲                               ▲                    |
|                              │ UI Updates                    │ State Binding      |
|                      +-----------------------------------------------+            |
|                      |             AI Copilot UI Engine              |            |
|                      |       (frontend/js/aiCopilot.js)              |            |
|                      |  - Animated Typing Driver                     |            |
|                      |  - Action Dispatcher & Confirmation Cards     |            |
|                      +-----------------------------------------------+            |
|                                              │                                    |
|                                              │ POST /api/ai/copilot               |
+----------------------------------------------┼------------------------------------+
                                               │ (User Prompt + Current UI State)
                                               ▼
+-----------------------------------------------------------------------------------+
|                                   BACKEND (Node.js)                               |
|                                                                                   |
|           +─────────────────────────────────────────────────────────+             |
|           |                       Express Server                    |             |
|           |                    (backend/server.js)                  |             |
|           +────────────────────────────┬────────────────────────────+             |
|                                        │                                          |
|                    ┌───────────────────┴───────────────────┐                      |
|                    ▼                                       ▼                      |
|       +-------------------------+             +-------------------------+         |
|       |     Gmail Service       |             |       AI Service        |         |
|       | (services/gmailService) |             |  (services/aiService)   |         |
|       +------------┬------------+             +------------┬------------+         |
|                    │                                       │                      |
|                    │ Googleapis Client                     │ @google/genai        |
+--------------------┼---------------------------------------┼----------------------+
                     │                                       │
                     ▼                                       ▼
        +-------------------------+             +-------------------------+
        |     Google Gmail API    |             |   Google Gemini Flash   |
        |  (OAuth 2.0, Mail v1)   |             | (LLM Action Generator)  |
        +-------------------------+             +-------------------------+
```

### The AI UI Action Execution Flow

```
[User speaks/types natural language]
                 │
                 ▼
[Frontend captures prompt & packages UI context]
  - Active folder (inbox/sent)
  - Currently opened email
  - Visible emails array
  - Compose modal state
                 │
                 ▼
[POST /api/ai/copilot] ──► [Gemini 2.5 Flash analyzes intent against UI state]
                 │
                 ▼
[Returns Structured JSON Action Plan]
  e.g., { "actions": [ { "type": "OPEN_COMPOSE", ... }, { "type": "CONFIRM_SEND", ... } ] }
                 │
                 ▼
[aiCopilot.js executes actions sequentially]
  1. Opens Compose Modal
  2. Visibly types characters into To, Subject, and Body (animated)
  3. Displays interactive Send Confirmation card in the chat
                 │
                 ▼
[User confirms send -> real email dispatched through Gmail API v1]
```

---

## 📁 Project Directory Structure

```
ai-mail/
├── backend/
│   ├── routes/
│   │   ├── gmailRoutes.js      # Endpoints for Gmail API operations & SSE streaming
│   │   └── aiRoutes.js         # Endpoints for AI Copilot, summarization, and reply suggestions
│   ├── services/
│   │   ├── gmailService.js     # OAuth 2.0 management, Gmail client, background sync checker
│   │   └── aiService.js        # Gemini 2.5 Flash integration & resilient NLP intent fallback
│   ├── .env.example            # Backend-specific environment variables template
│   ├── .gitignore              # Backend-specific exclusion rules
│   ├── package.json            # Node.js project manifest & dependency specifications
│   └── server.js               # Express application entrypoint, middleware, and route mounting
├── frontend/
│   ├── css/
│   │   └── style.css           # Responsive design, light/dark themes, typing animations
│   ├── js/
│   │   ├── app.js              # Application state manager, Gmail API client, and SSE listener
│   │   └── aiCopilot.js        # UI Automation Engine (animated typing, action executor, cards)
│   └── index.html              # Single Page Application HTML structure & accessible modals
├── credentials/
│   └── PUT_CREDENTIALS_JSON_HERE.txt # Instructions for placing Google OAuth credentials.json
├── .env.example                # Root-level environment variables template
├── .gitignore                  # Comprehensive root Git exclusion rules
└── README.md                   # Complete system documentation
```

---

## ⚙️ Installation & Setup Guide

### Prerequisites
- **Node.js**: `v18.x` or higher (`v20.x LTS` recommended)
- **npm**: `v9.x` or higher
- A modern browser with ES module support (Google Chrome, Microsoft Edge, Firefox, Safari)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/<your-username>/ai-mail.git
cd ai-mail
```

---

### Step 2: Install Dependencies
Navigate to the `backend/` directory and install the required npm packages:
```bash
cd backend
npm install
```

---

### Step 3: Configure Environment Variables
Create a local `.env` configuration file from the template:
```bash
# On Linux / macOS / Git Bash:
cp .env.example .env

# On Windows PowerShell:
Copy-Item .env.example .env
```

Open `backend/.env` and configure the variables:
```env
# ==========================================
# AI Mail - Environment Configuration
# ==========================================

# Port the Express server will listen on
PORT=5000

# Google OAuth 2.0 Redirect URI (Must match Google Cloud Console)
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

# Google Gemini API Key (Obtain free from Google AI Studio)
GEMINI_API_KEY=your_gemini_api_key_here

# Gemini Model Selection
GEMINI_MODEL=gemini-2.5-flash
```

---

### Step 4: Configure Google Gemini API Key
1. Navigate to **[Google AI Studio](https://aistudio.google.com/)**.
2. Sign in with your Google account.
3. Click **Get API key** and generate a new key.
4. Copy the key and assign it to `GEMINI_API_KEY` in `backend/.env`.

*(Note: The application includes an intelligent built-in fallback engine, allowing full UI automation testing even before connecting your Gemini API key.)*

---

### Step 5: Configure Google OAuth 2.0 Credentials (For Real Gmail)
1. Go to the **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Create a new project (e.g., `ai-mail-app`).
3. Navigate to **APIs & Services > Library**, search for **Gmail API**, and click **Enable**.
4. Configure the **OAuth consent screen**:
   - User Type: **External**.
   - Fill in App Name, User Support Email, and Developer Contact Email.
   - Under **Scopes**, ensure `gmail.readonly`, `gmail.send`, and `gmail.modify` are available.
   - Under **Test users**, add your own Gmail address (e.g., `yourname@gmail.com`).
5. Navigate to **APIs & Services > Credentials**:
   - Click **Create Credentials > OAuth client ID**.
   - Application Type: **Web application**.
   - Name: `AI Mail Local Client`.
   - Authorized redirect URIs: `http://localhost:5000/auth/google/callback`.
   - Click **Create**.
6. Download the generated client secret JSON.
7. Rename the downloaded file to `credentials.json` and move it into the `credentials/` folder:
   ```
   credentials/credentials.json
   ```

---

### Step 6: Run the Application

From the `backend/` directory:

```bash
# Production mode:
npm start

# Development mode (with file watcher):
npm run dev
```

The terminal will confirm the server is running:
```
========================================
🚀 AI Mail Server running at http://localhost:5000
📁 Serving frontend from: /path/to/ai-mail/frontend
🔐 Google OAuth Configured: true
🤖 Gemini AI Configured: true
========================================
```

Open your browser and navigate to:
```
http://localhost:5000
```

---

## 🧪 Verification & Demonstration Guide

### Demonstration 1: AI Controls the Compose UI
1. In the **AI Copilot** panel on the right, click the quick prompt or enter:
   > *"Send an email to john@example.com with subject 'Meeting Tomorrow' and body 'Let’s meet at 3pm'"*
2. **Result**:
   - The compose modal opens automatically.
   - The To, Subject, and Body fields **visibly type in with real-time character animation**.
   - An interactive confirmation card appears in the chat with **"Send Now"** and **"Edit Draft"** buttons.

### Demonstration 2: Natural Language Mailbox Filtering
1. In the AI Copilot input, enter:
   > *"Show me emails from the last 10 days"*
2. **Result**: The main mailbox updates instantly with filtered messages matching the timeframe.
3. Enter:
   > *"Show only unread emails from this week"*
4. **Result**: The unread filter is applied, and unread message indicators are isolated.

### Demonstration 3: Navigation & Detail Opening
1. In the AI Copilot input, enter:
   > *"Open the latest email from David"*
2. **Result**: The application navigates directly to the target email and renders the reader view.

### Demonstration 4: Context-Aware Smart Reply
1. While reading an email, enter in the AI Copilot:
   > *"Reply to this"*
2. **Result**: The AI extracts the open email's context, populates the sender's address, prefixes `Re: [Subject]`, and drafts a contextual reply into the compose box.

### Demonstration 5: Real-Time Mail Sync
1. Keep `http://localhost:5000` open in your browser.
2. Send a new email to your connected Gmail address from another client or account.
3. **Result**: The Server-Sent Events stream detects the incoming message and inserts it at the top of your inbox with an alert toast, **without requiring a manual refresh**.

---

## ⚖️ Engineering Decisions & Trade-Offs

1. **Structured Action Protocol vs. Freeform Text Output**:
   - *Decision*: Constrained LLM outputs to a strict JSON action schema `{ message: string, actions: Array<Action> }`.
   - *Rationale*: A chat-based assistant that only produces markdown cannot execute UI state changes reliably. The action protocol guarantees deterministic, programmable UI side-effects on the frontend.
2. **Server-Sent Events (SSE) vs. WebSockets**:
   - *Decision*: Chose Server-Sent Events over WebSockets for mail synchronization.
   - *Rationale*: Mail synchronization is inherently unidirectional (server pushing change notifications to client). SSE runs natively over standard HTTP/1.1 and HTTP/2, requires no custom socket protocol, handles automatic reconnection natively in the browser, and avoids stateful socket connection maintenance.
3. **Dual AI Engine Architecture (Gemini 2.5 Flash + Local Fallback)**:
   - *Decision*: Implemented Gemini 2.5 Flash via `@google/genai` paired with a rule-based NLP intent parser fallback.
   - *Rationale*: Guarantees high availability and ensures recruiters, evaluators, and reviewers can test all 6 core UI automation scenarios out-of-the-box even in offline environments or prior to provisioning API keys.
4. **Human-in-the-Loop Safeguard**:
   - *Decision*: Mandated user confirmation before triggering final email dispatch via the Gmail API.
   - *Rationale*: Prevents autonomous agent hallucinations from sending unintended external communications, meeting enterprise safety standards.

---

## 🔒 Security Best Practices & Compliance

- **No Secrets in Source Control**: Strictly gitignores `.env`, `credentials.json`, `token.json`, and all `.log` files.
- **Principle of Least Privilege**: Google OAuth scopes are limited strictly to `gmail.readonly`, `gmail.send`, and `gmail.modify`.
- **Token Security**: Google OAuth access and refresh tokens are stored securely in local JSON files and never exposed to the client-side JavaScript bundle.
- **Input Sanitization**: Email headers and bodies are decoded and sanitized against Cross-Site Scripting (XSS) before rendering in the DOM.

---

## 🔮 Future Improvements & Capstone Roadmap

- [ ] **Vector Database & Semantic Search**: Integrate ChromaDB or Pinecone with text embeddings to enable semantic email searches (e.g., *"Find the invoice for last year's cloud subscription"*).
- [ ] **Multi-Provider Support**: Expand mail services beyond Gmail to include Microsoft Graph API (Outlook/Office 365) and generic IMAP/SMTP providers.
- [ ] **Thread / Conversation Grouping**: Group related messages chronologically with collapsible thread expansion.
- [ ] **Offline Caching with IndexedDB**: Implement Service Workers and IndexedDB for fully functional offline composing and outbox synchronization.
- [ ] **Automated End-to-End Test Suite**: Comprehensive Playwright / Cypress integration tests verifying AI UI automation flows.

---

## 👥 Authors & Collaborators

- **Developed as a Computer Science & Engineering Capstone / Engineering Task**.
- **Collaborators / Reviewers**:
  - `Aswath363`
  - `akshaiP`
  - `ashwanthnebula`

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
