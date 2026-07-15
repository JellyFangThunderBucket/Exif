# Roadmap

## MVP
- Encrypted vault creation/opening.
- Generic local imports for requested filename families.
- Demo vault with fictional multi-year artifacts.
- Deterministic search, pattern detection, map schematic, constellation graph, reconstruction, export.

## Version 1
- Tauri shell with Rust Argon2id and XChaCha20-Poly1305.
- SQLite plus FTS5 and a local vector index.
- MapLibre with offline tile packs.
- Rich adapter-specific parsers for EXIF, ICS, MBOX/EML, PDFs, Spotify JSON, and location CSV.
- User corrections, merge/hide identities, artifact-level deletion from encrypted storage.

## Later research
- Fully local RAG with configurable Ollama/llama.cpp.
- Whisper.cpp transcription pipeline.
- Advanced sequence mining and vocabulary drift detectors.
- Private multi-device vault migration with explicit user-controlled keys.
