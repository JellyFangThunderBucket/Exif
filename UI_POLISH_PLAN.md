# Metadata Lab XP UI polish plan

This file captures the next focused pass for the Windows XP-inspired interface without changing the working backend architecture.

## Keep intact

- ExifTool execution via `spawn(..., { shell: false })`
- Existing allowlists and temporary-path protections
- Non-overwriting write behavior
- Current upload, run, download, panic-delete, and PWA flows

## Highest-priority UI fixes

1. Turn the File, View, Tools, and Help labels into functional XP-style drop-down menus.
2. Rename the command-preview button so it does not imply that it has already copied anything.
3. Add a reliable clipboard fallback for browsers where `navigator.clipboard` is unavailable.
4. Add an XP-style confirmation dialog before Panic Delete.
5. Replace emoji with locally bundled, license-safe classic utility icons or simple CSS-drawn icons.
6. Preserve the compact Windows XP utility layout on iPhone rather than converting it into modern cards.
7. Add keyboard shortcuts and display them inside menu items.
8. Give destructive and write operations clearer amber/red visual treatment.

## High-priority hardening follow-up

1. Verify uploads by file signature instead of trusting only browser-provided MIME values.
2. Replace the minimal multipart parser with a bounded, well-tested streaming parser.
3. Return 404 for missing downloads and set an appropriate download content type.
4. Add confirmation and visible error handling for panic deletion.
5. Add tests for malformed multipart requests, clipboard-independent command generation, missing downloads, and expired files.

## Visual standard

The application should resemble a professional Windows XP metadata utility from 2003–2005, not a modern dashboard with XP colors. Use compact information density, Luna blue title bars, Tahoma-style typography, beveled controls, Explorer task panes, functional menus, and restrained animation.
