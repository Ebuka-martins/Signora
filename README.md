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



### What each file does

| File | Responsibility |
|------|----------------|
| `server/index.js` | HTTP server, static file serving, JWT auth, user registration/login, LibreOffice conversion pipeline. Everything server-side lives here. |
| `src/index.html` | The single-page app shell. Contains the auth guard, upload UI, signing UI, signature panel, install banner, and script tags for all CDN libraries. |
| `src/login.html` | Standalone sign-in page. Only ~150 lines of inline CSS + JS so it renders instantly without waiting for the app shell. |
| `src/signup.html` | Standalone account creation page. Same self-contained pattern as `login.html`. |
| `src/manifest.json` | Declares the app as installable: name, icons, theme colour, `display: standalone`, and `start_url`. |
| `src/sw.js` | Service Worker. Caches the app shell for offline use; bypasses cache for `/`, `/index.html`, `/login.html`, `/signup.html`, `/sw.js`, and `/api/*`. |
| `src/css/style.css` | All styles for the app. CSS custom properties at the top define the design tokens (colours, radii, shadows, animations). Dark mode is a `[data-theme="dark"]` override of those tokens. |
| `src/js/app.js` | Wires everything together: view switching, toolbar behaviour, signature placement (drag/resize/rotate/delete), page registry, save button. |
| `src/js/pdf-handler.js` | Renders PDF pages with PDF.js and embeds signatures into the PDF bytes with pdf-lib on save. Also handles multi-page signature tagging. |
| `src/js/docx-handler.js` | Uses Mammoth.js for the Word preview, then uploads the original file + signature coordinates to `/api/sign-docx` and downloads the returned PDF. |
| `src/js/signature.js` | Wraps Signature Pad. Exposes draw mode, typed mode, colour/width/style controls, and PNG export at high DPI. |

---

## Requirements

### Required

- **Node.js 18+** and **npm 9+**
- Modern browser (Chrome 90+, Firefox 90+, Safari 15+, Edge 90+)

### Required for Word document signing only

- **LibreOffice** (Writer component) on the machine running the server

### Installing LibreOffice

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install -y libreoffice-writer fonts-liberation fonts-dejavu-core


```

### Fedora / RHEL

```
sudo dnf install -y libreoffice-writer liberation-fonts dejavu-sans-fonts

```


### macOS (Homebrew)

```
brew install --cask libreoffice
sudo ln -sf /Applications/LibreOffice.app/Contents/MacOS/soffice /usr/local/bin/libreoffice

```

### Windows

Download from libreoffice.org

Install with defaults

Add C:\Program Files\LibreOffice\program to your PATH

### Verify the install worked:

`libreoffice --version`

If that prints a version number, you're ready.

## Quick Start

```
# 1. Clone the project
git clone <your-repo-url> signora
cd signora

# 2. Install Node dependencies
npm install

# 3. Set a persistent JWT secret (recommended — see Environment Variables)
export JWT_SECRET="$(openssl rand -hex 48)"

# 4. Start the app
npm start

```
The server opens http://localhost:3000 in your browser. You'll be redirected to the login page.

## First-time use

```
Click Create one on the login page

Choose a username, password, and (optionally) a display name

You're signed in and taken to the main app

Upload a PDF or Word document

Draw or type your signature

Place it on the document

Click Save Signed Document → the signed file downloads

That's it. No accounts to activate, no email verification, no payment screens

```

## Environment Variables

| **Variable** | **Required** | **Default** | **Description** |
|:--------------|:-----------:|:------------|:------------|
| PORT | NO | 3000 | HTTP port the server listens on |
| JWT_SECRET | Recommended | random per-restart | Secret used to sign session tokens. If unset, tokens are invalidated on every restart — fine for local dev, not for production. |
| NODE_ENV | NO | - | Set to production on deployed servers |
| CI | NO | - | If set, skips auto-opening the browser on start |
| DOCKER | NO | - | If set, skips auto-opening the browser on start |

## Generating a good JWT secret

`openssl rand -hex 48`

Copy the output and either `export JWT_SECRET="..."` in your shell, or add it to a .env file and load it with dotenv (not included by default).

Set this before going live. Without it, every server restart logs everyone out.

## Using the App

 ### Signing a PDF

 From the upload screen, drop a PDF or click Choose Document

In the signature panel on the right:

**Draw tab:** draw with your finger or mouse

**Type tab:** type your name in a handwritten font

Adjust colour, stroke width, and style

Click Place **Signature —** a signature box appears on the document

**Drag** to move, **corner circle** to resize, **curved arrow** to rotate

If you need to sign another page, click › to change page, then place another signature

Click the red × on any placed signature to delete it

Click Save **Signed Document →** the signed PDF downloads


## Signing a Word document

Same flow, with two differences:

The preview is rendered by Mammoth.js, so it may look slightly different from Word's own rendering

The output is a PDF, not a DOCX (see How It Works)

Conversion takes 2–5 seconds on first use (LibreOffice cold start) and under 1 second after that.


## Keyboard shortcuts

```
Shortcut	Action
Ctrl+S / Cmd+S	     Save signed document
Delete / Backspace	   Delete selected signature
Esc	                    Deselect signature
Enter / Space (on dropzone)	    Open file picker

```

## Signing Out

`Click ↩ Sign out in the top-right of the header. Your session token is cleared and you're returned to the login page.`

