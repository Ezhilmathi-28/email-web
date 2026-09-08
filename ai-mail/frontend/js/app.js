/**
 * AI Mail — Main Frontend Application Controller
 * Handles Gmail API communication, mailbox rendering, real-time sync, and AI Copilot integration.
 */

import { handleAiCommand, typeIntoField, appendChatMessage } from "./aiCopilot.js";

// DOM Selector Helper
const $ = (id) => document.getElementById(id);

// Application State
const state = {
  currentView: "inbox", // 'inbox' | 'sent' | 'starred' | 'trash'
  emails: [],
  allFetchedEmails: [],
  currentEmail: null,
  auth: { authenticated: false, email: "", configured: false },
  activeChip: "all",
  isComposeOpen: false,
  eventSource: null,
  demoMode: false
};

// Fallback preview dataset for preview/demo when Gmail OAuth is not yet completed
const DEMO_EMAILS = [
  {
    id: "demo-1",
    sender: "John Carter",
    email: "john.carter@example.com",
    subject: "Meeting Tomorrow",
    snippet: "Can we meet tomorrow at 3 PM to discuss the project updates and next steps?",
    body: "Hi,\n\nCan we meet tomorrow at 3 PM to discuss the project updates and next steps?\n\nLet me know your availability.\n\nThanks,\nJohn",
    date: "10:24 AM",
    unread: true,
    star: true
  },
  {
    id: "demo-2",
    sender: "Google Security",
    email: "no-reply@accounts.google.com",
    subject: "Security alert for your linked Google Account",
    snippet: "We noticed a new sign-in to your Google Account. Review the activity to keep your account secure.",
    body: "We noticed a new sign-in to your Google Account from a Windows device. If this was you, you don't need to do anything. If not, please review your account activity immediately.",
    date: "9:12 AM",
    unread: true,
    star: false
  },
  {
    id: "demo-3",
    sender: "Sarah Williams",
    email: "sarah@example.com",
    subject: "Project Update: Milestone 1 Completed",
    snippet: "Here's the latest update on the project. The team has completed the first milestone.",
    body: "Hi team,\n\nHere's the latest update on the project. The team has completed the first milestone and we're moving into testing ahead of schedule.\n\nPlease review the attached summary and send your feedback.\n\nBest,\nSarah",
    date: "Yesterday",
    unread: false,
    star: true
  },
  {
    id: "demo-4",
    sender: "David Lee",
    email: "david@example.com",
    subject: "Design Files & UI Mockups for Mail Client",
    snippet: "Attached are the design files you requested. Please review them and share your feedback.",
    body: "Hey there,\n\nAttached are the design files and UI mockups you requested for the AI-powered mail client. Take a look and let me know if you want any color palette tweaks!\n\nCheers,\nDavid",
    date: "Yesterday",
    unread: true,
    star: false
  },
  {
    id: "demo-5",
    sender: "Team HR",
    email: "hr@company.com",
    subject: "Welcome to the Team! Onboarding Guide",
    snippet: "We're excited to have you on board. Please find the onboarding information attached.",
    body: "Welcome to the team!\n\nWe're thrilled to have you join us. Please review your onboarding packet and join the team standup tomorrow morning.\n\nWarm regards,\nPeople Operations",
    date: "2 Sep",
    unread: false,
    star: false
  },
  {
    id: "demo-6",
    sender: "Priya Sharma",
    email: "priya@example.com",
    subject: "Re: Partnership & Integration Opportunity",
    snippet: "Thank you for your interest. We'll get back to you soon with the next steps.",
    body: "Hi,\n\nThank you for reaching out regarding our API integration. We've reviewed the scope and would love to schedule a call next week.\n\nRegards,\nPriya",
    date: "1 Sep",
    unread: true,
    star: false
  }
];

// ==========================================
// 1. INITIALIZATION & AUTH STATUS
// ==========================================

