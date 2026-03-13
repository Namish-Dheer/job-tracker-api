const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || "Sheet1";
const API_TOKEN = process.env.API_TOKEN;

const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  keyFile: credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "Job tracker API is running" });
});

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
        error: "company, role, resume_used, and applied_date are required",
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

    res.json({
      success: true,
      row_added: true,
      company,
      role,
      recruiter,
      resume_used,
      applied_date,
      first_followup_date: f1,
      second_followup_date: f2,
      third_followup_date: f3,
      fourth_followup_date: f4,
      status,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
