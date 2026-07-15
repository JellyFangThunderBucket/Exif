# Memory Cartographer Threat Model

## Protected
- Vault contents at rest when locked are encrypted with authenticated encryption.
- Plaintext encryption keys are not written to disk.
- Imports are checksummed, deduplicated, and stored under a local vault path.
- The app has no telemetry, no remote scripts, and no external AI calls.

## Not protected
- Data while the vault is unlocked in process memory.
- A compromised operating system, browser, Node runtime, or local administrator.
- Weak passphrases or shoulder surfing.
- Secure deletion on SSDs or journaled filesystems.

## MVP cryptography limitation
The MVP uses Node `scrypt` plus AES-256-GCM because the existing dependency-free Node project has no Argon2id library. Version 1 should move vault crypto into Tauri/Rust using Argon2id and XChaCha20-Poly1305 or audited AES-GCM.
