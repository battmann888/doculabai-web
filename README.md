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
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`.

## How it works

1. **Upload** — You drop a `.docx` file. The frontend renders it visually with full
   layout fidelity (tables, images, headings, fonts all preserved).
2. **Chat** — You type what you want changed.
3. **Apply** — The frontend swaps the text in the rendered document. Layout,
   positioning, tables, and images stay exactly where they were. By default,
   edits keep the document's original font.
