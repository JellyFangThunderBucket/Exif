# Metadata Lab

Metadata Lab is a private Windows XP-style web interface for running a safe, allowlisted subset of ExifTool against files you upload to your own machine or server.

> **Security warning:** do not expose Metadata Lab directly to the public internet. If you need remote access, put it behind authenticated HTTPS on a private network or VPN.

## Requirements

- Node.js 20 or newer
- ExifTool installed on the host or available in the container image
- A private machine/server you control

## Launch locally

Copy and paste these commands from the repository root:

```bash
npm test
npm run build
npm start
```

Then open:

```text
http://localhost:3000
```

For development, this equivalent command also starts the server:

```bash
npm run dev
```

## Launch with Docker

Build and run the image:

```bash
docker build -t metadata-lab .
docker run --rm -p 3000:3000 --name metadata-lab metadata-lab
```

If you prefer Docker Compose:

```bash
docker compose -f deploy/docker-compose.yml up --build
```

Then open:

```text
http://localhost:3000
```

## Open from another device on the same private network

1. Start Metadata Lab on your server or desktop while listening on the private network interface:

```bash
HOST=0.0.0.0 npm start
```

2. Find that machine's private LAN IP address.

On macOS or Linux:

```bash
hostname -I
```

On Windows PowerShell:

```powershell
ipconfig
```

3. From your iPhone or another device connected to the same Wi-Fi/network, open the server address with port `3000`:

```text
http://YOUR_PRIVATE_IP:3000
```

Example:

```text
http://192.168.1.25:3000
```

If the page does not load, check the server firewall and confirm both devices are on the same private network.

## Install on an iPhone Home Screen

1. Open Metadata Lab in Safari on the iPhone.
2. Tap the Share button.
3. Tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.

The app includes a local web manifest so it can launch like a Home Screen utility while still running from your private server.

## Generate vs Copy vs Run

- **Generate Command** asks the backend to build the exact allowlisted ExifTool command preview for the current file and options. It does not run ExifTool.
- **Copy Command** copies the generated preview to your clipboard. It is disabled until you generate a command.
- **Run ExifTool** executes the allowlisted command on the server. Read-only presets inspect the upload; write/removal presets create a separate output copy and never overwrite the uploaded original.

## Safety model

- ExifTool is started with `spawn(..., { shell: false })`.
- ExifTool options and editable tags are restricted by allowlists in `server/exiftool.js`.
- Uploaded originals are stored in a temporary private directory.
- Write operations use a new generated output path instead of overwriting the uploaded original.
- Delete Temporary Files removes temporary uploads, generated output files, and browser session history after confirmation.

## Useful commands

Run tests:

```bash
npm test
```

Run the static build check:

```bash
npm run build
```

Start production mode:

```bash
npm start
```

## Metadata Explorer

After a successful read-only ExifTool run, Metadata Lab also opens **Metadata Explorer**. It is an additional view; the command preview, organized output, raw output, download area, and session history remain available.

Metadata Explorer uses a Windows XP Registry Editor / Device Manager style layout:

- The left pane lists metadata groups discovered in the actual ExifTool result, such as `File`, `EXIF`, `GPS`, `XMP`, `QuickTime`, `Composite`, or tool/vendor-specific groups.
- The right pane shows tags for the selected group with tag name, value, group, and source/type information.
- Use the search box to filter by group, tag, label, or value.
- Click a row to open a plain-English tag details dialog.
- Use **Show Terminal Command** to see the exact structured ExifTool command used for the explorer and what each option means.

Metadata groups are namespaces reported by ExifTool. They describe where ExifTool found or derived a tag; for example, EXIF camera fields, GPS location fields, XMP editor fields, QuickTime media fields, or Composite values derived by ExifTool.

## Metadata interpretation warning

Metadata can be missing, altered, incomplete, inaccurate, copied from another file, or written by software after capture. Interesting Findings are simple factual rules such as “GPS metadata is present” or “Software/editor field detected.” They are not proof of authenticity, identity, authorship, location, or manipulation.

## Phase 3 optional investigation utilities on Ubuntu

Install the optional command-line utilities with:

```bash
sudo apt-get update
sudo apt-get install -y exiftool mediainfo ffmpeg imagemagick binutils zbar-tools tesseract-ocr binwalk file
```

Optional utilities are detected at runtime in **Tools > Installed Utilities**. Metadata Lab does not crash when an optional utility is missing. The Node crypto hash workspace does not require an external hash program.

Workspace-to-command mapping:

- Metadata: `exiftool` with allowlisted read-only arguments.
- Media Information: `mediainfo --Output=JSON` and `ffprobe -print_format json -show_format -show_streams` when installed.
- Image Properties: `identify -verbose` when installed.
- Strings: `strings -n <allowed length>` with output and result caps.
- QR / Barcodes: `zbarimg --quiet` when installed.
- OCR: `tesseract <file> stdout -l <allowed language>` only after explicit user action.
- Frame Extraction: FFmpeg with validated timestamps and fixed argument arrays only.
- Binary Structure: `binwalk` signature scan only; recursive extraction and carving are disabled.
- Hashes: Node `crypto` SHA-256 and MD5.

Safety limits include maximum upload size, magic-byte file type verification, output caps, timeouts, generated-artifact limits, no archive extraction, no arbitrary command names, no arbitrary flags, private temporary directories, sanitized errors, and private-network deployment. OCR can be wrong, metadata can be absent or altered, strings may be misleading fragments, and binary signatures may be false positives.

## Stage 4 completion notes

Installed Utilities can be rechecked from **Tools > Installed Utilities**. The dialog uses `/api/tools?refresh=1` and shows installed/unavailable state, version text when the executable reports it, purpose, and install hints. The full Ubuntu command is:

```bash
sudo apt install -y libimage-exiftool-perl mediainfo ffmpeg imagemagick binutils zbar-tools tesseract-ocr binwalk file
```

Safe Investigation chooses tools from the uploaded file's detected MIME family. It always includes hashes, uses read-only utilities only when applicable and installed, skips unavailable tools with an explanation, and does not run OCR automatically. Cancellation kills the active allowlisted child process and preserves completed results.

Output limits include upload size limits, tool stdout/stderr caps, strings count caps, report size caps, generated-artifact size/count caps, and per-tool timeouts. Metadata, OCR, QR/barcode values, printable strings, media signatures, and binary signatures can be missing, altered, inaccurate, irrelevant, or misleading.
