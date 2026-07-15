# Memory Cartographer Architecture

Memory Cartographer is implemented as a local-first Express-served desktop-ready web app. The MVP keeps all operations on localhost and uses a single encrypted vault file under `.memory-vaults/<vault>/vault.mc`.

## Components
- Static application shell: `public/index.html`, `public/app.js`, `public/style.css`.
- Local API: `server/httpApp.js` exposes `/api/memory/*` routes.
- Encrypted vault: JSON payload encrypted with AES-256-GCM and a passphrase-derived key.
- Import adapters: a generic adapter accepts text, markdown, PDF, ICS, email, CSV, JSON, image, and audio filenames, preserves checksums, and records provenance.
- Search and reasoning: deterministic term retrieval with an inspectable query plan and evidence IDs.
- Pattern engine: deterministic co-occurrence and travel-reflection detectors with confidence, evidence, limitations, and competing interpretations.

## Local AI abstraction
The MVP defines functional fallbacks for embeddings, entity extraction, summarization, question answering, and pattern explanation. Token vectors and deterministic extraction are used when no local model is installed. Ollama, llama.cpp, Whisper.cpp, and sentence-transformer adapters remain roadmap items and must be opt-in.
