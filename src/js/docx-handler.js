const mammoth = window.mammoth;

export async function handleDocx(file, container) {
  const arrayBuffer = await file.arrayBuffer();

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement((image) => {
        return image.read('base64').then((imageBuffer) => {
          return { src: `data:${image.contentType};base64,${imageBuffer}` };
        });
      })
    }
  );

  container.innerHTML = `<div class="docx-preview-content">${result.value}</div>`;

  return {
    arrayBuffer,
    fileName: file.name,
    file
  };
}

export async function embedSignaturesIntoDocx(docxState, container, signatureEls) {
  const content = container.querySelector('.docx-preview-content') || container;
  const contentRect = content.getBoundingClientRect();
  const signatures = [];

  // Render each signature with its rotation baked in
  for (const el of signatureEls) {
    const img = el.querySelector('img');
    if (!img) continue;

    const rotation = parseFloat(el.dataset.rotation || '0');
    const rotatedDataUrl = await rotateImage(img.src, rotation);

    const imgRect = img.getBoundingClientRect();

    const relX = (imgRect.left - contentRect.left) / contentRect.width;
    const relY = (imgRect.top  - contentRect.top)  / contentRect.height;
    const relW = imgRect.width  / contentRect.width;
    const relH = imgRect.height / contentRect.height;

    signatures.push({
      dataUrl: rotatedDataUrl,
      page: 1,
      x: Math.max(0, Math.min(1, relX)),
      y: Math.max(0, Math.min(1, relY)),
      width: Math.max(0.01, Math.min(1, relW)),
      height: Math.max(0.01, Math.min(1, relH))
    });
  }

  const formData = new FormData();
  formData.append('document', docxState.file);
  formData.append('signatures', JSON.stringify(signatures));

  const response = await fetch('/api/sign-docx', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    let errorMsg = 'Server processing failed';
    try {
      const err = await response.json();
      errorMsg = err.error || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `signed-${docxState.fileName.replace(/\.(doc|docx)$/i, '')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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