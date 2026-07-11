# Metadata Lab agent notes

Architecture: React/Vite frontend in `src/`, Express backend in `server/`, static PWA assets in `public/`, deployment examples in `deploy/` and `nginx/`.

Security rules for future agents:
- Never execute ExifTool through `exec`, `execSync`, or `shell: true`.
- Add ExifTool arguments only through the allowlists in `server/exiftool.js`.
- Never trust client paths; use `path.basename` and `resolveTemp` for temporary files.
- Never overwrite uploaded originals. Write operations must create a new output path.
- Keep clear public errors and avoid leaking full server paths.
- Do not add analytics, external upload services, ads, or tracking.
