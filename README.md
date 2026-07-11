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
- Panic Delete removes temporary uploads, generated output files, and browser session history after confirmation.

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
