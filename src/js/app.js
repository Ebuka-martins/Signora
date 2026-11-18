import { handlePdf, embedSignaturesIntoPdf } from './pdf-handler.js';
import { handleDocx, embedSignaturesIntoDocx } from './docx-handler.js';
import { initSignaturePad, getSignatureDataUrl, resetSignaturePad } from './signature.js';

// ---------- DOM ----------
const uploadSection       = document.getElementById('upload-section');
const signingSection      = document.getElementById('signing-section');
const fileInput           = document.getElementById('file-input');
const dropzone            = document.getElementById('dropzone');
const fileNameDisplay     = document.getElementById('file-name');
const previewArea         = document.getElementById('document-preview');
const toastContainer      = document.getElementById('toast-container');
const btnBack             = document.getElementById('btn-back');
const btnSave             = document.getElementById('btn-save');
const btnClearSig         = document.getElementById('btn-clear-sig');
const btnAddSig           = document.getElementById('btn-add-sig');
const btnTheme            = document.getElementById('btn-theme');
const progressOverlay     = document.getElementById('progress-overlay');
const progressBar         = document.getElementById('progress-bar');
const installBanner       = document.getElementById('install-banner');
const btnInstall          = document.getElementById('btn-install');
const btnInstallClose     = document.getElementById('btn-install-close');
const signingToolbar      = document.getElementById('signing-toolbar');
const btnToolbarCollapse  = document.getElementById('btn-toolbar-collapse');
const btnToolbarReveal    = document.getElementById('btn-toolbar-reveal');
const sigCountBadge       = document.getElementById('sig-count-badge');

// ---------- State ----------
let currentFileType = null;
let pdfState = null;
let docxState = null;
let selectedSignature = null;
let toolbarManuallyHidden = false;

// Registry of ALL placed signatures, keyed by page number (PDF) or "1" (DOCX)
// Each entry: { el, page }
const signatureRegistry = [];

// ---------- Progress ----------
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

// ---------- Toast ----------
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

// ---------- Signature count badge ----------
function updateSigCount() {
  if (!sigCountBadge) return;
  const n = signatureRegistry.length;
  sigCountBadge.textContent = String(n);
  sigCountBadge.dataset.count = String(n);
  sigCountBadge.classList.remove('bump');
  void sigCountBadge.offsetWidth;
  sigCountBadge.classList.add('bump');
}

// ---------- Toolbar show/hide ----------
function hideToolbar(manual = false) {
  if (!signingToolbar) return;
  signingToolbar.classList.add('hidden-toolbar');
  btnToolbarReveal?.classList.add('visible');
  if (manual) toolbarManuallyHidden = true;
}
function revealToolbar(resetManual = true) {
  if (!signingToolbar) return;
  signingToolbar.classList.remove('hidden-toolbar');
  btnToolbarReveal?.classList.remove('visible');
  if (resetManual) toolbarManuallyHidden = false;
}
btnToolbarCollapse?.addEventListener('click', () => hideToolbar(true));
btnToolbarReveal?.addEventListener('click', () => revealToolbar(true));

let lastScrollY = window.scrollY;
let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    if (!signingSection.classList.contains('active')) {
      scrollTicking = false; return;
    }
    if (toolbarManuallyHidden) {
      scrollTicking = false; return;
    }
    const y = window.scrollY;
    if (y > 120 && y > lastScrollY) hideToolbar(false);
    else if (y < 40) revealToolbar(false);
    lastScrollY = y;
    scrollTicking = false;
  });
}, { passive: true });

// ---------- View switch ----------
function switchView(view) {
  uploadSection.classList.toggle('active', view === 'upload');
  signingSection.classList.toggle('active', view === 'signing');

  if (view === 'signing') {
    revealToolbar(true);
    lastScrollY = window.scrollY;
  }
}

