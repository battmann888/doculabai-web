# Backend — DoculabAI

Python backend that powers the DoculabAI document editor.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate    # macOS/Linux
# venv\Scripts\activate     # Windows

pip install -r requirements.txt
```

## Configure

Copy `.env.example` to `.env` and set your API key:

```bash
cp .env.example .env
```

## Run

```bash
uvicorn main:app --reload --port 8001
```

The server runs at `http://localhost:8001`.

## Endpoints

| Method | Path             | Purpose                                      |
|--------|------------------|----------------------------------------------|
| GET    | `/api/health`    | Health check                                 |
| POST   | `/api/edit`      | Send a prompt + document text, receive edits |
| POST   | `/api/export`    | Convert edited HTML back to .docx            |

## How it works

1. The frontend uploads a `.docx` and renders it visually (layout preserved).
2. When the user sends a chat prompt, the document's text segments are sent here.
3. The AI analyzes the prompt and returns precise text replacements.
4. The frontend applies those replacements in the DOM — layout stays intact.
5. On download, the edited HTML is sent back here and converted to a real `.docx`.
