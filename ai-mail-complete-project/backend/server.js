import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import gmailRoutes from "./routes/gmailRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import {
  getAuthUrl,
  handleOAuthCallback,
  hasCredentialsConfigured,
  isAuthenticated,
  startBackgroundSync
} from "./services/gmailService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
const frontendPath = path.resolve(__dirname, "../frontend");
app.use(express.static(frontendPath));

// API routes
app.use("/api/gmail", gmailRoutes);
app.use("/api/ai", aiRoutes);

// Google OAuth Initiation
app.get("/auth/google", (req, res) => {
  try {
    const url = getAuthUrl();
    res.redirect(url);
  } catch (err) {
    console.error("Auth redirect error:", err.message);
    res.redirect("/?auth_error=" + encodeURIComponent(err.message));
  }
});

// Google OAuth Callback
app.get("/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      throw new Error("No authorization code provided in callback.");
    }
    await handleOAuthCallback(code);
    console.log("✅ Google OAuth authentication successful!");
    res.redirect("/?connected=1");
  } catch (err) {
    console.error("OAuth callback failure:", err.message);
    res.redirect("/?connected=0&error=" + encodeURIComponent(err.message));
  }
});

// System Status & Health Check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AI Mail API",
    googleOAuthConfigured: hasCredentialsConfigured(),
    gmailAuthenticated: isAuthenticated(),
    geminiConfigured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your_gemini_api_key_here")
  });
});

// Fallback SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Start background sync listener
startBackgroundSync(20000);

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 AI Mail Server running at http://localhost:${PORT}`);
  console.log(`📁 Serving frontend from: ${frontendPath}`);
  console.log(`🔐 Google OAuth Configured: ${hasCredentialsConfigured()}`);
  console.log(`🤖 Gemini AI Configured: ${!!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your_gemini_api_key_here")}`);
  console.log(`========================================`);
});
