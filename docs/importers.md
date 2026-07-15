# Importer Interface

Each importer returns a normalized artifact and must:
1. Preserve the original unchanged inside the encrypted vault boundary.
2. Calculate SHA-256 checksum.
3. Extract safe metadata without executing shell commands.
4. Normalize timestamps while retaining conflicts and uncertainty.
5. Identify candidate people, places, projects, themes, and emotions with provenance.
6. Create searchable text and a local fallback embedding.
7. Record import session provenance.
8. Avoid duplicate imports by checksum.
9. Mark uncertain metadata for review.

Current MVP adapter: `generic-file-adapter` in `server/httpApp.js`.
