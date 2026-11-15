import { handlePdf, embedSignaturesIntoPdf } from './pdf-handler.js';
import { handleDocx, embedSignaturesIntoDocx } from './docx-handler.js';
import { initSignaturePad, getSignatureDataUrl, resetSignaturePad } from './signature.js';

// ---------- DOM ----------
const uploadSection    = document.getElementById('upload-section');
const signingSection   = document.getElementById('signing-section');
const fileInput        = document.getElementById('file-input');
const dropzone         = document.getElementById('dropzone');
const fileNameDisplay  = document.getElementById('file-name');
const previewArea      = document.getElementById('document-preview');
const toastContainer   = document.getElementById('toast-container');
const btnBack          = document.getElementById('btn-back');
const btnSave          = document.getElementById('btn-save');
const btnClearSig      = document.getElementById('btn-clear-sig');
const btnAddSig        = document.getElementById('btn-add-sig');
const btnTheme         = document.getElementById('btn-theme');
const progressOverlay  = document.getElementById('progress-overlay');
const progressBar      = document.getElementById('progress-bar');
const installBanner    = document.getElementById('install-banner');
const btnInstall       = document.getElementById('btn-install');
const btnInstallClose  = document.getElementById('btn-install-close');

// ---------- State ----------
let currentFileType = null;
let pdfState = null;
let docxState = null;
let selectedSignature = null;

// ---------- Progress bar ----------
function showProgress(pct) {
  progressOverlay.classList.add('active');
  progressBar.style.width = pct + '%';
}
function hideProgress() {
  progressBar.style.width = '100%';
  setTimeout(() => {
    progressOverlay.classList.remove('active');
    progressBar.style.width = '0';
  }, 350);
}

// ---------- Toasts ----------
function showToast(message, type = 'info', duration = 3800) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ---------- View switching ----------
function switchView(view) {
  uploadSection.classList.toggle('active', view === 'upload');
  signingSection.classList.toggle('active', view === 'signing');
}

// ---------- Theme toggle ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('signora-theme', theme);
}
btnTheme.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});
applyTheme(localStorage.getItem('signora-theme')
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

// ---------- File upload ----------
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

['dragenter', 'dragover'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  });
});
['dragleave', 'drop'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
  });
});
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) processFile(file);
  fileInput.value = '';
});

async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'doc', 'docx'].includes(ext)) {
    showToast('Please upload a PDF, DOC, or DOCX file.', 'error');
    return;
  }

  fileNameDisplay.textContent = file.name;
  fileNameDisplay.classList.add('visible');
  currentFileType = ext === 'pdf' ? 'pdf' : 'docx';

  try {
    showToast('Loading document…');
    showProgress(25);
    previewArea.innerHTML = '<div class="skeleton"></div>';

    if (currentFileType === 'pdf') {
      pdfState = await handlePdf(file, previewArea);
      showProgress(75);
      showToast('PDF loaded. Draw your signature.', 'success');
    } else {
      docxState = await handleDocx(file, previewArea);
      showProgress(75);
      showToast('Word document loaded. Draw your signature.', 'success');
    }

    switchView('signing');
    initSignaturePad();
    resetSignaturePad();
    hideProgress();

  } catch (err) {
    console.error(err);
    previewArea.innerHTML = '';
    hideProgress();
    showToast('Failed to load document: ' + err.message, 'error', 6000);
  }
}

// ---------- Back ----------
btnBack.addEventListener('click', () => {
  pdfState = null;
  docxState = null;
  currentFileType = null;
  previewArea.innerHTML = '';
  fileNameDisplay.textContent = '';
  fileNameDisplay.classList.remove('visible');
  document.getElementById('pdf-page-controls').hidden = true;
  switchView('upload');
});

// ---------- Signature clear ----------
btnClearSig.addEventListener('click', () => {
  resetSignaturePad();
  document.querySelectorAll('.placed-signature').forEach(el => el.remove());
  selectedSignature = null;
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

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  overlay.appendChild(resizeHandle);

  const deleteHandle = document.createElement('button');
  deleteHandle.className = 'delete-handle';
  deleteHandle.innerHTML = '×';
  deleteHandle.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.remove();
  });
  overlay.appendChild(deleteHandle);

  previewArea.style.position = 'relative';
  previewArea.appendChild(overlay);

  makeDraggable(overlay);
  makeResizable(overlay, resizeHandle);
  makeSelectable(overlay);

  showToast('Signature placed. Drag to position it.', 'success');
});

// ---------- Drag ----------
function makeDraggable(el) {
  let startX, startY, startLeft, startTop;

  const onStart = (e) => {
    if (e.target.classList.contains('resize-handle') ||
        e.target.classList.contains('delete-handle')) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    startX = point.clientX;
    startY = point.clientY;
    startLeft = el.offsetLeft;
    startTop = el.offsetTop;
    el.style.zIndex = 100;
    el.classList.add('selected');
    selectedSignature = el;

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };
  const onMove = (e) => {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    el.style.left = (startLeft + point.clientX - startX) + 'px';
    el.style.top  = (startTop  + point.clientY - startY) + 'px';
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
function makeResizable(el, handle) {
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
    el.style.width  = Math.max(60, startW + point.clientX - startX) + 'px';
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

// ---------- Selection ----------
function makeSelectable(el) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.placed-signature').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    selectedSignature = el;
  });
}
previewArea.addEventListener('click', () => {
  document.querySelectorAll('.placed-signature').forEach(s => s.classList.remove('selected'));
  selectedSignature = null;
});

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (signingSection.classList.contains('active')) btnSave.click();
  }
  if (e.key === 'Escape' && selectedSignature) {
    selectedSignature.classList.remove('selected');
    selectedSignature = null;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSignature) {
    if (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA') return;
    selectedSignature.remove();
    selectedSignature = null;
  }
});

// ---------- Save ----------
btnSave.addEventListener('click', async () => {
  const signatures = document.querySelectorAll('.placed-signature');
  if (signatures.length === 0) {
    showToast('Please place at least one signature on the document.', 'error');
    return;
  }

  btnSave.disabled = true;
  const originalHTML = btnSave.innerHTML;
  btnSave.innerHTML = '<span>⏳</span> Saving…';
  showProgress(20);

  try {
    if (currentFileType === 'pdf' && pdfState) {
      showProgress(50);
      await embedSignaturesIntoPdf(pdfState, previewArea, signatures);
      showProgress(100);
      showToast('Signed PDF downloaded!', 'success');
    } else if (currentFileType === 'docx' && docxState) {
      showProgress(40);
      await embedSignaturesIntoDocx(docxState, previewArea, signatures);
      showProgress(100);
      showToast('Signed document downloaded!', 'success');
    }
    hideProgress();
  } catch (err) {
    console.error(err);
    hideProgress();
    showToast('Save failed: ' + err.message, 'error', 6000);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = originalHTML;
  }
});

// ---------- PWA install prompt ----------
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!localStorage.getItem('signora-install-dismissed')) {
    installBanner.classList.remove('hidden');
  }
});
btnInstall.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') showToast('Signora installed!', 'success');
  deferredInstallPrompt = null;
  installBanner.classList.add('hidden');
});
btnInstallClose.addEventListener('click', () => {
  installBanner.classList.add('hidden');
  localStorage.setItem('signora-install-dismissed', '1');
});
window.addEventListener('appinstalled', () => {
  installBanner.classList.add('hidden');
  showToast('Signora installed. Enjoy!', 'success');
});