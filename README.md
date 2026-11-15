![CI logo](https://codeinstitute.s3.amazonaws.com/fullstack/ci_logo_small.png)

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

Ubuntu / Debian: