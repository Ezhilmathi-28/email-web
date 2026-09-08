import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import { google } from "googleapis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const CREDENTIALS_PATH = path.join(ROOT, "credentials", "credentials.json");
const TOKEN_PATH = path.join(ROOT, "credentials", "token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify"
];

let oauth2Client = null;
let ready = false;
let configured = false;
let lastKnownMessageId = null;

// Event emitter for real-time mail notifications (SSE & Webhooks)
export const mailEvents = new EventEmitter();
mailEvents.setMaxListeners(100);

export function hasCredentialsConfigured() {
  return fs.existsSync(CREDENTIALS_PATH);
}

export function load() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    configured = false;
    ready = false;
    oauth2Client = null;
    return false;
  }

  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, "utf8");
    const d = JSON.parse(raw);
    const c = d.web || d.installed;
    if (!c || !c.client_id || !c.client_secret) {
      console.warn("⚠️ [GmailService] Invalid Google OAuth credentials JSON.");
      configured = false;
      return false;
    }

    const redirect =
      process.env.GOOGLE_REDIRECT_URI ||
      c.redirect_uris?.[0] ||
      "http://localhost:5000/auth/google/callback";

    oauth2Client = new google.auth.OAuth2(c.client_id, c.client_secret, redirect);
    configured = true;

    if (fs.existsSync(TOKEN_PATH)) {
      try {
        const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
        oauth2Client.setCredentials(tokenData);
        ready = true;
        console.log("✅ [GmailService] Restored saved Google OAuth session.");
      } catch (err) {
        console.warn("⚠️ [GmailService] Could not parse token.json:", err.message);
        ready = false;
      }
    }

    oauth2Client.on("tokens", (tokens) => {
      try {
        const oldTokens = fs.existsSync(TOKEN_PATH)
          ? JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"))
          : {};
        fs.writeFileSync(
          TOKEN_PATH,
          JSON.stringify({ ...oldTokens, ...tokens }, null, 2)
        );
        console.log("🔄 [GmailService] Google OAuth tokens refreshed.");
      } catch (err) {
        console.error("❌ [GmailService] Error persisting refreshed tokens:", err.message);
      }
    });

    return true;
  } catch (err) {
    console.error("❌ [GmailService] Failed to load credentials:", err.message);
    configured = false;
    ready = false;
    return false;
  }
}

// Initial load attempt
load();

export function getAuthUrl() {
  if (!oauth2Client) {
    if (!load()) {
      throw new Error(
        "Google OAuth credentials missing. Please place credentials.json in the credentials/ folder."
      );
    }
  }
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });
}

export async function handleOAuthCallback(code) {
  if (!oauth2Client) {
    load();
  }
  if (!oauth2Client) {
    throw new Error("OAuth client is not configured.");
  }
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  ready = true;
  return tokens;
}

export const isAuthenticated = () => ready && !!oauth2Client;
export const isConfigured = () => configured;

function api() {
  if (!ready || !oauth2Client) {
    throw new Error("Gmail is not connected. Please connect Gmail first.");
  }
  return google.gmail({ version: "v1", auth: oauth2Client });
}

const header = (headers, name) =>
  headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

