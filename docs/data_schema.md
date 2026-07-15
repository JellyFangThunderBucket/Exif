# Data Schema

Core entities in the portable vault JSON:
- `Artifact`: id, type, title, source, checksum, date, text, people, places, projects, themes, emotions, confidence, provenance.
- `Person`: id, label, aliases.
- `Place`: id, label, lat, lon, confidence, provenance.
- `Insight`: id, category, observation, evidence artifact IDs, confidence, method, reasoning, alternative.
- `ImportSession`: id, timestamp, filename, checksum.
- `UserCorrection`: correction records reserved for date, entity, place, theme, emotion, and sensitivity changes.

Derived fields must identify provenance: `direct_source_metadata`, `user_entered`, `deterministic_extraction`, `language_inference`, `media_suggestion`, or `caption_inference`.
