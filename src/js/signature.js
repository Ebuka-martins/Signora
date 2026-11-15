let signaturePad = null;
let currentColor = '#0F172A';
let currentWidth = 2;

export function initSignaturePad() {
  const canvas = document.getElementById('signature-canvas');
  const wrap = document.getElementById('sig-canvas-wrap');

  // Resize canvas to its rendered size × pixel ratio
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();

  // Guard: if the wrap is hidden (display:none), rect is 0
  const w = rect.width || 320;
  const h = rect.height || 160;

  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);

  if (signaturePad) signaturePad.off();

  signaturePad = new SignaturePad(canvas, {
    penColor: currentColor,
    minWidth: currentWidth * 0.6,
    maxWidth: currentWidth * 1.4,
    backgroundColor: 'rgba(255,255,255,0)'
  });

  // Update placeholder visibility
  signaturePad.addEventListener('beginStroke', () => wrap.classList.add('has-ink'));
  signaturePad.addEventListener('endStroke', () => {
    if (signaturePad.isEmpty()) wrap.classList.remove('has-ink');
  });

  // Color swatches
  document.querySelectorAll('.sig-color').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sig-color').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color;
      if (signaturePad) signaturePad.penColor = currentColor;
    });
  });

  // Width slider
  const widthInput = document.getElementById('sig-width');
  if (widthInput) {
    widthInput.addEventListener('input', () => {
      currentWidth = parseFloat(widthInput.value);
      if (signaturePad) {
        signaturePad.minWidth = currentWidth * 0.6;
        signaturePad.maxWidth = currentWidth * 1.4;
      }
    });
  }
}

export function getSignatureDataUrl() {
  if (!signaturePad || signaturePad.isEmpty()) return null;

  const originalCanvas = signaturePad.canvas;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = originalCanvas.width;
  tempCanvas.height = originalCanvas.height;
  const ctx = tempCanvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  ctx.drawImage(originalCanvas, 0, 0);

  return tempCanvas.toDataURL('image/png');
}

export function resetSignaturePad() {
  if (signaturePad) {
    signaturePad.clear();
    document.getElementById('sig-canvas-wrap')?.classList.remove('has-ink');
  }
}