let signaturePad = null;
let currentColor = '#0F172A';
let currentWidth = 2;
let currentStyle = 'natural';

let typedMode = false;
let typedText = '';
let typedFont = 'Dancing Script';

const STYLE_PRESETS = {
  natural: { minFactor: 0.6, maxFactor: 1.4, smoothing: true,  shadow: false },
  bold:    { minFactor: 1.5, maxFactor: 2.6, smoothing: true,  shadow: false },
  fine:    { minFactor: 0.35, maxFactor: 0.9, smoothing: true, shadow: false },
  ink:     { minFactor: 0.9, maxFactor: 1.9, smoothing: true,  shadow: true  }
};

export function initSignaturePad() {
  const canvas = document.getElementById('signature-canvas');
  const wrap = document.getElementById('sig-canvas-wrap');

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
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

  signaturePad.addEventListener('beginStroke', () => wrap.classList.add('has-ink'));
  signaturePad.addEventListener('endStroke', () => {
    if (signaturePad.isEmpty()) wrap.classList.remove('has-ink');
  });

  // Colour swatches
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
      applyStyleToPad();
    });
  }

  // Style presets
  document.querySelectorAll('.sig-style').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sig-style').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStyle = btn.dataset.style;
      applyStyleToPad();
    });
  });

  // Mode tabs
  document.querySelectorAll('.sig-mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sig-mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      typedMode = tab.dataset.mode === 'type';

      document.querySelectorAll('.sig-mode-pane').forEach(pane => {
        pane.classList.toggle('active', pane.dataset.pane === tab.dataset.mode);
      });

      if (typedMode) updateTypedPreview();
    });
  });

  // Typed input
  const typedInput = document.getElementById('sig-typed-input');
  if (typedInput) {
    typedInput.addEventListener('input', () => {
      typedText = typedInput.value;
      updateTypedPreview();
    });
  }

  // Font picker
  document.querySelectorAll('.sig-font-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sig-font-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      typedFont = btn.dataset.font;
      updateTypedPreview();
    });
  });
}

function applyStyleToPad() {
  const preset = STYLE_PRESETS[currentStyle] || STYLE_PRESETS.natural;
  if (signaturePad) {
    signaturePad.minWidth = currentWidth * preset.minFactor;
    signaturePad.maxWidth = currentWidth * preset.maxFactor;
  }
}

function updateTypedPreview() {
  const preview = document.getElementById('sig-typed-preview');
  if (!preview) return;
  if (!typedText.trim()) {
    preview.innerHTML = '<span class="typed-placeholder">Your signature preview</span>';
    return;
  }
  preview.style.fontFamily = `'${typedFont}', cursive`;
  preview.textContent = typedText;
}

export function getSignatureDataUrl() {
  // Typed mode: render text to a canvas
  if (typedMode) {
    if (!typedText.trim()) return null;
    return renderTypedSignature(typedText, typedFont);
  }

  // Draw mode
  if (!signaturePad || signaturePad.isEmpty()) return null;

  const originalCanvas = signaturePad.canvas;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = originalCanvas.width;
  tempCanvas.height = originalCanvas.height;
  const ctx = tempCanvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  ctx.drawImage(originalCanvas, 0, 0);

  // Optional "ink" style shadow effect
  const preset = STYLE_PRESETS[currentStyle] || STYLE_PRESETS.natural;
  if (preset.shadow) {
    ctx.shadowColor = currentColor;
    ctx.shadowBlur = 0;
    ctx.drawImage(originalCanvas, 0, 0);
  }

  return tempCanvas.toDataURL('image/png');
}

function renderTypedSignature(text, font) {
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const W = 800;
  const H = 300;

  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Fit font size to text length
  let fontSize = 120;
  const maxWidth = W - 80;
  ctx.font = `${fontSize}px '${font}', cursive`;

  while (ctx.measureText(text).width > maxWidth && fontSize > 30) {
    fontSize -= 4;
    ctx.font = `${fontSize}px '${font}', cursive`;
  }

  ctx.fillStyle = currentColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);

  return canvas.toDataURL('image/png');
}

export function resetSignaturePad() {
  if (signaturePad) {
    signaturePad.clear();
    document.getElementById('sig-canvas-wrap')?.classList.remove('has-ink');
  }
  const typedInput = document.getElementById('sig-typed-input');
  if (typedInput) {
    typedInput.value = '';
    typedText = '';
    updateTypedPreview();
  }
}