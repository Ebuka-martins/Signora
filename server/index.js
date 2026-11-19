const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument } = require('pdf-lib');

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Temp directory + multer setup
// ---------------------------------------------------------------------------
const TEMP_DIR = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB cap
});

// ---------------------------------------------------------------------------
// Service Worker — never let the browser HTTP-cache sw.js
// (must be defined BEFORE express.static mounts)
// ---------------------------------------------------------------------------
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '..', 'src', 'sw.js'));
});

// ---------------------------------------------------------------------------
// Prevent browsers from HTTP-caching the protected entry points
// (must be defined BEFORE express.static so it runs first)
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html' || req.path === '/login.html') {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'src')));
app.use('/favicon', express.static(path.join(__dirname, '..', 'assets', 'favicon')));
app.use('/icons',   express.static(path.join(__dirname, '..', 'assets', 'icons')));
app.use('/assets',  express.static(path.join(__dirname, '..', 'assets')));

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'src', 'index.html'));
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ---------------------------------------------------------------------------
// POST /api/sign-docx
// Uploads a DOCX, converts via LibreOffice, embeds signatures, returns PDF.
// ---------------------------------------------------------------------------
app.post('/api/sign-docx', upload.single('document'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No document uploaded.' });
  }

  const inputPath = req.file.path;
  const jobId = uuidv4();
  const profileDir = path.join(TEMP_DIR, `lo-profile-${jobId}`);
  const outputDir = TEMP_DIR;

  try {
    // 1. Convert DOCX -> PDF using LibreOffice
    await execFileAsync('libreoffice', [
      `-env:UserInstallation=file://${profileDir}`,
      '--headless',
      '--invisible',
      '--nodefault',
      '--nofirststartwizard',
      '--nolockcheck',
      '--nologo',
      '--norestore',
      '--convert-to', 'pdf:writer_pdf_Export',
      '--outdir', outputDir,
      inputPath
    ], { timeout: 60000 });

    // 2. Locate the generated PDF
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const pdfPath = path.join(outputDir, `${baseName}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      throw new Error('LibreOffice conversion failed: PDF not generated.');
    }

    // 3. Load PDF and embed signatures
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    let signatures = [];
    if (req.body.signatures) {
      try {
        signatures = JSON.parse(req.body.signatures);
      } catch (parseErr) {
        throw new Error('Invalid signature data: ' + parseErr.message);
      }
    }

    for (const sig of signatures) {
      const page = pages[sig.page - 1];
      if (!page) continue;

      const { width: pdfW, height: pdfH } = page.getSize();

      // Decode base64 PNG
      const base64 = sig.dataUrl.split(',')[1];
      if (!base64) continue;
      const imgBytes = Buffer.from(base64, 'base64');

      const embeddedImg = await pdfDoc.embedPng(imgBytes);

      // Percentage -> PDF points (origin at bottom-left)
      const pdfX = sig.x * pdfW;
      const pdfY = pdfH - (sig.y * pdfH) - (sig.height * pdfH);

      page.drawImage(embeddedImg, {
        x: pdfX,
        y: pdfY,
        width: sig.width * pdfW,
        height: sig.height * pdfH
      });
    }

    const signedBytes = await pdfDoc.save();

    // 4. Send signed PDF back
    const outName = `signed-${req.file.originalname.replace(/\.(doc|docx)$/i, '')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
    res.send(Buffer.from(signedBytes));

  } catch (err) {
    console.error('DOCX signing error:', err);
    res.status(500).json({ error: 'Failed to process document: ' + err.message });
  } finally {
    // 5. Cleanup
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

      const baseName = path.basename(inputPath, path.extname(inputPath));
      const pdfPath = path.join(outputDir, `${baseName}.pdf`);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

      if (fs.existsSync(profileDir)) fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }
  }
});

// ---------------------------------------------------------------------------
// Start + auto-open browser
// ---------------------------------------------------------------------------
app.listen(PORT, async () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Signora running at ${url}`);

  // Auto-open in default browser (skip in Docker/CI)
  if (!process.env.CI && !process.env.DOCKER) {
    try {
      const open = (await import('open')).default;
      await open(url);
    } catch (err) {
      console.warn('Could not auto-open browser:', err.message);
    }
  }
});