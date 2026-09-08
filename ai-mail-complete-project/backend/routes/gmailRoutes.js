import express from "express";
import {
  getAuthUrl,
  isAuthenticated,
  isConfigured,
  hasCredentialsConfigured,
  getProfile,
  listMessages,
  searchMessages,
  getMessage,
  sendEmail,
  sendReply,
  toggleStar,
  toggleRead,
  trashMessage,
  disconnect,
  mailEvents
} from "../services/gmailService.js";

const router = express.Router();

router.get("/auth-url", (req, res) => {
  try {
    res.json({ url: getAuthUrl(), configured: isConfigured() });
  } catch (err) {
    res.status(500).json({ error: err.message, configured: hasCredentialsConfigured() });
  }
});

router.get("/auth-status", async (req, res) => {
  const configured = hasCredentialsConfigured();
  if (!isAuthenticated()) {
    return res.json({ authenticated: false, configured });
  }
  try {
    const profile = await getProfile();
    res.json({
      authenticated: true,
      configured: true,
      email: profile.data.emailAddress,
      messagesTotal: profile.data.messagesTotal,
      threadsTotal: profile.data.threadsTotal
    });
  } catch (err) {
    console.warn("Auth status check warning:", err.message);
    res.json({ authenticated: false, configured, error: err.message });
  }
});

router.get("/inbox", async (req, res) => {
  try {
    const emails = await listMessages("INBOX", 30);
    res.json(emails);
  } catch (err) {
    console.error("Fetch inbox error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/sent", async (req, res) => {
  try {
    const emails = await listMessages("SENT", 30);
    res.json(emails);
  } catch (err) {
    console.error("Fetch sent error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json([]);
    const emails = await searchMessages(q, 30);
    res.json(emails);
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/email/:id", async (req, res) => {
  try {
    const email = await getMessage(req.params.id);
    res.json(email);
  } catch (err) {
    console.error("Get email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/send", async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    const r = await sendEmail({ to, subject, body });
    res.json({ success: true, id: r.data.id });
  } catch (err) {
    console.error("Send email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/reply", async (req, res) => {
  try {
    const { to, subject, body, threadId, messageId } = req.body;
    const r = await sendReply({ to, subject, body, threadId, messageId });
    res.json({ success: true, id: r.data.id });
  } catch (err) {
    console.error("Reply error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/star/:id", async (req, res) => {
  try {
    const { star } = req.body;
    await toggleStar(req.params.id, Boolean(star));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/read/:id", async (req, res) => {
  try {
    const { unread } = req.body;
    await toggleRead(req.params.id, !unread);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/email/:id", async (req, res) => {
  try {
    await trashMessage(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/disconnect", (req, res) => {
  disconnect();
  res.json({ success: true });
});

/**
 * Real-Time Sync Stream (Server-Sent Events)
 * Sends updates whenever a new email arrives or state changes.
 */
router.get("/sync-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: "CONNECTED", message: "Real-time sync stream connected" })}\n\n`);

  const onNewEmail = (email) => {
    res.write(`data: ${JSON.stringify({ type: "NEW_EMAIL", email })}\n\n`);
  };

  const onMailSent = (data) => {
    res.write(`data: ${JSON.stringify({ type: "MAIL_SENT", data })}\n\n`);
  };

  mailEvents.on("new_email", onNewEmail);
  mailEvents.on("mail_sent", onMailSent);

  // Heartbeat every 25 seconds
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    mailEvents.off("new_email", onNewEmail);
    mailEvents.off("mail_sent", onMailSent);
  });
});

/**
 * Webhook for Google Cloud Pub/Sub push notifications
 */
router.post("/webhook", (req, res) => {
  try {
    if (req.body?.message?.data) {
      const decoded = Buffer.from(req.body.message.data, "base64").toString("utf8");
      const eventData = JSON.parse(decoded);
      mailEvents.emit("pubsub_sync", eventData);
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(200).send("OK");
  }
});

export default router;
