# 🧠 DoculabAI — The DOCX Copilot That Actually Respects Your Layout

[![Live Demo](https://img.shields.io/badge/🚀_Try_It_Live-doculabai.my.id-3b66ff?style=for-the-badge)](https://doculabai.my.id)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_AI-3.5-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

---

## 🔥 The Problem We All Know Too Well

Generative AIs are genuinely mind-blowing. ChatGPT, Claude, Gemini — they can write essays, debug code, explain quantum physics. But here's the thing nobody talks about:

**They absolutely cannot read a full document template and edit the text without nuking the entire layout.**

You know the drill. You've got a beautifully formatted `.docx` — perfect margins, a clean table, that one font you spent 20 minutes picking. You want the AI to change a paragraph. What happens?

- You copy-paste the text into a chat window.
- You write a 500-word prompt explaining exactly what to change.
- The AI gives you back plain text with zero formatting.
- You manually paste it back in and spend another 30 minutes fixing the margins, the bold, the spacing.

It's a massive, soul-draining hassle. And honestly? It shouldn't be.

---

## ✨ The Solution: Drop. Chat. Done.

**DoculabAI changes the game.** Here's the whole flow:

1. **Drop your `.docx`** — it renders instantly in the browser, pixel-perfect, exactly like it looks in Word.
2. **Chat with the AI** — tell it what you want. _"Make the intro more formal"_, _"fix the table formatting"_, _"rewrite paragraph two with better flow"_.
3. **Approve & go** — the AI proposes a plan, you hit approve, and the text swaps in seamlessly.

The kicker? **Your layout stays 100% intact.** Tables stay put. Images stay anchored. Fonts stay exactly where they were. Only the content changes. No more fighting with margins. No more manual reformatting. Just clean, surgical edits.

---

## 🎯 Why This Is a Lifesaver

### For Students (yes, we're looking at you, "laprak" warriors)

Lab reports. Assignments. Repetitive templates that all follow the same boring structure. You know the pain of typing the same intro paragraph for the 47th time, or manually adjusting a table that's _just_ slightly off.

With DoculabAI, you drop in your template, tell the AI what to fill in, and it handles the rest. The formatting stays locked. You just provide the brainpower for the content.

### The Brain Power Factor 🧠

Because this thing runs on **Google Gemini**, the AI knows practically everything. So it's not just a text-swapper — it's a full-on research assistant that lives inside your document.

Stuck on a concept? Ask it to explain. Need data for a section? Ask it to research. Have a problem to solve? Ask it to work through it. The answers get **injected directly into your document** — without ever leaving the page or opening a new tab.

It's like having a genius co-author who never messes up your formatting.

---

## ⚙️ The Tech Flex (Engineering Highlights)

### ⚡ Lightning-Fast In-Memory Processing

Here's the part that makes this thing feel like magic under the hood.

Our backend (FastAPI) handles everything **in-memory** using `io.BytesIO`. Translation: **we never save a physical file to disk.** Not once.

The flow goes like this:

- You upload a `.docx` → it's read straight into **RAM** as a byte stream.
- The parser (`python-docx`) breaks it into segments — paragraphs, tables, images, headers, footers — all living in memory.
- The AI analyzes those segments, proposes edits, and the result flows back to the frontend.
- **Done.** The original file is never stored permanently anywhere.

Why does this matter? Because it means:

- 🚀 **Instant processing** — no disk I/O bottleneck, no waiting on slow storage.
- 🔒 **Safely ephemeral** — nothing lingers on the server, which is perfect for a serverless environment like Vercel.
- 💸 **Cheap to run** — serverless only bills you when you're actually using it, and we don't pay for storage we don't need.
- 📈 **Scales automatically** — 10 users or 10,000, Vercel just spins up more instances. No file-sync headaches between servers.

### 📱 Seamless Hybrid Vibe

Reading documents on a phone usually sucks. Text is tiny, tables overflow, you're zooming and panning like a maniac. We fixed that.

DoculabAI has a **smart CSS scaling system** plus a slick **View Mode toggle**:

- **Desktop View** — the document renders at its true A4 size, scrollable and crisp. Perfect for when you're at a laptop.
- **Mobile View** — the entire canvas gets **proportionally scaled down** to fit your screen. The layout stays identical to desktop — same spacing, same tables, same everything — just smaller. No broken formatting, no eye strain. 😌

And the cherry on top: a **Floating Action Button (FAB)** for the AI chat that appears on smaller screens. Reading on your phone and suddenly want to edit? Tap the button, the AI drawer slides up, and you're chatting. No scrolling to the top, no hunting for controls. **Everything's right at your thumb.** 👆

---

## 🏗️ Project Structure

```
.
├── frontend/                  # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/        # UI components (DocumentViewer, ChatPanel, etc.)
│   │   ├── utils/             # docxProcessor, API client, Supabase
│   │   ├── types.ts           # Shared types
│   │   ├── App.tsx            # Main app
│   │   └── index.css          # Theme & styling
│   ├── api/                   # Serverless API entry (Vercel)
│   ├── vercel.json            # Vercel config
│   └── package.json
│
├── backend/                   # FastAPI + Gemini AI
│   ├── app/
│   │   ├── api/               # Endpoints (upload, plan, chat)
│   │   ├── services/          # Parser, editor, AI planner, exporter
│   │   ├── models/            # Pydantic models
│   │   ├── utils/             # API helpers & responses

│   │   ├── config.py          # Settings & env config
│   │   └── main.py            # App entry
│   ├── tests/                 # Unit tests
│   └── requirements.txt
│
└── README.md                  # You're reading this 😄
```

---

## 🚀 How to Run This Locally

Wanna tinker with it on your own machine? Easy. Here's the whole deal:

### Prerequisites

- **Node.js** 18+ (for the frontend)
- **Python** 3.10+ (for the backend)
- **Gemini API Key** — it's free, grab one at [Google AI Studio](https://aistudio.google.com/apikey)

### Step 1: Clone the Repo

```bash
git clone https://github.com/battmann888/doculabai-web.git
cd doculabai-web
```

### Step 2: Set Up the Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt

# Set up env
cp .env.example .env
# Edit .env and drop in your GEMINI_API_KEY

# Fire up the server
uvicorn app.main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`. Health check: `http://localhost:8000/api/health`.

### Step 3: Set Up the Frontend

```bash
cd frontend
npm install

# Optional env setup (for auth & API URL)
cp .env.example .env

# Fire up the dev server
npm run dev
```

Frontend runs at `http://localhost:5173`. Open it up, drop a `.docx`, and start chatting with the AI! 🎉

### Step 4: (Optional) Set Up Supabase

Create an account at [Supabase](https://supabase.com), spin up a project, and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env`. Without this, login & history features stay off — but the core upload + AI edit flow works just fine.

---

## 🧪 Testing

```bash
cd backend
pytest
```

---

## 🛠️ Tech Stack

| Layer              | Technology                           | Why It's Here                                           |
| ------------------ | ------------------------------------ | ------------------------------------------------------- |
| **Frontend**       | React 19 + TypeScript + Vite         | Fast, type-safe, killer dev experience                  |
| **DOCX Rendering** | `docx-preview` + `mammoth` + `jszip` | High-fidelity DOCX rendering right in the browser       |
| **Backend**        | FastAPI + Uvicorn                    | Lightweight, async, free auto-docs (Swagger)            |
| **AI**             | Google Gemini (via `google-genai`)   | Smart model, simple API, perfect for parsing & planning |
| **Deploy**         | Vercel (Serverless)                  | Auto-deploy from GitHub, scales itself, free for hobby  |

---

## 📜 License

MIT — use it, modify it, share it. Just don't forget to give credit. 😉

---

_Built with 🔥, 🎧, and way too many late-night sessions._
