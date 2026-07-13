# CareerForge AI — Code Explained (line by line)

Every capability is delegated to a battle-tested npm package. `server.js` only wires them together — this keeps the codebase under 100 lines while still being production-usable.

## Libraries used and why nothing was hand-rolled

| Package | Replaces hand-written code for... |
|---|---|
| `express` | HTTP server, routing |
| `multer` | Multipart file-upload parsing (resume PDF) |
| `pdf-parse` | Extracting raw text out of a PDF binary |
| `@anthropic-ai/sdk` | Talking to the Claude API (auth, retries, streaming) |
| `docx` | Generating a real `.docx` file from structured data |
| `cors` | Cross-origin headers |
| `helmet` | Standard security HTTP headers |
| `morgan` | Request logging |
| `express-rate-limit` | Per-IP throttling (abuse/cost protection) |
| `dotenv` | Loading `.env` secrets into `process.env` |

## `server.js` walkthrough

```js
require("dotenv").config();
```
Loads `ANTHROPIC_API_KEY` and `PORT` from a local `.env` file into `process.env`, so secrets never live in code.

```js
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
```
Creates the app, and configures file uploads to be held in memory (no temp files to clean up) with a 5MB cap — enough for any resume, small enough to block abuse.

```js
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";
```
One client instance, reused by every route. Model name lives in one constant so upgrading later is a one-line change.

```js
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.static("public"));
```
Five middleware lines give the app: security headers, cross-origin support, access logs, JSON body parsing, rate limiting (100 requests / 15 min / IP — protects your Anthropic API bill from abuse), and serving the demo frontend from `/public`.

```js
async function askClaude(prompt, maxTokens = 1500) {
  const res = await anthropic.messages.create({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] });
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
```
A single shared helper. Every route below builds a prompt string and calls this one function — so there is exactly one place in the whole app that talks to the AI API.

### Route 1 — `POST /api/analyze-resume`
1. `multer` middleware (`upload.single("resume")`) pulls the uploaded PDF into `req.file.buffer`.
2. `pdfParse(req.file.buffer)` turns the PDF binary into plain text in one call.
3. A prompt is built asking Claude to return **strict JSON** (ATS score, missing keywords, rewritten bullets, summary).
4. `JSON.parse(...)` turns the model's text reply into a real object the frontend can render directly.

### Route 2 — `POST /api/export-resume-docx`
Takes the JSON output from Route 1 and feeds it into the `docx` package's `Document`/`Paragraph`/`TextRun` builders — the same library used for the business-plan document — to stream back a real, downloadable `.docx`.

### Route 3 — `POST /api/cover-letter`
Takes `resumeText` + `jobDescription` from the request body, builds one prompt, returns plain text. No custom logic — the model does 100% of the writing.

### Route 4 — `POST /api/linkedin-content`
Same pattern as Route 1: prompt asks for strict JSON (`{"posts": [...]}`), which is parsed and returned directly — this becomes the "Building in Public" post calendar.

### Health & startup
```js
app.get("/api/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.listen(PORT, () => console.log(`CareerForge AI running on port ${PORT}`));
```
`/api/health` is what Docker, Render, and Nginx all ping to know the service is alive — used in three different places in the deployment files.

## Frontend (`public/index.html`)
No framework, no build step — plain HTML + one `<script>` block. Tailwind is pulled from a CDN for styling instead of a local build pipeline. The only JS logic is: on form submit, `fetch()` the API and print the JSON response. This keeps the demo to ~30 lines while the real logic stays server-side.
