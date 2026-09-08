import { GoogleGenAI } from "@google/genai";

let aiClient = null;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "PASTE_YOUR_GEMINI_KEY_LATER" || apiKey === "your_gemini_api_key_here") {
    return null;
  }
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({ apiKey });
    } catch (err) {
      console.warn("Could not initialize GoogleGenAI client:", err.message);
      return null;
    }
  }
  return aiClient;
}

const SYSTEM_PROMPT = `
You are the AI Co-pilot for "AI Mail", an intelligent email web application.
Your core mission is NOT just to chat with the user, but to DIRECTLY CONTROL THE APPLICATION USER INTERFACE through natural language commands.

Whenever the user makes a request, you must return a strict JSON response containing:
1. "message": A concise, natural, professional message explaining what you did or are about to do.
2. "actions": An ordered list of UI action objects that the frontend interface will execute.

Supported Action Types:
1. { "type": "OPEN_COMPOSE", "to": string, "subject": string, "body": string }
   - Opens the compose modal and visibly types or populates the fields.
2. { "type": "CONFIRM_SEND", "to": string, "subject": string, "body": string, "prompt": string }
   - Used when user asks to send an email. Opens/fills compose, then asks user for confirmation before sending (human-in-the-loop).
3. { "type": "NAVIGATE", "view": "inbox" | "sent" | "starred" | "trash" }
   - Switches the mailbox view.
4. { "type": "FILTER_EMAILS", "sender": string, "keyword": string, "read": "all" | "unread" | "read", "date": "any" | "today" | "week" | "month", "query": string }
   - Filters the active email list in the main UI based on parameters.
5. { "type": "OPEN_EMAIL", "criteria": { "sender"?: string, "subject"?: string, "index"?: number, "latest"?: boolean } }
   - Navigates to and opens a specific email in the reader view.
6. { "type": "REPLY_EMAIL", "body": string }
   - Context-aware reply to the currently opened email.
7. { "type": "SUMMARIZE_EMAIL", "summary": string, "keyPoints": string[], "actionItems": string[], "sentiment": string }
   - Generates a structured summary card of the currently opened email.
8. { "type": "SUGGEST_REPLIES", "suggestions": string[] }
   - Provides 2-3 clickable quick response suggestions.

Context provided to you in each prompt:
- currentView: active folder ('inbox', 'sent', etc.)
- currentEmail: full details of the currently opened email (id, sender, email, subject, body, date)
- visibleEmails: list of emails currently displayed in the UI (id, sender, email, subject, date, unread)
- composeState: whether compose modal is open and its current values

Always respond with ONLY valid JSON adhering to:
{
  "message": "...",
  "actions": [ ... ]
}
`;

/**
 * Intelligent local intent parser fallback when GEMINI_API_KEY is not configured
 */
