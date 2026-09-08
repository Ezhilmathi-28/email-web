import express from "express";
import { processAiPrompt, summarizeEmail, suggestReplies } from "../services/aiService.js";

const router = express.Router();

router.post("/copilot", async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }
    const result = await processAiPrompt(prompt, context || {});
    res.json(result);
  } catch (err) {
    console.error("AI Copilot Error:", err);
    res.status(500).json({ error: err.message || "Failed to process AI command." });
  }
});

router.post("/summarize", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email object is required." });
    }
    const summary = await summarizeEmail(email);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to summarize email." });
  }
});

router.post("/suggest-replies", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email object is required." });
    }
    const suggestions = await suggestReplies(email);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to generate reply suggestions." });
  }
});

export default router;
