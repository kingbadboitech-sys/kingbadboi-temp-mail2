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
    const url = `${API_BASE}?action=generate&domain=${domain}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Generate error:", err.message);
    res.status(500).json({ success: false, message: "Failed to generate email." });
  }
});

// Fetch inbox for a given email
app.get("/api/inbox", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });
    const url = `${API_BASE}?action=inbox&email=${encodeURIComponent(email)}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Inbox error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch inbox." });
  }
});

// Fallback: serve index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ KingBadboi TempMail server running on port ${PORT}`);
});
