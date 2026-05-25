const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://omegatech-api.dixonomega.tech/api/tools/tempmail";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Generate a new temp email
app.get("/api/generate", async (req, res) => {
  try {
    const domain = req.query.domain || "omega.tech";
    const url = `${API_BASE}?action=generate&domain=${encodeURIComponent(domain)}`;
    console.log("[GENERATE]", url);
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    const data = await response.json();
    console.log("[GENERATE RESPONSE]", JSON.stringify(data));
    res.json(data);
  } catch (err) {
    console.error("[GENERATE ERROR]", err.message);
    res.status(500).json({ success: false, message: "Failed to generate email." });
  }
});

// Fetch inbox — tries multiple action names the API may use
app.get("/api/inbox", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ success: false, message: "Email is required." });

  // Try these action names in order until one returns messages
  const actions = ["inbox", "messages", "getInbox", "check", "read"];

  for (const action of actions) {
    try {
      const url = `${API_BASE}?action=${action}&email=${encodeURIComponent(email)}`;
      console.log(`[INBOX TRY] ${url}`);
      const response = await fetch(url, { headers: { "Accept": "application/json" } });
      const data = await response.json();
      console.log(`[INBOX ${action}]`, JSON.stringify(data).substring(0, 300));

      // Accept if it has success:true AND some result content
      if (data.success) {
        // Normalize the messages array from ANY possible shape
        const msgs = extractMessages(data);
        return res.json({
          success: true,
          action_used: action,
          raw: data,
          messages: msgs
        });
      }
    } catch (err) {
      console.error(`[INBOX ${action} ERROR]`, err.message);
    }
  }

  // All actions failed — return empty but with raw for debugging
  res.json({ success: true, messages: [], action_used: "none", raw: null });
});

// Raw passthrough — lets frontend call ANY action directly for debugging
app.get("/api/raw", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const url = `${API_BASE}?${qs}`;
    console.log("[RAW]", url);
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Deep-search the API response for a messages array,
 * no matter what key it's stored under.
 */
function extractMessages(data) {
  // Direct arrays
  if (Array.isArray(data.result))   return data.result;
  if (Array.isArray(data.messages)) return data.messages;
  if (Array.isArray(data.inbox))    return data.inbox;
  if (Array.isArray(data.data))     return data.data;
  if (Array.isArray(data.emails))   return data.emails;
  if (Array.isArray(data.mail))     return data.mail;

  // Nested under result object
  if (data.result && typeof data.result === "object") {
    const r = data.result;
    if (Array.isArray(r.messages)) return r.messages;
    if (Array.isArray(r.inbox))    return r.inbox;
    if (Array.isArray(r.emails))   return r.emails;
    if (Array.isArray(r.mail))     return r.mail;
    if (Array.isArray(r.data))     return r.data;

    // Single message object wrapped in result
    if (r.subject || r.from || r.body) return [r];
  }

  // Fallback: collect any array found in top-level keys
  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key]) && data[key].length > 0) {
      const first = data[key][0];
      if (first && typeof first === "object" && (first.subject || first.from || first.body || first.text)) {
        return data[key];
      }
    }
  }

  return [];
}

// Fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ KingBadboi TempMail running on port ${PORT}`);
});