async function init() {
  setupTheme();
  setupEventListeners();
  await checkAuthStatus();
  await loadEmails();
  connectRealtimeSync();

  // Check URL query parameters (e.g. ?connected=1 or ?auth_error=...)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("connected") === "1") {
    toast("Gmail Connected!", "Your Google account has been successfully linked.");
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get("auth_error")) {
    toast("OAuth Notice", decodeURIComponent(urlParams.get("auth_error")), "warning");
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function checkAuthStatus() {
  try {
    const res = await fetch("/api/gmail/auth-status");
    if (!res.ok) throw new Error("Auth status check failed");
    const data = await res.json();
    state.auth = data;

    const badge = $("authBadge");
    const emailText = $("userEmailText");
    const logoutBtn = $("logoutBtn");
    const avatar = $("userAvatar");

    if (data.authenticated && data.email) {
      state.demoMode = false;
      emailText.textContent = data.email;
      badge.classList.remove("offline");
      logoutBtn.classList.remove("hidden");
      avatar.textContent = (data.email[0] || "U").toUpperCase();
      $("authModal").classList.add("hidden");
    } else {
      emailText.textContent = data.configured ? "Connect Gmail" : "Demo Mode (Offline)";
      badge.classList.add("offline");
      logoutBtn.classList.add("hidden");
      avatar.textContent = "U";

      // If credentials are configured but user not logged in, prompt user
      badge.style.cursor = "pointer";
      badge.onclick = () => {
        if (data.configured) {
          window.location.href = "/auth/google";
        } else {
          $("authModal").classList.remove("hidden");
        }
      };
    }
  } catch (err) {
    console.warn("Could not check auth status:", err.message);
    state.demoMode = true;
    $("userEmailText").textContent = "Preview Mode";
  }
}

// ==========================================
// 2. EMAIL FETCHING & REAL-TIME SYNC
// ==========================================

async function loadEmails(showLoading = true) {
  if (showLoading) {
    $("emailList").innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Loading ${state.currentView}...</p>
      </div>
    `;
  }

  // Update view heading
  const titles = { inbox: "Inbox", sent: "Sent", starred: "Starred", trash: "Trash" };
  $("viewHeading").innerHTML = `${titles[state.currentView] || "Emails"} <small id="headingCount">(...)</small>`;

  if (!state.auth.authenticated) {
    // Fallback to demo data
    let list = [...DEMO_EMAILS];
    if (state.currentView === "sent") {
      list = [
        {
          id: "sent-1",
          sender: "Me",
          email: "me@example.com",
          to: "john.carter@example.com",
          subject: "Project Confirmation",
          snippet: "Thanks John, sounds great. Let's touch base tomorrow afternoon.",
          body: "Thanks John, sounds great. Let's touch base tomorrow afternoon at 3 PM.\n\nBest,\nMe",
          date: "Yesterday",
          unread: false,
          star: false
        }
      ];
    } else if (state.currentView === "starred") {
      list = DEMO_EMAILS.filter((e) => e.star);
    }
    state.allFetchedEmails = list;
    applyCurrentFilters();
    updateCounts();
    return;
  }

  try {
    let endpoint = "/api/gmail/inbox";
    if (state.currentView === "sent") endpoint = "/api/gmail/sent";

    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const data = await res.json();
    state.allFetchedEmails = Array.isArray(data) ? data : [];
    if (state.currentView === "starred") {
      state.allFetchedEmails = state.allFetchedEmails.filter((e) => e.star);
    }

    applyCurrentFilters();
    updateCounts();
    $("syncText").textContent = "⚡ Synced just now";
  } catch (err) {
    console.error("Failed to load emails from Gmail API:", err);
    toast("Sync Notice", "Using local cached preview.", "info");
    state.allFetchedEmails = DEMO_EMAILS;
    applyCurrentFilters();
    updateCounts();
  }
}

function updateCounts() {
  const unreadCount = state.allFetchedEmails.filter((e) => e.unread).length;
  $("inboxCountBadge").textContent = unreadCount || state.allFetchedEmails.length;
  $("headingCount").textContent = `(${state.emails.length})`;
}

// Server-Sent Events (SSE) for Real-Time Sync
function connectRealtimeSync() {
  if (state.eventSource) {
    state.eventSource.close();
  }

  try {
    state.eventSource = new EventSource("/api/gmail/sync-stream");

    state.eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "NEW_EMAIL" && payload.email) {
          handleIncomingRealtimeEmail(payload.email);
        } else if (payload.type === "MAIL_SENT") {
          toast("Email Delivered", `Delivered to ${payload.data.to}`, "success");
          if (state.currentView === "sent") loadEmails(false);
        }
      } catch (e) {
        // Ignored non-json messages (e.g. heartbeat)
      }
    };

    state.eventSource.onerror = () => {
      // Reconnects automatically by browser SSE spec
    };
  } catch (err) {
    console.warn("SSE connection error:", err);
  }
}

function handleIncomingRealtimeEmail(newEmail) {
  // Satisfies PDF Requirement: "New emails should appear in the inbox without a manual refresh."
  if (state.allFetchedEmails.some((e) => e.id === newEmail.id)) return;

  state.allFetchedEmails.unshift(newEmail);
  if (state.currentView === "inbox") {
    applyCurrentFilters();
    toast("New Email", `From ${newEmail.sender}: "${newEmail.subject}"`, "success");
  }
  updateCounts();
}

// ==========================================
// 3. RENDERING MAILBOX & EMAIL DETAILS
// ==========================================

function renderEmailList(list) {
  const container = $("emailList");
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="empty" style="padding: 40px 10px;">
        <div style="width: 48px; height: 48px; font-size: 20px;">📭</div>
        <h3>No emails found</h3>
        <p>Your ${state.currentView} is empty or no messages match your filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list
    .map((e) => {
      const isSelected = state.currentEmail?.id === e.id;
      const initial = (e.sender?.[0] || e.email?.[0] || "U").toUpperCase();
      const preview = (e.body || e.snippet || "").replace(/\n/g, " ").slice(0, 75);

      return `
        <article class="email ${e.unread ? "unread" : ""} ${isSelected ? "selected" : ""}" data-id="${e.id}">
          <span class="dot ${e.unread ? "" : "read"}"></span>
          <div class="eavatar">${initial}</div>
          <div class="econtent">
            <strong>${escapeHtml(e.sender || e.email || "Unknown")}</strong>
            <h4>${escapeHtml(e.subject || "(No subject)")}</h4>
            <p>${escapeHtml(preview)}...</p>
          </div>
          <div class="meta">
            <span>${escapeHtml(formatDate(e.date))}</span>
            <span class="star ${e.star ? "on" : ""}" data-star="${e.id}">${e.star ? "★" : "☆"}</span>
          </div>
        </article>
      `;
    })
    .join("");

  // Attach click events
  container.querySelectorAll(".email").forEach((el) => {
    el.onclick = (ev) => {
      if (ev.target.classList.contains("star")) return;
      const id = el.getAttribute("data-id");
      openEmail(id);
    };
  });

  // Attach star click events
  container.querySelectorAll(".star").forEach((starEl) => {
    starEl.onclick = async (ev) => {
      ev.stopPropagation();
      const id = starEl.getAttribute("data-star");
      await toggleStar(id);
    };
  });
}

async function openEmail(id) {
  const email = state.allFetchedEmails.find((e) => String(e.id) === String(id));
  if (!email) return;

  state.currentEmail = email;
  email.unread = false;

  // Re-render list to show selected state & mark read
  renderEmailList(state.emails);
  updateCounts();

  // If connected, fetch full message and mark read in Gmail
  if (state.auth.authenticated && !state.demoMode && !String(id).startsWith("demo-")) {
    fetch(`/api/gmail/email/${id}`).catch(() => {});
  }

  // Populate Reader Column
  $("readerEmpty").classList.add("hidden");
  $("readerDetail").classList.remove("hidden");

  $("detailSubject").textContent = email.subject || "(No subject)";
  $("detailSender").textContent = email.sender || email.email;
  $("detailMeta").textContent = `${email.email || ""} · to me · ${email.date || "Today"}`;
  $("detailAvatar").textContent = (email.sender?.[0] || "U").toUpperCase();
  $("detailStarBtn").textContent = email.star ? "★" : "☆";
  $("detailStarBtn").className = `star-btn ${email.star ? "on" : ""}`;

  // Email body formatting
  const bodyText = email.body || email.snippet || "No content provided in this email.";
  $("detailBody").textContent = bodyText;
}

// ==========================================
// 4. COMPOSE & SEND REAL EMAILS
// ==========================================

function openComposeModal(initialData = {}) {
  state.isComposeOpen = true;
  $("modal").classList.remove("hidden");

  $("composeModalTitle").textContent = initialData.isReply ? "Reply Message" : "New Message";
  $("to").value = initialData.to || "";
  $("subject").value = initialData.subject || "";
  $("body").value = initialData.body || "";

  $("to").focus();
}

function closeComposeModal() {
  state.isComposeOpen = false;
  $("modal").classList.add("hidden");
}

function openReplyModal(suggestedBody = "") {
  if (!state.currentEmail) {
    toast("No Email Selected", "Please select an email to reply to.", "warning");
    return;
  }

  const email = state.currentEmail;
  const recipient = email.email || email.sender;
  const reSubject = email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`;
  const firstName = (email.sender || "there").split(" ")[0];
  const initialBody = suggestedBody || `Hi ${firstName},\n\n`;

  openComposeModal({
    to: recipient,
    subject: reSubject,
    body: initialBody,
    isReply: true
  });
}

async function sendRealEmail() {
  const to = $("to").value.trim();
  const subject = $("subject").value.trim();
  const body = $("body").value.trim();

  if (!to || !subject || !body) {
    toast("Missing Fields", "Please provide recipient (To), Subject, and Body.", "warning");
    return false;
  }

  const sendBtn = $("send");
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending...";

  try {
    if (!state.auth.authenticated || state.demoMode) {
      // Simulate real send in demo mode
      await new Promise((r) => setTimeout(r, 600));
      closeComposeModal();
      toast("Email Sent (Demo)", `Your message to ${to} has been sent successfully!`, "success");
      sendBtn.disabled = false;
      sendBtn.textContent = "Send ➤";
      return true;
    }

    // Call Real Gmail Send API
    const res = await fetch("/api/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body })
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || "Could not send email.");
    }

    closeComposeModal();
    toast("Email Sent Successfully!", `Delivered to ${to}`, "success");
    if (state.currentView === "sent") loadEmails(false);
    return true;
  } catch (err) {
    console.error("Send email error:", err);
    toast("Send Failed", err.message, "error");
    return false;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send ➤";
  }
}

async function toggleStar(id) {
  const email = state.allFetchedEmails.find((e) => String(e.id) === String(id));
  if (!email) return;

  email.star = !email.star;
  renderEmailList(state.emails);

  if (state.currentEmail?.id === email.id) {
    $("detailStarBtn").textContent = email.star ? "★" : "☆";
  }

  if (state.auth.authenticated && !state.demoMode && !String(id).startsWith("demo-")) {
    fetch(`/api/gmail/star/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ star: email.star })
    }).catch(() => {});
  }
}

async function deleteCurrentEmail() {
  if (!state.currentEmail) return;
  const id = state.currentEmail.id;

  state.allFetchedEmails = state.allFetchedEmails.filter((e) => e.id !== id);
  state.currentEmail = null;

  $("readerEmpty").classList.remove("hidden");
  $("readerDetail").classList.add("hidden");

  applyCurrentFilters();
  updateCounts();
  toast("Email Moved to Trash", "Message deleted.", "info");

  if (state.auth.authenticated && !state.demoMode && !String(id).startsWith("demo-")) {
    fetch(`/api/gmail/email/${id}`, { method: "DELETE" }).catch(() => {});
  }
}

// ==========================================
// 5. SEARCH & FILTERS
// ==========================================

function applyCurrentFilters() {
  const query = ($("search").value || "").toLowerCase().trim();
  const senderFilter = ($("filterSender")?.value || "").toLowerCase().trim();
  const keywordFilter = ($("filterKeyword")?.value || "").toLowerCase().trim();
  const readFilter = $("filterRead")?.value || "all";
  const dateFilter = $("filterDate")?.value || "any";

  let filtered = [...state.allFetchedEmails];

  // Quick Chips
  if (state.activeChip === "unread") {
    filtered = filtered.filter((e) => e.unread);
  } else if (state.activeChip === "starred") {
    filtered = filtered.filter((e) => e.star);
  }

  // Topbar search input
  if (query) {
    filtered = filtered.filter(
      (e) =>
        (e.sender || "").toLowerCase().includes(query) ||
        (e.email || "").toLowerCase().includes(query) ||
        (e.subject || "").toLowerCase().includes(query) ||
        (e.body || e.snippet || "").toLowerCase().includes(query)
    );
  }

  // Filter Drawer controls
  if (senderFilter) {
    filtered = filtered.filter(
      (e) =>
        (e.sender || "").toLowerCase().includes(senderFilter) ||
        (e.email || "").toLowerCase().includes(senderFilter)
    );
  }
  if (keywordFilter) {
    filtered = filtered.filter(
      (e) =>
        (e.subject || "").toLowerCase().includes(keywordFilter) ||
        (e.body || e.snippet || "").toLowerCase().includes(keywordFilter)
    );
  }
  if (readFilter === "unread") {
    filtered = filtered.filter((e) => e.unread);
  } else if (readFilter === "read") {
    filtered = filtered.filter((e) => !e.unread);
  }

  state.emails = filtered;
  renderEmailList(state.emails);
  $("headingCount").textContent = `(${state.emails.length})`;
}

// ==========================================
// 6. UI INTERFACE FOR AI COPILOT
// ==========================================

const appState = {
  getCurrentView: () => state.currentView,
  getCurrentEmail: () => state.currentEmail,
  getVisibleEmails: () => state.emails,
  isComposeOpen: () => state.isComposeOpen,
  getComposeData: () => ({
    to: $("to").value,
    subject: $("subject").value,
    body: $("body").value
  }),
  openComposeModal: (data) => openComposeModal(data),
  openReplyModal: (text) => openReplyModal(text),
  switchView: async (view) => {
    state.currentView = view;
    document.querySelectorAll("#sidebarNav .nav").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-view") === view);
    });
    await loadEmails();
  },
  openEmailByCriteria: (criteria) => {
    let match = null;
    if (criteria.id) {
      match = state.allFetchedEmails.find((e) => String(e.id) === String(criteria.id));
    }
    if (!match && criteria.sender) {
      const s = criteria.sender.toLowerCase();
      match = state.allFetchedEmails.find(
        (e) =>
          (e.sender && e.sender.toLowerCase().includes(s)) ||
          (e.email && e.email.toLowerCase().includes(s))
      );
    }
    if (!match && criteria.subject) {
      const sub = criteria.subject.toLowerCase();
      match = state.allFetchedEmails.find(
        (e) => e.subject && e.subject.toLowerCase().includes(sub)
      );
    }
    if (!match && (criteria.latest || criteria.index === 0)) {
      match = state.emails[0];
    }
    if (match) {
      openEmail(match.id);
    }
  },
  applyAssistantFilter: (filters) => {
    if (filters.sender && $("filterSender")) $("filterSender").value = filters.sender;
    if (filters.keyword && $("filterKeyword")) $("filterKeyword").value = filters.keyword;
    if (filters.read && $("filterRead")) $("filterRead").value = filters.read;
    if (filters.date && $("filterDate")) $("filterDate").value = filters.date;
    if (filters.query && !filters.sender && !filters.keyword) {
      $("search").value = filters.query;
    }
    applyCurrentFilters();
    toast("Inbox Filtered", `${state.emails.length} matching emails displayed.`, "info");
  },
  sendRealEmail: () => sendRealEmail()
};

// ==========================================
// 7. EVENT LISTENERS & SETUP
// ==========================================

function setupEventListeners() {
  // Sidebar navigation
  document.querySelectorAll("#sidebarNav .nav").forEach((btn) => {
    btn.onclick = async () => {
      const view = btn.getAttribute("data-view");
      document.querySelectorAll("#sidebarNav .nav").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentView = view;
      await loadEmails();
    };
  });

  // Topbar search input
  $("search").oninput = () => applyCurrentFilters();

  // Chips
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.activeChip = chip.getAttribute("data-chip");
      applyCurrentFilters();
    };
  });

  // Filter drawer toggle
  $("filterBtn").onclick = () => $("filters").classList.toggle("hidden");
  $("applyFilters").onclick = () => {
    applyCurrentFilters();
    $("filters").classList.add("hidden");
  };
  $("resetFilters").onclick = () => {
    $("filterSender").value = "";
    $("filterKeyword").value = "";
    $("filterRead").value = "all";
    $("filterDate").value = "any";
    $("search").value = "";
    applyCurrentFilters();
    $("filters").classList.add("hidden");
  };

  // Compose buttons
  $("composeBtn").onclick = () => openComposeModal();
  $("closeCompose").onclick = closeComposeModal;
  $("discardCompose").onclick = closeComposeModal;
  $("send").onclick = () => sendRealEmail();

  // Reader buttons
  $("detailReplyBtn").onclick = () => openReplyModal();
  $("detailReplyTopBtn").onclick = () => openReplyModal();
  $("detailForwardBtn").onclick = () => {
    if (!state.currentEmail) return;
    openComposeModal({
      to: "",
      subject: `Fwd: ${state.currentEmail.subject}`,
      body: `\n\n---------- Forwarded message ---------\nFrom: ${state.currentEmail.sender} <${state.currentEmail.email}>\nSubject: ${state.currentEmail.subject}\n\n${state.currentEmail.body}`
    });
  };
  $("detailTrashBtn").onclick = deleteCurrentEmail;
  $("detailStarBtn").onclick = () => {
    if (state.currentEmail) toggleStar(state.currentEmail.id);
  };

  // Reader AI Quick Actions
  $("btnAiSummarize").onclick = () => {
    if (state.currentEmail) {
      handleAiCommand(`Summarize this email: "${state.currentEmail.subject}"`, appState);
      $("ai").scrollIntoView({ behavior: "smooth" });
    }
  };
  $("btnAiSuggest").onclick = () => {
    if (state.currentEmail) {
      handleAiCommand(`Suggest replies for this email from ${state.currentEmail.sender}`, appState);
      $("ai").scrollIntoView({ behavior: "smooth" });
    }
  };

  // AI Copilot Input & Button
  $("ask").onclick = () => {
    const input = $("aiInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    handleAiCommand(text, appState);
  };
  $("aiInput").onkeydown = (e) => {
    if (e.key === "Enter") $("ask").click();
  };

  // AI Quick Chips
  document.querySelectorAll("[data-ai]").forEach((btn) => {
    btn.onclick = () => {
      const prompt = btn.getAttribute("data-ai");
      handleAiCommand(prompt, appState);
    };
  });

  // AI Polish Draft in Compose
  $("btnAiDraft").onclick = async () => {
    const currentText = $("body").value;
    const to = $("to").value;
    const subject = $("subject").value;
    toast("AI Drafting...", "Generating polished message with Gemini", "info");
    await handleAiCommand(`Help me write or polish an email to "${to}" with subject "${subject}". Notes: ${currentText}`, appState);
  };

  // Topbar Actions
  $("sync").onclick = async () => {
    $("syncText").textContent = "⚡ Syncing mailbox...";
    await loadEmails(false);
    toast("Mailbox Synced", "All folders are up to date.", "success");
  };
  $("theme").onclick = toggleTheme;
  $("tryAi").onclick = () => $("ai").scrollIntoView({ behavior: "smooth" });
  $("closeAi").onclick = () => ($("ai").style.display = "none");

  // Logout / Disconnect
  $("logoutBtn").onclick = async () => {
    if (confirm("Disconnect Google Account from AI Mail?")) {
      await fetch("/api/gmail/disconnect", { method: "POST" });
      state.auth = { authenticated: false };
      toast("Disconnected", "Google Account disconnected.", "info");
      setTimeout(() => window.location.reload(), 800);
    }
  };

  // Auth modal close
  $("closeAuthModal").onclick = () => $("authModal").classList.add("hidden");
  $("toastClose").onclick = () => $("toast").classList.add("hidden");

  // Keyboard shortcuts (⌘K for search, C for compose, Esc to close modal)
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      $("search").focus();
    } else if (e.key === "Escape") {
      if (state.isComposeOpen) closeComposeModal();
      $("authModal").classList.add("hidden");
    }
  });
}

function setupTheme() {
  const saved = localStorage.getItem("ai_mail_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  $("theme").textContent = saved === "dark" ? "☀" : "☾";
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("ai_mail_theme", next);
  $("theme").textContent = next === "dark" ? "☀" : "☾";
  toast("Theme Updated", `Switched to ${next} theme.`, "info");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function toast(title, text, type = "success") {
  $("toastTitle").textContent = title;
  $("toastText").textContent = text;
  $("toastIcon").textContent = type === "error" ? "✕" : type === "warning" ? "!" : "✓";
  $("toast").classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 3500);
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start application
window.addEventListener("DOMContentLoaded", init);