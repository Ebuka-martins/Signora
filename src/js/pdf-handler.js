const { PDFDocument, degrees } = PDFLib;

let currentPdfDoc = null;
let currentPage = 1;
let totalPages = 1;
let previewContainer = null;
let pageChangeCallback = null;

export async function handlePdf(file, container, onPageChange) {
  previewContainer = container;
  pageChangeCallback = onPageChange;
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
      pageChangeCallback?.(currentPage);
    }
  });
  newNext.addEventListener('click', async () => {
    if (currentPage < totalPages) {
      currentPage++;
      await renderPage(currentPage);
      updateNav();
      pageChangeCallback?.(currentPage);
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

async function renderPage(pageNum) {
  if (!currentPdfDoc || !previewContainer) return;

  // Preserve existing signature overlays (they're tracked by data-page)
  const existing = Array.from(previewContainer.querySelectorAll('.placed-signature'));
  existing.forEach(el => el.remove());

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

  // Re-append overlays that belong to this page
  existing.forEach(el => {
    if (parseInt(el.dataset.page, 10) === pageNum) {
      previewContainer.appendChild(el);
    }
  });
}

/**
 * Embeds every signature into its tagged page.
 * Each signature's rotation is baked into a rotated PNG before embed.
 */
export async function embedSignaturesIntoPdf(pdfState, container, signatureEls) {
  const { pdfBytes, fileName } = pdfState;
  const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
  const pages = pdfDoc.getPages();

  // Measure against the CURRENT visible canvas, then normalize to percentages
  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('No PDF page rendered.');

  const canvasRect = canvas.getBoundingClientRect();
  const currentPdfPage = pdfState.getCurrentPage();

  // Group signatures by their page
  const byPage = new Map();
  signatureEls.forEach(el => {
    const pageNum = parseInt(el.dataset.page, 10) || currentPdfPage;
    if (!byPage.has(pageNum)) byPage.set(pageNum, []);
    byPage.get(pageNum).push(el);
  });

  // For each page with signatures, embed them
  for (const [pageNum, els] of byPage) {
    const page = pages[pageNum - 1];
    if (!page) continue;

    const { width: pdfW, height: pdfH } = page.getSize();

    // If this signature is on the visible page, we can measure it directly.
    // If on another page, we don't have its rendered canvas — so we use a
    // heuristic: treat its percentage position from the last time it was visible.
    // For simplicity here we re-render each page offscreen to measure properly.
    let pageCanvas = null;
    let pageCanvasRect = null;

    if (pageNum === currentPdfPage) {
      pageCanvas = canvas;
      pageCanvasRect = canvasRect;
    } else {
      // Render the target page offscreen so we can measure correctly
      const rendered = await renderPageOffscreen(pageNum);
      pageCanvas = rendered.canvas;
      // We don't need getBoundingClientRect for offscreen — we use canvas dimensions
      pageCanvasRect = { width: rendered.width, height: rendered.height, left: 0, top: 0 };
    }

    for (const el of els) {
      const img = el.querySelector('img');
      if (!img) continue;

      const rotation = parseFloat(el.dataset.rotation || '0');

      // Bake rotation into the PNG
      const rotatedDataUrl = await rotateImage(img.src, rotation);
      const base64 = rotatedDataUrl.split(',')[1];
      const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const embeddedImg = await pdfDoc.embedPng(imgBytes);

      // Position measurement
      const imgRect = img.getBoundingClientRect();
      let relX, relY, w, h;

      if (pageNum === currentPdfPage) {
        relX = imgRect.left - pageCanvasRect.left;
        relY = imgRect.top  - pageCanvasRect.top;
        w = imgRect.width;
        h = imgRect.height;
      } else {
        // For hidden pages, element.getBoundingClientRect() returns 0s, so we
        // fall back to reading inline style (left/top/width/height in px).
        relX = parseFloat(el.style.left) || 0;
        relY = parseFloat(el.style.top)  || 0;
        w = parseFloat(el.style.width)  || 200;
        h = parseFloat(el.style.height) || 80;
      }

      const scaleX = pdfW / pageCanvasRect.width;
      const scaleY = pdfH / pageCanvasRect.height;

      const pdfX = relX * scaleX;
      const pdfY = pdfH - (relY * scaleY) - (h * scaleY);

      // If rotated, the image's own width/height are swapped when laid flat.
      // We embed using the ORIGINAL unrotated image dimensions rotated by pdf-lib.
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

// Render a page to an offscreen canvas and return its size
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

// Rotate a PNG data URL by given degrees and return a new PNG data URL
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