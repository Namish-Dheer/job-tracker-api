const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

// 📧 Gmail OAuth setup
const gmailOAuth = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET
);

gmailOAuth.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN
});

const gmail = google.gmail({
  version: "v1",
  auth: gmailOAuth
});

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || "Sheet1";
const API_TOKEN = process.env.API_TOKEN;

// 📊 Google Sheets setup
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// 🧠 Helper
function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// 🔹 Health route
app.get("/", (_req, res) => {
  res.json({ ok: true, message: "Job tracker API is running" });
});

// 📊 Add application to sheet
app.post("/applications", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const {
      company,
      role,
      recruiter = "",
      resume_used,
      applied_date,
      status = "Applied",
    } = req.body;

    if (!company || !role || !resume_used || !applied_date) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const f1 = addDays(applied_date, 2);
    const f2 = addDays(f1, 3);
    const f3 = addDays(f2, 5);
    const f4 = addDays(f3, 7);

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:J`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          company,
          role,
          recruiter,
          resume_used,
          applied_date,
          f1,
          f2,
          f3,
          f4,
          status,
        ]],
      },
    });

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📬 Get unread emails
app.get("/unread", async (req, res) => {
  try {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
      maxResults: 5
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (let msg of messages) {
      const data = await gmail.users.messages.get({
        userId: "me",
        id: msg.id
      });

      const headers = data.data.payload.headers;

      const subject =
        headers.find(h => h.name === "Subject")?.value || "No Subject";

      const from =
        headers.find(h => h.name === "From")?.value || "Unknown";

      emails.push({
        id: msg.id,
        subject,
        from,
        snippet: data.data.snippet
      });
    }

    res.json({
      success: true,
      count: emails.length,
      emails
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 📥 Get full inbox (read + unread)
app.get("/inbox", async (req, res) => {
  try {
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 10
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (let msg of messages) {
      const data = await gmail.users.messages.get({
        userId: "me",
        id: msg.id
      });

      const headers = data.data.payload.headers;

      const subject =
        headers.find(h => h.name === "Subject")?.value || "No Subject";

      const from =
        headers.find(h => h.name === "From")?.value || "Unknown";

      emails.push({
        id: msg.id,
        subject,
        from,
        snippet: data.data.snippet
      });
    }

    res.json({
      success: true,
      emails
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✉️ Send email
app.post("/send-email", async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing fields"
      });
    }

    const email = [
      `To: ${to}`,
      "Content-Type: text/plain; charset=utf-8",
      `Subject: ${subject}`,
      "",
      message,
    ].join("\n");

    const encoded = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encoded }
    });

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔍 Search emails
app.get("/search", async (req, res) => {
  try {
    const { query } = req.query;

    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 5
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (let msg of messages) {
      const data = await gmail.users.messages.get({
        userId: "me",
        id: msg.id
      });

      const headers = data.data.payload.headers;

      const subject =
        headers.find(h => h.name === "Subject")?.value || "No Subject";

      const from =
        headers.find(h => h.name === "From")?.value || "Unknown";

      emails.push({
        id: msg.id,
        subject,
        from,
        snippet: data.data.snippet
      });
    }

    res.json({ success: true, emails });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ↩️ Reply using messageId
app.post("/reply", async (req, res) => {
  try {
    const { messageId, replyText } = req.body;

    const message = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Message-ID"]
    });

    const headers = message.data.payload.headers;

    const subject = headers.find(h => h.name === "Subject")?.value || "";
    const from = headers.find(h => h.name === "From")?.value || "";
    const messageIdHeader = headers.find(h => h.name === "Message-ID")?.value || "";

    const threadId = message.data.threadId;

    const email = [
      `To: ${from}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${messageIdHeader}`,
      `References: ${messageIdHeader}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      replyText,
    ].join("\n");

    const encoded = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encoded,
        threadId
      }
    });

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🤖 Reply to latest email
app.post("/reply-latest", async (req, res) => {
  try {
    const { replyText } = req.body;

    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 1
    });

    const messageId = list.data.messages?.[0]?.id;

    const message = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Message-ID"]
    });

    const headers = message.data.payload.headers;

    const subject = headers.find(h => h.name === "Subject")?.value || "";
    const from = headers.find(h => h.name === "From")?.value || "";
    const messageIdHeader = headers.find(h => h.name === "Message-ID")?.value || "";

    const threadId = message.data.threadId;

    const email = [
      `To: ${from}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${messageIdHeader}`,
      `References: ${messageIdHeader}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      replyText,
    ].join("\n");

    const encoded = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encoded,
        threadId
      }
    });

    res.json({
      success: true,
      message: "Replied to latest email"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});