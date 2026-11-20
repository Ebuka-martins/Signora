# Signora — Private Document Signing PWA

<p align="center">
  <strong>Sign PDF and Word documents beautifully — right from your browser.</strong><br/>
  No cloud uploads for PDFs. No subscriptions. No tracking. Just you, your document, and your signature.
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue" />
</p>

---

## What is Signora?

Signora is a **Progressive Web App** for electronically signing PDF and Microsoft Word documents. It runs entirely in the browser for PDFs — your file never leaves your device — and uses a small Node.js server only for the two things a browser genuinely can't do alone:

1. **Word → PDF conversion** (via LibreOffice), so signed Word documents preserve their original layout.
2. **User account management**, so multiple people can use the same deployment.

Everything else — drawing your signature, placing it on the document, embedding it into the PDF bytes, downloading the signed file — happens **locally, in your browser**.

You install it like a native app. You sign like you would on paper. Nothing gets uploaded that doesn't have to be.

---

## Table of Contents

- [Why Signora?](#why-signora)
- [Feature Overview](#feature-overview)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Using the App](#using-the-app)
- [API Reference](#api-reference)
- [PWA Installation & Offline Behaviour](#pwa-installation--offline-behaviour)
- [Docker Deployment](#docker-deployment)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [Roadmap Ideas](#roadmap-ideas)
- [Tech Stack & Credits](#tech-stack--credits)
- [License](#license)

---

## Why Signora?

Most e-signature tools ask you to upload sensitive documents to their servers, create an account on their platform, and pay a monthly fee just to sign a contract. Signora does the opposite:

| Concern | Signora's approach |
|---------|-------------------|
| **Privacy** | PDF signing happens entirely in your browser. No upload, no server storage. |
| **Cost** | Free, self-hosted, open source. You pay for nothing but the server you run it on. |
| **Simplicity** | No account required for the person *signing* — only the person *using* the app. |
| **Offline use** | Once installed, the app shell works offline. PDFs can be signed without internet. |
| **Multi-user** | A small sign-up system lets anyone you invite create their own account. |
| **Format fidelity** | PDFs are signed in-place. Word documents are converted with LibreOffice — the industry-standard converter — so the visual result matches the original. |

Signora is not trying to replace DocuSign for enterprises. It's for individuals, small teams, freelancers, and privacy-conscious users who need to sign a document *now* without handing it over to a third party.

---

## Feature Overview

### Document handling
- Upload **PDF**, **DOC**, or **DOCX** files (max 25 MB)
- Drag-and-drop or click-to-browse
- Inline rendering with page-by-page navigation
- Original content and formatting preserved as closely as technically possible

### Signature capture
- **Draw mode** — sign with finger, stylus, or mouse
- **Type mode** — type your name in one of four handwritten fonts
- Five pen colours, adjustable stroke width
- Four rendering styles (Natural, Bold, Fine, Ink)

### Signature placement
- Drag to move, corner handle to resize
- Curved arrow to rotate (0–360°)
- Red × to delete (or press `Delete` / `Backspace`)
- Place signatures on **multiple pages** — each survives page navigation
- Signature count badge in the toolbar shows the total

### Saving
- **PDF** — signed entirely in the browser with `pdf-lib`. The signed file downloads automatically.
- **Word** — converted to PDF via LibreOffice on the server, signed with `pdf-lib`, then downloaded. The output is a PDF because LibreOffice preserves Word layout faithfully only as a fixed-format document.

### Accounts & sessions
- Sign-up and sign-in with bcrypt-hashed passwords
- JWT session tokens (7-day expiry)
- Sign-out from the app header
- Every API endpoint that costs server resources is protected

### PWA & UX
- Installable on Android, iOS, tablets, and desktop
- Custom install banner
- Service Worker with offline caching for the app shell
- Responsive from 320 px phones to 4K desktops
- Dark mode with persistent preference
- Animated aurora background, glassmorphism header, gradient accents
- Accessible: keyboard shortcuts, focus states, ARIA labels, reduced-motion support

---

## How It Works

Signora uses **two different signing pipelines**, chosen automatically based on the file type you upload.

### Pipeline A — PDF (fully local)

```
┌────────────────┐ ┌──────────────────┐ ┌───────────────────┐
│ User uploads │───▶ │ PDF.js renders │───▶ │ User draws and │
│ a PDF │ │ page to canvas │ │ places signature │
└────────────────┘ └──────────────────┘ └───────────────────┘
│
▼
┌────────────────┐ ┌──────────────────┐ ┌───────────────────┐
│ Signed PDF │◀─── │ pdf-lib embeds │◀─── │ User clicks Save │
│ downloaded │ │ signature PNG │ │ │
└────────────────┘ └──────────────────┘ └───────────────────┘

```

**The PDF never touches the server.** It's loaded via `FileReader`, rendered by PDF.js, signed in-memory by pdf-lib, and downloaded as a Blob. Even if you disconnect from the internet, once the page has loaded you can still sign.

### Pipeline B — Word documents (server-assisted)

```
┌────────────────┐ ┌──────────────────┐ ┌───────────────────┐
│ User uploads │───▶ │ Mammoth.js │───▶ │ User draws and │
│ DOCX/DOC │ │ renders preview │ │ places signature │
└────────────────┘ └──────────────────┘ └───────────────────┘
│
▼
┌────────────────┐ ┌──────────────────┐ ┌───────────────────┐
│ Signed PDF │◀─── │ pdf-lib embeds │◀─── │ POST to │
│ downloaded │ │ signatures │ │ /api/sign-docx │
└────────────────┘ └──────────────────┘ └───────────────────┘
│
▼
┌───────────────────┐
│ LibreOffice │
│ converts to PDF │
└───────────────────┘
```

The output is **PDF**, not DOCX. This is a deliberate trade-off: LibreOffice preserves the visual layout of the original Word document — margins, fonts, tables, images, page breaks — but the result is a fixed-format PDF. Attempting to modify DOCX internals in the browser breaks formatting on almost every real document; the LibreOffice route is the only way to get *reliable* visual fidelity.


## Project Structure
```
signora/
│
├── assets/
│ ├── favicon/ ← browser tab and bookmark icons
│ │ ├── apple-touch-icon.png
│ │ ├── favicon-16x16.png
│ │ ├── favicon-32x32.png
│ │ └── favicon.ico
│ └── icons/ ← PWA home-screen icons
│ ├── android-chrome-192x192.png
│ └── android-chrome-512x512.png
│
├── server/
│ └── index.js ← Express server, auth, LibreOffice bridge
│
├── src/
│ ├── index.html ← main application shell
│ ├── login.html ← sign-in page
│ ├── signup.html ← account creation page
│ ├── manifest.json ← PWA manifest
│ ├── sw.js ← service worker (offline caching)
│ ├── css/
│ │ └── style.css ← all app styles (tokens, components, responsive)
│ └── js/
│ ├── app.js ← main controller (state, wiring, save flow)
│ ├── pdf-handler.js ← PDF rendering + signature embedding
│ ├── docx-handler.js ← Word preview + server signing call
│ └── signature.js ← signature pad, styles, typed signatures
│
├── tmp/ ← runtime temp files (auto-created, git-ignored)
├── package.json
├── package-lock.json
├── .gitignore
├── Dockerfile
└── README.md ← this file

```






<!-- ![CI logo](https://codeinstitute.s3.amazonaws.com/fullstack/ci_logo_small.png)

# Signora

A Progressive Web App for signing PDF and Word documents.

- **PDF**: signed entirely in the browser (pdf-lib + PDF.js).
- **Word (DOC/DOCX)**: uploaded to a Node.js server, converted to PDF via
  LibreOffice for maximum formatting fidelity, then signed server-side
  and returned as a signed PDF.

## Requirements

- Node.js 18+
- LibreOffice installed locally (for DOCX signing)

## Local Setup

### 1. Install LibreOffice

Ubuntu / Debian: -->