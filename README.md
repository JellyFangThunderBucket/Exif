# Memory Cartographer

Memory Cartographer is a private, local-first observatory for exploring personal artifacts as evidence-linked maps, constellations, reconstructions, and patterns. This repository previously contained Metadata Lab; the current branch implements a coherent Memory Cartographer MVP on the existing dependency-free Node/Express static-app foundation.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000> unless `PORT` is set.

## What works in the MVP

- Fictional demo vault loaded on startup.
- Create and unlock an encrypted local vault.
- Import real local files with supported filename families: JPEG, PNG, HEIC, WebP, MP3, M4A, WAV, TXT, Markdown, PDF, ICS, MBOX, EML, CSV, JSON, and Spotify-style JSON exports.
- SHA-256 duplicate detection and provenance records.
- Deterministic local entity/theme/emotion extraction fallback.
- Evidence-linked reflective search with an inspectable query plan.
- Offline schematic life map, relationship constellation, reconstruction workspace, pattern library, artifact explorer, export controls, and privacy settings.

## Vault storage

Encrypted vaults are stored by default at:

```text
.memory-vaults/<vault-name>/vault.mc
```

Set `MEMORY_VAULT_ROOT` to move this location. The MVP stores originals and derived annotations together in an authenticated encrypted JSON vault payload.

## Fully local operations

All demo loading, vault encryption/decryption, imports, checksums, deterministic extraction, search, pattern detection, reconstruction, and export are local. There are no accounts, telemetry, remote scripts, ads, analytics, or external AI calls.

## Security limitations

The MVP uses Node `scrypt` and AES-256-GCM. The product target remains Argon2id plus XChaCha20-Poly1305 or audited AES-GCM in Rust/Tauri. See `threat_model.md` for what is and is not protected.

## Documentation

- Architecture: `docs/architecture.md`
- Data schema: `docs/data_schema.md`
- Importer interface: `docs/importers.md`
- Privacy principles: `docs/privacy_principles.md`
- Threat model: `threat_model.md`
- Roadmap: `docs/roadmap.md`

## Checks

```bash
npm test
npm run build
```