// ---------- Theme ----------
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

  // Clear signature registry for new document
  signatureRegistry.length = 0;
  updateSigCount();

  try {
    showToast('Loading document…');
    showProgress(25);
    previewArea.innerHTML = '<div class="skeleton"></div>';

    if (currentFileType === 'pdf') {
      pdfState = await handlePdf(file, previewArea, onPdfPageChange);
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

// ---------- PDF page-change: show/hide signatures for the active page ----------
function onPdfPageChange(newPage) {
  signatureRegistry.forEach(entry => {
    entry.el.style.display = entry.page === newPage ? '' : 'none';
  });
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
  signatureRegistry.length = 0;
  updateSigCount();
  switchView('upload');
});

// ---------- Clear ----------
btnClearSig.addEventListener('click', () => {
  resetSignaturePad();
});

// ---------- Place signature ----------
btnAddSig.addEventListener('click', () => {
  const dataUrl = getSignatureDataUrl();
  if (!dataUrl) {
    showToast('Please draw or type a signature first.', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'placed-signature';
  overlay.style.width = '200px';
  overlay.style.height = '80px';
  overlay.style.left = '40px';
  overlay.style.top = '80px';
  overlay.style.transform = 'rotate(0deg)';

  const currentPage = currentFileType === 'pdf' && pdfState
    ? pdfState.getCurrentPage()
    : 1;

  overlay.dataset.page = String(currentPage);
  overlay.dataset.rotation = '0';

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'signature';
  overlay.appendChild(img);

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'handle resize-handle';
  resizeHandle.innerHTML = '⤡';
  resizeHandle.title = 'Resize';
  overlay.appendChild(resizeHandle);

  // Rotate handle
  const rotateHandle = document.createElement('div');
  rotateHandle.className = 'handle rotate-handle';
  rotateHandle.innerHTML = '↻';
  rotateHandle.title = 'Rotate';
  overlay.appendChild(rotateHandle);

  // Delete handle
  const deleteHandle = document.createElement('div');
  deleteHandle.className = 'handle delete-handle';
  deleteHandle.innerHTML = '×';
  deleteHandle.title = 'Delete';
  deleteHandle.addEventListener('click', (e) => {
    e.stopPropagation();
    removeSignature(overlay);
  });
  overlay.appendChild(deleteHandle);

  previewArea.style.position = 'relative';
  previewArea.appendChild(overlay);

  makeDraggable(overlay);
  makeResizable(overlay, resizeHandle);
  makeRotatable(overlay, rotateHandle);
  makeSelectable(overlay);

  // Register globally
  signatureRegistry.push({ el: overlay, page: currentPage });
  updateSigCount();

  showToast(`Signature placed on page ${currentPage}. Drag to move.`, 'success');
});

// ---------- Delete a signature completely ----------
function removeSignature(el) {
  const idx = signatureRegistry.findIndex(e => e.el === el);
  if (idx !== -1) signatureRegistry.splice(idx, 1);
  el.remove();
  if (selectedSignature === el) selectedSignature = null;
  updateSigCount();
  showToast('Signature deleted.', 'info');
}

// ---------- Drag ----------
function makeDraggable(el) {
  let startX, startY, startLeft, startTop;

  const onStart = (e) => {
    if (e.target.classList.contains('handle')) return;
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

// ---------- Rotate ----------
function makeRotatable(el, handle) {
  let centerX, centerY, startAngle, startRotation;

  const onStart = (e) => {
    e.stopPropagation();
    e.preventDefault();

    const rect = el.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;

    const point = e.touches ? e.touches[0] : e;
    startAngle = Math.atan2(point.clientY - centerY, point.clientX - centerX);
    startRotation = parseFloat(el.dataset.rotation || '0');

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const onMove = (e) => {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const angle = Math.atan2(point.clientY - centerY, point.clientX - centerX);
    const deltaDeg = (angle - startAngle) * (180 / Math.PI);

    let newRotation = startRotation + deltaDeg;
    newRotation = ((newRotation % 360) + 360) % 360;

    el.dataset.rotation = String(newRotation);
    el.style.transform = `rotate(${newRotation}deg)`;
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

// ---------- Keyboard ----------
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
    removeSignature(selectedSignature);
  }
});

// ---------- Save ----------
btnSave.addEventListener('click', async () => {
  if (signatureRegistry.length === 0) {
    showToast('Please place at least one signature on the document.', 'error');
    return;
  }

  btnSave.disabled = true;
  const originalHTML = btnSave.innerHTML;
  btnSave.innerHTML = '<span>⏳</span> Saving…';
  showProgress(20);

  try {
    // Every signature element, regardless of current page
    const signatureEls = signatureRegistry.map(e => e.el);

    if (currentFileType === 'pdf' && pdfState) {
      showProgress(50);
      await embedSignaturesIntoPdf(pdfState, previewArea, signatureEls);
      showProgress(100);
      showToast('Signed PDF downloaded!', 'success');
    } else if (currentFileType === 'docx' && docxState) {
      showProgress(40);
      await embedSignaturesIntoDocx(docxState, previewArea, signatureEls);
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

// ---------- PWA install ----------
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