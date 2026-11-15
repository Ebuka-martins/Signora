import { handlePdf, embedSignaturesIntoPdf } from './pdf-handler.js';
import { handleDocx, embedSignaturesIntoDocx } from './docx-handler.js';
import { initSignaturePad, getSignatureDataUrl, resetSignaturePad } from './signature.js';

const uploadSection = document.getElementById('upload-section');
const signingSection = document.getElementById('signing-section');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');
const previewArea = document.getElementById('document-preview');
const toastEl = document.getElementById('toast');
const btnBack = document.getElementById('btn-back');
const btnSave = document.getElementById('btn-save');
const btnClearSig = document.getElementById('btn-clear-sig');
const btnAddSig = document.getElementById('btn-add-sig');

let currentFileType = null;
let pdfState = null;
let docxState = null;

// ---------- UI helpers ----------
function showToast(message, type = 'info', duration = 3500) {
  toastEl.textContent = message;
  toastEl.className = `toast ${type}`;
  toastEl.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toastEl.hidden = true; }, duration);
}

function switchView(view) {
  uploadSection.classList.toggle('active', view === 'upload');
  signingSection.classList.toggle('active', view === 'signing');
}

// ---------- Upload ----------
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'doc', 'docx'].includes(ext)) {
    showToast('Please upload a PDF, DOC, or DOCX file.', 'error');
    return;
  }

  fileNameDisplay.textContent = file.name;
  currentFileType = ext === 'pdf' ? 'pdf' : 'docx';

  try {
    showToast('Loading document…');
    previewArea.innerHTML = '';

    if (currentFileType === 'pdf') {
      pdfState = await handlePdf(file, previewArea);
      showToast('PDF loaded. Draw your signature.', 'success');
    } else {
      docxState = await handleDocx(file, previewArea);
      showToast('Word document loaded. Draw your signature.', 'success');
    }

    switchView('signing');
    initSignaturePad();
    resetSignaturePad();

  } catch (err) {
    console.error(err);
    showToast('Failed to load document: ' + err.message, 'error');
  }

  fileInput.value = '';
});

// ---------- Back ----------
btnBack.addEventListener('click', () => {
  pdfState = null;
  docxState = null;
  currentFileType = null;
  previewArea.innerHTML = '';
  fileNameDisplay.textContent = '';
  document.getElementById('pdf-page-controls').hidden = true;
  switchView('upload');
});

// ---------- Signature clear ----------
btnClearSig.addEventListener('click', () => {
  resetSignaturePad();
  document.querySelectorAll('.placed-signature').forEach(el => el.remove());
});

// ---------- Place signature ----------
btnAddSig.addEventListener('click', () => {
  const dataUrl = getSignatureDataUrl();
  if (!dataUrl) {
    showToast('Please draw a signature first.', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'placed-signature';
  overlay.style.width = '180px';
  overlay.style.height = '70px';
  overlay.style.left = '40px';
  overlay.style.top = '80px';

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'signature';
  overlay.appendChild(img);

  previewArea.style.position = 'relative';
  previewArea.appendChild(overlay);

  makeDraggable(overlay);
  makeResizable(overlay);

  showToast('Signature placed. Drag to position it.', 'success');
});

// ---------- Drag ----------
function makeDraggable(el) {
  let startX, startY, startLeft, startTop;

  const onStart = (e) => {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    startX = point.clientX;
    startY = point.clientY;
    startLeft = el.offsetLeft;
    startTop = el.offsetTop;
    el.style.zIndex = 100;

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };
  const onMove = (e) => {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    el.style.left = (startLeft + point.clientX - startX) + 'px';
    el.style.top = (startTop + point.clientY - startY) + 'px';
  };
  const onEnd = () => {
    el.style.zIndex = 10;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  };

  el.addEventListener('mousedown', onStart);
  el.addEventListener('touchstart', onStart, { passive: false });
}

// ---------- Resize ----------
function makeResizable(el) {
  const handle = document.createElement('div');
  handle.style.cssText = `
    position: absolute; right: -6px; bottom: -6px;
    width: 14px; height: 14px; background: var(--accent);
    border-radius: 50%; cursor: nwse-resize; touch-action: none;
  `;
  el.appendChild(handle);

  let startX, startY, startW, startH;

  const onStart = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    startX = point.clientX;
    startY = point.clientY;
    startW = el.offsetWidth;
    startH = el.offsetHeight;

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };
  const onMove = (e) => {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    el.style.width = Math.max(60, startW + point.clientX - startX) + 'px';
    el.style.height = Math.max(30, startH + point.clientY - startY) + 'px';
  };
  const onEnd = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  };

  handle.addEventListener('mousedown', onStart);
  handle.addEventListener('touchstart', onStart, { passive: false });
}

// ---------- Save ----------
btnSave.addEventListener('click', async () => {
  const signatures = document.querySelectorAll('.placed-signature');
  if (signatures.length === 0) {
    showToast('Please place at least one signature on the document.', 'error');
    return;
  }

  btnSave.disabled = true;
  btnSave.textContent = 'Saving…';

  try {
    if (currentFileType === 'pdf' && pdfState) {
      await embedSignaturesIntoPdf(pdfState, previewArea, signatures);
      showToast('Signed PDF downloaded!', 'success');
    } else if (currentFileType === 'docx' && docxState) {
      await embedSignaturesIntoDocx(docxState, previewArea, signatures);
      showToast('Signed document downloaded!', 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('Save failed: ' + err.message, 'error', 6000);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = 'Save Signed Document';
  }
});