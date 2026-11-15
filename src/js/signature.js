let signaturePad = null;

export function initSignaturePad() {
  const canvas = document.getElementById('signature-canvas');
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  canvas.getContext('2d').scale(ratio, ratio);

  if (signaturePad) signaturePad.off();

  signaturePad = new SignaturePad(canvas, {
    penColor: '#0F172A',
    minWidth: 1.2,
    maxWidth: 2.8,
    backgroundColor: 'rgba(255,255,255,0)'
  });
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
  if (signaturePad) signaturePad.clear();
}