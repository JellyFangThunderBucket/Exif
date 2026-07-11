# Security follow-up

The MVP already avoids unrestricted shell execution and constrains temporary paths. Before exposing Metadata Lab beyond a private authenticated environment, address the following:

- Verify file signatures instead of trusting only the browser-provided MIME type.
- Use a bounded, well-tested multipart parser.
- Return a clean 404 for missing or expired downloads.
- Set appropriate download content types and security headers.
- Keep ExifTool and the host OS updated.
- Run the service as an unprivileged user behind authenticated HTTPS.
- Add tests for malformed multipart input, missing downloads, expiration behavior, and panic deletion failures.
