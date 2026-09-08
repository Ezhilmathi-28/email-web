/**
 * AI Copilot UI Automation Engine
 * Controls the application UI programmatically via Gemini AI commands
 */

// Helper to delay execution for smooth UI transitions
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Visibly types text into an input or textarea with an animated typing effect
 * Satisfies PDF Requirement: "The fields visibly fill in (the user can see it happening)"
 */
export async function typeIntoField(elementId, text, speedMs = 12) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!text) {
    el.value = "";
    return;
  }

  el.focus();
  el.classList.add("ai-typing-highlight");
  el.value = "";

  // For longer bodies, increase typing speed slightly so user isn't waiting too long
  const actualSpeed = text.length > 100 ? 8 : speedMs;

  for (let i = 0; i < text.length; i++) {
    el.value += text[i];
    if (el.tagName === "TEXTAREA" && el.scrollHeight > el.clientHeight) {
      el.scrollTop = el.scrollHeight;
    }
    // Type fast enough to be responsive yet visibly animated
    await wait(actualSpeed);
  }

  el.classList.remove("ai-typing-highlight");
}

/**
 * Appends a message to the AI Chat Panel
 */
export function appendChatMessage(content, sender = "ai", extraHtml = "") {
  const chatContainer = document.getElementById("chat");
  if (!chatContainer) return;

  const isUser = sender === "user";
  const msgDiv = document.createElement("div");
  msgDiv.className = isUser ? "user-msg" : "ai-msg";

  if (isUser) {
    msgDiv.innerHTML = `<div>${escapeHtml(content)}</div>`;
  } else {
    msgDiv.innerHTML = `
      <span>🤖</span>
      <div class="ai-bubble">
        <div class="ai-text">${content}</div>
        ${extraHtml ? `<div class="ai-extra">${extraHtml}</div>` : ""}
      </div>
    `;
  }

  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Shows "Thinking..." loading indicator in chat
 */
let thinkingElement = null;
export function showAiThinking() {
  hideAiThinking();
  const chatContainer = document.getElementById("chat");
  if (!chatContainer) return;

  thinkingElement = document.createElement("div");
  thinkingElement.className = "ai-msg ai-thinking-msg";
  thinkingElement.innerHTML = `
    <span>🤖</span>
    <div class="ai-bubble thinking-bubble">
      <span class="dot-flashing"></span> AI Copilot is thinking...
    </div>
  `;
  chatContainer.appendChild(thinkingElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

export function hideAiThinking() {
  if (thinkingElement) {
    thinkingElement.remove();
    thinkingElement = null;
  }
}

/**
 * Main Controller: Sends prompt and UI context to Backend, then executes UI actions
 */
export async function handleAiCommand(promptText, appState) {
  if (!promptText || !promptText.trim()) return;
  const prompt = promptText.trim();

  // 1. Render user message in chat
  appendChatMessage(prompt, "user");
  showAiThinking();

  try {
    // 2. Prepare rich UI context
    const context = {
      currentView: appState.getCurrentView(),
      currentEmail: appState.getCurrentEmail(),
      visibleEmails: appState.getVisibleEmails().map((e) => ({
        id: e.id,
        sender: e.sender,
        email: e.email,
        subject: e.subject,
        date: e.date,
        unread: e.unread
      })),
      composeOpen: appState.isComposeOpen(),
      composeData: appState.getComposeData()
    };

    // 3. Call backend AI Copilot endpoint
    const response = await fetch("/api/ai/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context })
    });

    hideAiThinking();

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      appendChatMessage(
        `Sorry, I encountered an issue: ${err.error || "Unable to process command."}`,
        "ai"
      );
      return;
    }

    const data = await response.json();

    // 4. Render AI explanation message
    let extraHtml = "";

    // Check if any confirmation action is present
    const confirmAction = data.actions?.find((a) => a.type === "CONFIRM_SEND");
    if (confirmAction) {
      extraHtml += `
        <div class="ai-card ai-confirm-card">
          <div class="ai-card-title">✉ Ready to Send Email</div>
          <div class="ai-card-field"><b>To:</b> ${escapeHtml(confirmAction.to)}</div>
          <div class="ai-card-field"><b>Subject:</b> ${escapeHtml(confirmAction.subject)}</div>
          <div class="ai-card-body-preview">${escapeHtml(confirmAction.body || "").slice(0, 100)}...</div>
          <div class="ai-card-actions">
            <button class="ai-btn-confirm" id="btnConfirmSend_${Date.now()}">Send Now ➤</button>
            <button class="ai-btn-edit" id="btnEditCompose_${Date.now()}">Edit Draft ✏</button>
          </div>
        </div>
      `;
    }

    // Check if summarization action is present
    const sumAction = data.actions?.find((a) => a.type === "SUMMARIZE_EMAIL");
    if (sumAction) {
      extraHtml += `
        <div class="ai-card ai-summary-card">
          <div class="ai-card-header">
            <b>⚡ AI Email Summary</b>
            <span class="sentiment-badge">${escapeHtml(sumAction.sentiment || "Neutral")}</span>
          </div>
          <p class="summary-text">${escapeHtml(sumAction.summary)}</p>
          ${
            sumAction.keyPoints?.length
              ? `<div class="card-section">
                  <small>KEY POINTS</small>
                  <ul>${sumAction.keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
                </div>`
              : ""
          }
          ${
            sumAction.actionItems?.length
              ? `<div class="card-section">
                  <small>ACTION ITEMS</small>
                  <ul>${sumAction.actionItems.map((a) => `<li>✓ ${escapeHtml(a)}</li>`).join("")}</ul>
                </div>`
              : ""
          }
        </div>
      `;
    }

    // Check if reply suggestions action is present
    const replyAction = data.actions?.find((a) => a.type === "SUGGEST_REPLIES");
    if (replyAction && replyAction.suggestions?.length) {
      extraHtml += `
        <div class="ai-reply-suggestions">
          <small>💡 Quick Reply Suggestions:</small>
          <div class="suggestion-chips">
            ${replyAction.suggestions
              .map(
                (s, idx) =>
                  `<button class="reply-chip" data-reply="${escapeHtml(s)}">${escapeHtml(s)}</button>`
              )
              .join("")}
          </div>
        </div>
      `;
    }

    appendChatMessage(data.message, "ai", extraHtml);

    // Wire up confirmation buttons if created
    if (confirmAction) {
      setTimeout(() => {
        const confirmBtn = document.querySelector(".ai-btn-confirm");
        const editBtn = document.querySelector(".ai-btn-edit");
        if (confirmBtn) {
          confirmBtn.onclick = async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = "Sending...";
            await appState.sendRealEmail();
            confirmBtn.textContent = "Sent ✓";
          };
        }
        if (editBtn) {
          editBtn.onclick = () => {
            appState.openComposeModal();
          };
        }
      }, 50);
    }

    // Wire up quick reply suggestion chips
    if (replyAction) {
      setTimeout(() => {
        document.querySelectorAll(".reply-chip").forEach((chip) => {
          chip.onclick = () => {
            const replyText = chip.getAttribute("data-reply");
            appState.openReplyModal(replyText);
          };
        });
      }, 50);
    }

    // 5. Sequentially execute UI actions to paint and drive the interface
    if (Array.isArray(data.actions)) {
      for (const action of data.actions) {
        await executeUiAction(action, appState);
      }
    }
  } catch (err) {
    hideAiThinking();
    console.error("AI Copilot execution error:", err);
    appendChatMessage(
      `An error occurred while connecting to AI services. Please try again.`,
      "ai"
    );
  }
}

/**
 * Executes a single UI action returned by the AI
 */
async function executeUiAction(action, appState) {
  switch (action.type) {
    case "OPEN_COMPOSE": {
      // 1. Open Compose View
      appState.openComposeModal();
      await wait(150);

      // 2. Visibly fill in fields (user can see it happening)
      if (action.to) {
        await typeIntoField("to", action.to, 12);
        await wait(100);
      }
      if (action.subject) {
        await typeIntoField("subject", action.subject, 12);
        await wait(100);
      }
      if (action.body) {
        await typeIntoField("body", action.body, 8);
      }
      break;
    }

    case "REPLY_EMAIL": {
      // Open reply compose with active email context
      appState.openReplyModal();
      await wait(150);
      if (action.body) {
        await typeIntoField("body", action.body, 8);
      }
      break;
    }

    case "NAVIGATE": {
      // Switch view (e.g. Inbox, Sent, Starred)
      if (action.view) {
        appState.switchView(action.view);
      }
      break;
    }

    case "OPEN_EMAIL": {
      // Navigate to and open specific email
      if (action.criteria) {
        appState.openEmailByCriteria(action.criteria);
      }
      break;
    }

    case "FILTER_EMAILS": {
      // Update UI search and filter controls and refresh the mailbox view
      appState.applyAssistantFilter({
        sender: action.sender || "",
        keyword: action.keyword || "",
        read: action.read || "all",
        date: action.date || "any",
        query: action.query || ""
      });
      break;
    }

    case "CONFIRM_SEND": {
      // Make sure the compose window has the content ready
      appState.openComposeModal();
      if (action.to && !document.getElementById("to").value) {
        await typeIntoField("to", action.to);
      }
      if (action.subject && !document.getElementById("subject").value) {
        await typeIntoField("subject", action.subject);
      }
      if (action.body && !document.getElementById("body").value) {
        await typeIntoField("body", action.body);
      }
      break;
    }

    default:
      console.log("Unhandled AI action type:", action.type);
  }
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
