# DoculabAI

Edit any Word document with AI. Upload a `.docx`, then chat with the AI to
change text, tables, and more — the layout stays exactly the same.

## Structure

```
.
├── frontend/             # Frontend (React + Vite + TypeScript)
│   ├── public/assets/    # Static assets (logo.png)
│   ├── src/
│   │   ├── assets/       # Bundled assets (logo.png)
│   │   ├── components/   # UI components
│   │   ├── utils/        # Document processing, API client, download
│   │   ├── types.ts      # Shared types
│   │   ├── App.tsx       # Main app
│   │   ├── index.css     # DoculabAI theme
│   │   └── main.tsx      # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── backend/              # Backend (Python + FastAPI)
    ├── routers/          # API routes (edit, export, health)
    ├── services/         # AI service + docx builder
    ├── main.py           # FastAPI app
    └── requirements.txt  # Python dependencies
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`.

## Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # then edit .env and set your API_KEY
uvicorn main:app --reload --port 8001
```

Runs at `http://localhost:8001`.

## How it works

1. **Upload** — You drop a `.docx` file. The frontend renders it visually with full
   layout fidelity (tables, images, headings, fonts all preserved).
2. **Chat** — You type what you want changed. The document's text is sent to the
   Python backend, which asks the AI to produce precise text replacements.
3. **Apply** — The frontend swaps the text in the rendered document. Layout,
   positioning, tables, and images stay exactly where they were. By default,
   edits keep the document's original font.
4. **Download** — The edited document HTML is sent back to the backend and
   converted into a real `.docx` file you can download.