function decode(v = "") {
  return Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function parseSender(fromHeader = "") {
  // Parses "John Carter <john@example.com>" into { name: "John Carter", email: "john@example.com" }
  const match = fromHeader.match(/^(.*?)(?:<(.+?)>)?$/);
  if (match) {
    let name = (match[1] || "").trim().replace(/^["']|["']$/g, "");
    let email = (match[2] || "").trim();
    if (!email && name.includes("@")) {
      email = name;
      name = email.split("@")[0];
    }
    return { name: name || email || "Unknown", email: email || name };
  }
  return { name: fromHeader || "Unknown", email: fromHeader || "" };
}

function extractBody(payload) {
  if (!payload) return { text: "", html: "" };

  let textBody = "";
  let htmlBody = "";

  function walk(part) {
    if (!part) return;

    if (part.mimeType === "text/plain" && part.body?.data) {
      textBody += decode(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      htmlBody += decode(part.body.data);
    } else if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        walk(subPart);
      }
    }
  }

  if (payload.body?.data) {
    if (payload.mimeType === "text/html") {
      htmlBody = decode(payload.body.data);
    } else {
      textBody = decode(payload.body.data);
    }
  } else if (payload.parts) {
    walk(payload);
  }

  return {
    text: textBody || payload.snippet || "",
    html: htmlBody || ""
  };
}

function mapMessage(m) {
  const p = m.payload || {};
  const hs = p.headers || [];
  const fromRaw = header(hs, "From");
  const senderInfo = parseSender(fromRaw);
  const bodies = extractBody(p);
  const labels = m.labelIds || [];

  return {
    id: m.id,
    threadId: m.threadId,
    sender: senderInfo.name,
    email: senderInfo.email,
    rawFrom: fromRaw,
    to: header(hs, "To"),
    subject: header(hs, "Subject") || "(No subject)",
    date: header(hs, "Date"),
    messageId: header(hs, "Message-ID"),
    snippet: m.snippet || "",
    body: bodies.text,
    htmlBody: bodies.html,
    unread: labels.includes("UNREAD"),
    star: labels.includes("STARRED"),
    labels: labels
  };
}

export async function getProfile() {
  return api().users.getProfile({ userId: "me" });
}

export async function listMessages(label = "INBOX", maxResults = 30) {
  const a = api();
  const labelIds = label === "ALL" ? [] : [label];
  const r = await a.users.messages.list({
    userId: "me",
    labelIds: labelIds.length > 0 ? labelIds : undefined,
    maxResults
  });

  const ms = r.data.messages || [];
  if (ms.length === 0) return [];

  const ds = await Promise.all(
    ms.map((m) =>
      a.users.messages.get({ userId: "me", id: m.id, format: "full" }).catch((err) => {
        console.warn(`Failed to fetch message ${m.id}:`, err.message);
        return null;
      })
    )
  );

  const parsed = ds.filter(Boolean).map((x) => mapMessage(x.data));
  if (parsed.length > 0 && label === "INBOX") {
    lastKnownMessageId = parsed[0].id;
  }
  return parsed;
}

export async function searchMessages(q, maxResults = 30) {
  const a = api();
  const r = await a.users.messages.list({
    userId: "me",
    q,
    maxResults
  });

  const ms = r.data.messages || [];
  if (ms.length === 0) return [];

  const ds = await Promise.all(
    ms.map((m) =>
      a.users.messages.get({ userId: "me", id: m.id, format: "full" }).catch(() => null)
    )
  );

  return ds.filter(Boolean).map((x) => mapMessage(x.data));
}

export async function getMessage(id) {
  const a = api();
  const r = await a.users.messages.get({ userId: "me", id, format: "full" });
  const m = mapMessage(r.data);

  // Auto-mark as read when opened
  if (m.unread) {
    try {
      await a.users.messages.modify({
        userId: "me",
        id,
        requestBody: { removeLabelIds: ["UNREAD"] }
      });
      m.unread = false;
    } catch (err) {
      console.warn("Could not mark email as read:", err.message);
    }
  }

  return m;
}

function enc(s) {
  return Buffer.from(s)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendEmail({ to, subject, body }) {
  if (!to || !subject || !body) {
    throw new Error("Recipient (To), Subject, and Body are required.");
  }
  const raw = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    body
  ].join("\r\n");

  const res = await api().users.messages.send({
    userId: "me",
    requestBody: { raw: enc(raw) }
  });

  // Notify listeners that an email was sent
  mailEvents.emit("mail_sent", { id: res.data.id, to, subject });
  return res;
}

export async function sendReply({ to, subject, body, threadId, messageId }) {
  if (!to || !subject || !body) {
    throw new Error("Recipient (To), Subject, and Body are required.");
  }
  const cleanSubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
  const raw = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(cleanSubject).toString("base64")}?=`,
    messageId ? `In-Reply-To: ${messageId}` : "",
    messageId ? `References: ${messageId}` : "",
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    body
  ]
    .filter(Boolean)
    .join("\r\n");

  const res = await api().users.messages.send({
    userId: "me",
    requestBody: {
      raw: enc(raw),
      ...(threadId ? { threadId } : {})
    }
  });

  mailEvents.emit("mail_sent", { id: res.data.id, to, subject: cleanSubject });
  return res;
}

export async function toggleStar(id, isStarred) {
  const a = api();
  const requestBody = isStarred
    ? { addLabelIds: ["STARRED"] }
    : { removeLabelIds: ["STARRED"] };
  return a.users.messages.modify({ userId: "me", id, requestBody });
}

export async function toggleRead(id, isRead) {
  const a = api();
  const requestBody = isRead
    ? { removeLabelIds: ["UNREAD"] }
    : { addLabelIds: ["UNREAD"] };
  return a.users.messages.modify({ userId: "me", id, requestBody });
}

export async function trashMessage(id) {
  const a = api();
  return a.users.messages.trash({ userId: "me", id });
}

export function disconnect() {
  ready = false;
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      fs.unlinkSync(TOKEN_PATH);
    } catch (err) {
      console.warn("Could not delete token file:", err.message);
    }
  }
  if (oauth2Client) {
    oauth2Client.revokeCredentials().catch(() => {});
  }
}

// Background sync checker
let syncInterval = null;
export function startBackgroundSync(intervalMs = 20000) {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    if (!ready || !oauth2Client) return;
    try {
      const a = api();
      const r = await a.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        maxResults: 5
      });
      const ms = r.data.messages || [];
      if (ms.length > 0) {
        const topId = ms[0].id;
        if (lastKnownMessageId && topId !== lastKnownMessageId) {
          // New message received!
          const full = await a.users.messages.get({
            userId: "me",
            id: topId,
            format: "full"
          });
          const parsed = mapMessage(full.data);
          lastKnownMessageId = topId;
          mailEvents.emit("new_email", parsed);
          console.log("📨 [Real-Time Sync] New email received:", parsed.subject);
        } else if (!lastKnownMessageId) {
          lastKnownMessageId = topId;
        }
      }
    } catch (err) {
      // Quietly continue on transient sync errors
    }
  }, intervalMs);
}
