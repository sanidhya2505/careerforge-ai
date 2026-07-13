require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const Anthropic = require("@anthropic-ai/sdk");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.static("public"));

// -- shared helper: one line to call Claude and get plain text back --
async function askClaude(prompt, maxTokens = 1500) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// 1) RESUME FORGE — parse PDF, score + rewrite against a target role
app.post("/api/analyze-resume", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Upload a PDF resume as field 'resume'." });
    const { text } = await pdfParse(req.file.buffer);
    const targetRole = req.body.targetRole || "Software Engineer";

    const prompt = `You are an ATS resume expert. Target role: "${targetRole}".
Resume text:
"""${text}"""
Return strict JSON only: {"ats_score": number 0-100, "missing_keywords": string[], "rewritten_bullets": string[], "summary": string}`;

    const raw = await askClaude(prompt, 1800);
    const json = JSON.parse(raw.replace(/```json|```/g, "").trim());
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Optional: turn the rewritten bullets into a downloadable .docx (reuses docx package, no custom rendering logic)
app.post("/api/export-resume-docx", async (req, res) => {
  try {
    const { name = "Candidate", bullets = [] } = req.body;
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: name, bold: true, size: 32 })] }),
          ...bullets.map((b) => new Paragraph({ text: `• ${b}` })),
        ],
      }],
    });
    const buffer = await Packer.toBuffer(doc);
    res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": "attachment; filename=resume.docx" }).send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2) COVER LETTER ENGINE
app.post("/api/cover-letter", async (req, res) => {
  try {
    const { resumeText, jobDescription, company } = req.body;
    if (!resumeText || !jobDescription) return res.status(400).json({ error: "resumeText and jobDescription required." });
    const prompt = `Write a concise, specific (not generic) cover letter for ${company || "the company"}.
Resume: """${resumeText}"""
Job description: """${jobDescription}"""
Return plain text only, under 300 words.`;
    res.json({ coverLetter: await askClaude(prompt, 800) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3) LINKEDIN AUTOPILOT — content calendar
app.post("/api/linkedin-content", async (req, res) => {
  try {
    const { resumeText, days = 10 } = req.body;
    const prompt = `Based on this background: """${resumeText}"""
Generate a ${days}-day LinkedIn "building in public" post calendar.
Return strict JSON only: {"posts": [{"day": number, "topic": string, "draft": string}]}`;
    const raw = await askClaude(prompt, 2000);
    res.json(JSON.parse(raw.replace(/```json|```/g, "").trim()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CareerForge AI running on port ${PORT}`));
