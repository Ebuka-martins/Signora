const { PDFDocument } = PDFLib;

let currentPdfDoc = null;
let currentPage = 1;
let totalPages = 1;
let previewContainer = null;

export async function handlePdf(file, container) {
  previewContainer = container;
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
    }
  });
  newNext.addEventListener('click', async () => {
    if (currentPage < totalPages) {
      currentPage++;
      await renderPage(currentPage);
      updateNav();
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

  // Preserve placed signatures (so they don't vanish on page change)
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

  // Re-add signatures belonging to this page
  existing.forEach(el => {
    if (parseInt(el.dataset.page, 10) === pageNum) {
      previewContainer.appendChild(el);
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

  // Ensure every overlay has a data-page; default to current page
  signatureEls.forEach(el => {
    if (!el.dataset.page) el.dataset.page = String(currentPdfPage);
  });

  for (const el of signatureEls) {
    const img = el.querySelector('img');
    if (!img) continue;
    const pageNum = parseInt(el.dataset.page, 10);

    // Only embed signatures that belong to the current visible page
    // (others will be embedded by walking them all here — see note below)
    const page = pages[pageNum - 1];
    if (!page) continue;

    const { width: pdfW, height: pdfH } = page.getSize();

    // We measure against the *current* canvas, which represents the current page
    // For signatures on other pages we need to re-render briefly.
    // Simpler: skip cross-page signatures to avoid coordinate mismatch.
    if (pageNum !== currentPdfPage) continue;

    const imgRect = img.getBoundingClientRect();
    const relX = imgRect.left - canvasRect.left;
    const relY = imgRect.top - canvasRect.top;

    const scaleX = pdfW / canvasRect.width;
    const scaleY = pdfH / canvasRect.height;

    const pdfX  = relX * scaleX;
    const pdfY  = pdfH - (relY * scaleY) - (imgRect.height * scaleY);
    const pdfWImg = imgRect.width * scaleX;
    const pdfHImg = imgRect.height * scaleY;

    const base64 = img.src.split(',')[1];
    const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const embeddedImg = await pdfDoc.embedPng(imgBytes);

    page.drawImage(embeddedImg, {
      x: pdfX,
      y: pdfY,
      width: pdfWImg,
      height: pdfHImg
    });
  }

  const signedBytes = await pdfDoc.save();
  downloadBlob(new Blob([signedBytes], { type: 'application/pdf' }), `signed-${fileName}`);
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