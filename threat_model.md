# Concise threat model

Metadata Lab protects against accidental public exposure and common file-handling bugs for a private self-hosted ExifTool UI.

## Assets
Uploaded originals, generated outputs, metadata displayed in the browser, and temporary server paths.

## Controls
- ExifTool is executed with `spawn` and an argument array, never with an unrestricted shell.
- User-selected flags are checked against an allowlist.
- Temporary directories and names are random; path access is resolved under one configured temp root.
- Originals are never overwritten; write operations use `-o` to create a new output file.
- Upload MIME type, file count, file size, and request rate are limited.
- Panic Delete and expiration cleanup remove temporary files.
- The default bind address is localhost; production exposure should use authenticated HTTPS reverse proxying.

## Remaining risks
ExifTool and parser vulnerabilities in media libraries remain possible, so keep Ubuntu packages updated and run the service as an unprivileged user. MIME detection is browser-provided in the MVP; add magic-byte verification before untrusted multi-user deployment.
