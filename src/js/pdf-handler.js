const { PDFDocument } = PDFLib;

let currentPdfDoc = null;
let currentPage = 1;
let totalPages = 1;
let previewContainer = null;
let pageChangeCallback = null;

// Module-level reference to the app's registry — set once by handlePdf()
let signatureRegistry = [];

export async function handlePdf(file, container, onPageChange, registry) {
  previewContainer = container;
  pageChangeCallback = onPageChange;
  signatureRegistry = registry || [];

  const arrayBuffer = await file.arrayBuffer();

  const pdfjsLib = window.pdfjsLib;
  currentPdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  totalPages = currentPdfDoc.numPages;
  currentPage = 1;

  const pageControls = document.getElementById('pdf-page-controls');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');

  pageControls.hidden = totalPages <= 1;

  const updateNav = () => {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
  };

  const newPrev = prevBtn.cloneNode(true);
  const newNext = nextBtn.cloneNode(true);
  prevBtn.replaceWith(newPrev);
  nextBtn.replaceWith(newNext);

  newPrev.addEventListener('click', async () => {
    if (currentPage > 1) {
      currentPage--;
      await renderPage(currentPage);
      updateNav();
      pageChangeCallback?.(currentPage, totalPages);
    }
  });
  newNext.addEventListener('click', async () => {
    if (currentPage < totalPages) {
      currentPage++;
      await renderPage(currentPage);
      updateNav();
      pageChangeCallback?.(currentPage, totalPages);
    }
  });

  await renderPage(currentPage);
  updateNav();

  return {
    pdfDoc: currentPdfDoc,
    pdfBytes: arrayBuffer,
    fileName: file.name,
    totalPages,
    getCurrentPage: () => currentPage
  };
}

/**
 * Renders the page canvas, then re-attaches every overlay from the registry
 * whose `data-page` matches this page.
 *
 * IMPORTANT: overlays are NEVER read from the DOM (that's what was losing them).
 * We always read from `signatureRegistry` and append fresh. The registry is the
 * single source of truth for "where every signature lives".
 */
async function renderPage(pageNum) {
  if (!currentPdfDoc || !previewContainer) return;

  // 1. Detach any overlays currently in the DOM (but keep them alive in the registry)
  const currentlyAttached = Array.from(previewContainer.querySelectorAll('.placed-signature'));
  currentlyAttached.forEach(el => el.remove());

  // 2. Render the new page canvas
  previewContainer.innerHTML = '';

  const page = await currentPdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';

  await page.render({ canvasContext: ctx, viewport }).promise;
  previewContainer.appendChild(canvas);

  // 3. Re-attach every overlay from the registry whose page matches.
  //    We iterate the registry (source of truth), not the DOM.
  signatureRegistry.forEach(entry => {
    if (entry.page === pageNum && entry.el) {
      // Ensure it's visible
      entry.el.style.display = '';
      previewContainer.appendChild(entry.el);
    }
  });
}

export async function embedSignaturesIntoPdf(pdfState, container, signatureEls) {
  const { pdfBytes, fileName } = pdfState;
  const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
  const pages = pdfDoc.getPages();

  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('No PDF page rendered.');

  const canvasRect = canvas.getBoundingClientRect();
  const currentPdfPage = pdfState.getCurrentPage();

  const byPage = new Map();
  signatureEls.forEach(el => {
    const pageNum = parseInt(el.dataset.page, 10) || currentPdfPage;
    if (!byPage.has(pageNum)) byPage.set(pageNum, []);
    byPage.get(pageNum).push(el);
  });

  for (const [pageNum, els] of byPage) {
    const page = pages[pageNum - 1];
    if (!page) continue;

    const { width: pdfW, height: pdfH } = page.getSize();

    let pageCanvasRect = null;

    if (pageNum === currentPdfPage) {
      pageCanvasRect = { width: canvasRect.width, height: canvasRect.height, left: canvasRect.left, top: canvasRect.top };
    } else {
      const rendered = await renderPageOffscreen(pageNum);
      pageCanvasRect = { width: rendered.width, height: rendered.height, left: 0, top: 0 };
    }

    for (const el of els) {
      const img = el.querySelector('img');
      if (!img) continue;

      const rotation = parseFloat(el.dataset.rotation || '0');

      const rotatedDataUrl = await rotateImage(img.src, rotation);
      const base64 = rotatedDataUrl.split(',')[1];
      const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const embeddedImg = await pdfDoc.embedPng(imgBytes);

      const imgRect = img.getBoundingClientRect();
      let relX, relY, w, h;

      if (pageNum === currentPdfPage) {
        relX = imgRect.left - pageCanvasRect.left;
        relY = imgRect.top  - pageCanvasRect.top;
        w = imgRect.width;
        h = imgRect.height;
      } else {
        relX = parseFloat(el.style.left) || 0;
        relY = parseFloat(el.style.top)  || 0;
        w = parseFloat(el.style.width)  || 200;
        h = parseFloat(el.style.height) || 80;
      }

      const scaleX = pdfW / pageCanvasRect.width;
      const scaleY = pdfH / pageCanvasRect.height;

      const pdfX = relX * scaleX;
      const pdfY = pdfH - (relY * scaleY) - (h * scaleY);

      page.drawImage(embeddedImg, {
        x: pdfX,
        y: pdfY,
        width: w * scaleX,
        height: h * scaleY
      });
    }
  }

  const signedBytes = await pdfDoc.save();
  downloadBlob(new Blob([signedBytes], { type: 'application/pdf' }), `signed-${fileName}`);
}

async function renderPageOffscreen(pageNum) {
  const page = await currentPdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, width: viewport.width, height: viewport.height };
}

function rotateImage(dataUrl, degrees) {
  return new Promise((resolve) => {
    if (!degrees || degrees === 0) return resolve(dataUrl);
    const img = new Image();
    img.onload = () => {
      const rad = (degrees * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const w = img.width;
      const h = img.height;
      const newW = Math.ceil(w * cos + h * sin);
      const newH = Math.ceil(w * sin + h * cos);
      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      ctx.translate(newW / 2, newH / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -w / 2, -h / 2);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}