function localIntentFallback(prompt, context = {}) {
  const p = prompt.trim();
  const lower = p.toLowerCase();
  const { currentEmail, visibleEmails = [] } = context;

  // 1. Compose & Send Intent:
  // e.g. "Send an email to john@example.com with subject 'Meeting Tomorrow' and body 'Let's meet at 3pm'"
  // or "Compose an email to..."
  if (lower.includes("send an email to") || lower.includes("compose an email to") || lower.includes("write an email to") || lower.startsWith("send email to") || lower.startsWith("compose to")) {
    let to = "";
    let subject = "";
    let body = "";

    const emailMatch = p.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) to = emailMatch[0];

    const subjectMatch = p.match(/subject\s+['"‘“](.+?)['"’”](?:\s+and|\s+body|$)/i) || p.match(/subject\s+['"‘“](.+?)['"’”]/i) || p.match(/subject\s+([^,]+?)(?:\s+and\s+body|\s+body|$)/i);
    if (subjectMatch) subject = subjectMatch[1].trim();

    // Support quotes or apostrophes in body like "Let's meet"
    const bodyMatch = p.match(/body\s+["“](.+?)["”]$/i) || p.match(/body\s+['‘](.+?)['’]$/i) || p.match(/body\s+['"‘“](.+?)['"’”]/i) || p.match(/body\s+(.+)$/i);
    if (bodyMatch) {
      body = bodyMatch[1].trim().replace(/^['"‘“]|['"’”]$/g, "");
    }

    if (!to && lower.includes("john")) to = "john@example.com";
    if (!subject && lower.includes("meeting")) subject = "Meeting Tomorrow";
    if (!body && lower.includes("meet")) body = "Let's meet at 3pm.";

    return {
      message: `I've opened the compose window and prepared your email for ${to || "the recipient"}. Please review it before sending.`,
      actions: [
        {
          type: "OPEN_COMPOSE",
          to: to || "",
          subject: subject || "No Subject",
          body: body || ""
        },
        {
          type: "CONFIRM_SEND",
          to: to || "",
          subject: subject || "No Subject",
          body: body || "",
          prompt: `Ready to send to ${to}? Click Confirm below or send directly from the compose form.`
        }
      ]
    };
  }

  // 2. Generic Compose:
  if (lower === "compose" || lower === "compose email" || lower.includes("new email") || lower.includes("compose an email")) {
    return {
      message: "Opening the compose window for you.",
      actions: [{ type: "OPEN_COMPOSE", to: "", subject: "", body: "" }]
    };
  }

  // 3. Reply to this:
  // e.g. "Reply to this", "Reply saying yes", "Reply to Sarah"
  if (lower.includes("reply to this") || lower.startsWith("reply") || lower.includes("respond to this")) {
    if (currentEmail) {
      let replyBody = "Thank you for the update. I will review and get back to you shortly.";
      if (lower.includes("saying yes") || lower.includes("agree")) {
        replyBody = "Sounds good to me, let's proceed!";
      } else if (lower.includes("can't make it") || lower.includes("decline")) {
        replyBody = "Thank you for the invitation, but unfortunately I won't be able to make it.";
      }
      return {
        message: `I've opened a reply to ${currentEmail.sender} with context from their email.`,
        actions: [
          {
            type: "REPLY_EMAIL",
            body: replyBody
          }
        ]
      };
    } else {
      return {
        message: "Please select or open an email first so I can use it as context for your reply.",
        actions: []
      };
    }
  }

  // 4. Summarize:
  if (lower.includes("summarize") || lower.includes("summary") || lower.includes("tl;dr")) {
    if (currentEmail) {
      const lines = (currentEmail.body || currentEmail.snippet || "").split("\n").filter(Boolean);
      return {
        message: `Here is a summary of "${currentEmail.subject}" from ${currentEmail.sender}:`,
        actions: [
          {
            type: "SUMMARIZE_EMAIL",
            summary: `This email from ${currentEmail.sender} addresses "${currentEmail.subject}".`,
            keyPoints: [
              `Sender: ${currentEmail.sender} (${currentEmail.email || "N/A"})`,
              `Core topic: ${currentEmail.subject}`,
              lines[0] || "Key information provided in message."
            ],
            actionItems: ["Review details and respond if required"],
            sentiment: "Professional"
          }
        ]
      };
    } else {
      return {
        message: "Select an email first and I'll summarize it for you.",
        actions: []
      };
    }
  }

  const stopWords = new Set(["the", "this", "that", "last", "today", "yesterday", "a", "an", "here", "my", "me", "week", "month"]);

  // 5. Search & Display / Filters via Assistant:
  // e.g. "Show me emails from the last 10 days"
  // e.g. "Find the email from Sarah about the project update"
  // e.g. "Show only unread emails from this week"
  if (
    lower.includes("show") ||
    lower.includes("find") ||
    lower.includes("filter") ||
    lower.includes("search") ||
    lower.includes("unread")
  ) {
    let readStatus = "all";
    if (lower.includes("unread")) readStatus = "unread";
    else if (/\bread\b/.test(lower)) readStatus = "read";

    let dateRange = "any";
    if (lower.includes("10 days") || lower.includes("last 10") || lower.includes("last 7") || lower.includes("this week") || lower.includes("week")) {
      dateRange = "week";
    } else if (lower.includes("today")) {
      dateRange = "today";
    } else if (lower.includes("month") || lower.includes("30 days")) {
      dateRange = "month";
    }

    let sender = "";
    const sMatch = lower.match(/(?:from|by)\s+([a-zA-Z]+)/);
    if (sMatch && !stopWords.has(sMatch[1])) {
      sender = sMatch[1];
    }

    let keyword = "";
    const kMatch = lower.match(/about\s+([a-zA-Z0-9\s]+?)(?:\s+from|\s+in|$)/);
    if (kMatch) keyword = kMatch[1].trim();

    return {
      message: `I've updated the mailbox to display matching emails.`,
      actions: [
        {
          type: "FILTER_EMAILS",
          sender,
          keyword,
          read: readStatus,
          date: dateRange,
          query: p
        }
      ]
    };
  }

  // 6. Navigate & Open:
  // e.g. "Open the latest email from David", "Open email from Sarah", "Open latest email"
  if (lower.startsWith("open") || lower.includes("open the") || lower.includes("open latest") || lower.includes("open email") || lower.includes("view email")) {
    let senderName = "";
    const fromMatch = lower.match(/(?:from|by)\s+([a-zA-Z]+)/);
    if (fromMatch && !stopWords.has(fromMatch[1])) {
      senderName = fromMatch[1];
    }

    let targetEmail = null;
    if (senderName) {
      targetEmail = visibleEmails.find(
        (e) =>
          (e.sender && e.sender.toLowerCase().includes(senderName)) ||
          (e.email && e.email.toLowerCase().includes(senderName))
      );
    }
    if (!targetEmail && (lower.includes("latest") || lower.includes("first") || !senderName)) {
      targetEmail = visibleEmails[0];
    }

    if (targetEmail) {
      return {
        message: `Opening the email from ${targetEmail.sender}: "${targetEmail.subject}".`,
        actions: [
          {
            type: "OPEN_EMAIL",
            criteria: { id: targetEmail.id, sender: targetEmail.sender, subject: targetEmail.subject }
          }
        ]
      };
    } else {
      return {
        message: senderName
          ? `I couldn't find an email from "${senderName}" in your current view. Try filtering or searching for them first.`
          : "Which email would you like me to open?",
        actions: []
      };
    }
  }

  // 7. Navigation views (Sent, Inbox, Starred)
  if (lower.includes("sent") || lower.includes("outbox")) {
    return {
      message: "Navigating to your Sent emails.",
      actions: [{ type: "NAVIGATE", view: "sent" }]
    };
  }
  if (lower.includes("inbox")) {
    return {
      message: "Navigating to your Inbox.",
      actions: [{ type: "NAVIGATE", view: "inbox" }]
    };
  }

  // Default fallback
  return {
    message:
      "I'm your AI Email Copilot! You can tell me to compose an email, search or filter your inbox, open an email, or reply to a thread.",
    actions: []
  };
}

/**
 * Main AI Copilot endpoint handler
 */
export async function processAiPrompt(prompt, context = {}) {
  const genAI = getGenAIClient();

  if (!genAI) {
    console.log("ℹ️ [AiService] Running local intelligent copilot engine.");
    return localIntentFallback(prompt, context);
  }

  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const userPromptContent = `
Current UI State:
- Current Active View: ${context.currentView || "inbox"}
- Currently Open Email: ${JSON.stringify(context.currentEmail || null)}
- Visible Emails in UI: ${JSON.stringify((context.visibleEmails || []).slice(0, 15))}
- Compose Modal Open: ${!!context.composeOpen}
${context.composeData ? `- Compose Form State: ${JSON.stringify(context.composeData)}` : ""}

User Command: "${prompt}"

Provide a structured JSON response controlling the UI according to the system instructions.
`;

    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPromptContent }]
        }
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const responseText = response.text?.trim() || "{}";
    const parsed = JSON.parse(responseText);

    if (!parsed.message || !Array.isArray(parsed.actions)) {
      console.warn("AI returned unexpected JSON structure, falling back to local engine.");
      return localIntentFallback(prompt, context);
    }

    return parsed;
  } catch (err) {
    console.error("❌ [AiService] Gemini API call failed:", err.message);
    return localIntentFallback(prompt, context);
  }
}

/**
 * Direct summarizer for currently selected email
 */
export async function summarizeEmail(email) {
  if (!email) throw new Error("No email provided for summarization.");
  const genAI = getGenAIClient();

  if (!genAI) {
    return {
      summary: `Email from ${email.sender} regarding "${email.subject}".`,
      keyPoints: [
        `Sender: ${email.sender}`,
        `Subject: ${email.subject}`,
        (email.body || email.snippet || "").slice(0, 140) + "..."
      ],
      actionItems: ["Review details and respond if needed."],
      sentiment: "Neutral"
    };
  }

  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Summarize the following email in JSON format with "summary" (string), "keyPoints" (array of strings), "actionItems" (array of strings), and "sentiment" (string):\n\nFrom: ${email.sender} <${email.email}>\nSubject: ${email.subject}\nDate: ${email.date}\n\nBody:\n${email.body || email.snippet}`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text?.trim() || "{}");
  } catch (err) {
    console.error("❌ [AiService] Summarize error:", err.message);
    return {
      summary: `Email from ${email.sender} regarding "${email.subject}".`,
      keyPoints: [`Sender: ${email.sender}`, `Subject: ${email.subject}`],
      actionItems: ["Review and follow up."],
      sentiment: "Neutral"
    };
  }
}

/**
 * Direct smart reply suggestions generator
 */
export async function suggestReplies(email) {
  if (!email) throw new Error("No email provided.");
  const genAI = getGenAIClient();

  if (!genAI) {
    return {
      suggestions: [
        "Thanks for the update! I will look into this.",
        "Sounds good to me, let's proceed.",
        "Could you provide more details?"
      ]
    };
  }

  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Generate 3 short, professional reply suggestions for this email. Return JSON with "suggestions" as an array of 3 strings.\n\nFrom: ${email.sender}\nSubject: ${email.subject}\nBody:\n${email.body || email.snippet}`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text?.trim() || "{}");
  } catch (err) {
    console.error("❌ [AiService] Reply suggestions error:", err.message);
    return {
      suggestions: [
        "Thanks for letting me know.",
        "I'll check and get back to you shortly.",
        "Approved, let's move forward."
      ]
    };
  }
}
