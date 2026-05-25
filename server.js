const express = require("express");
const fetch   = require("node-fetch");
const cors    = require("cors");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;
const MAILTM = "https://api.mail.tm";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ── 1. GET AVAILABLE DOMAINS ── */
app.get("/api/domains", async (req, res) => {
  try {
    const r    = await fetch(`${MAILTM}/domains?page=1`);
    const data = await r.json();
    // data["hydra:member"] is the array of domain objects
    const domains = (data["hydra:member"] || []).map(d => d.domain);
    res.json({ success: true, domains });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── 2. CREATE ACCOUNT (generate email) ── */
app.post("/api/generate", async (req, res) => {
  try {
    const { address, password } = req.body;
    const r    = await fetch(`${MAILTM}/accounts`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ address, password })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ success: false, message: data["hydra:description"] || "Failed to create account" });
    res.json({ success: true, id: data.id, address: data.address });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── 3. GET TOKEN (login) ── */
app.post("/api/token", async (req, res) => {
  try {
    const { address, password } = req.body;
    const r    = await fetch(`${MAILTM}/token`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ address, password })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ success: false, message: "Login failed" });
    res.json({ success: true, token: data.token });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── 4. GET INBOX ── */
app.get("/api/inbox", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: "Token required" });
    const r    = await fetch(`${MAILTM}/messages?page=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ success: false, message: "Failed to fetch inbox" });
    const messages = (data["hydra:member"] || []);
    res.json({ success: true, messages, total: data["hydra:totalItems"] || 0 });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── 5. GET SINGLE MESSAGE (full body) ── */
app.get("/api/message/:id", async (req, res) => {
  try {
    const { token } = req.query;
    const r    = await fetch(`${MAILTM}/messages/${req.params.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ success: false, message: "Failed to fetch message" });
    res.json({ success: true, message: data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* ── FALLBACK ── */
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`✅ KingBadboi TempMail on port ${PORT}`));
