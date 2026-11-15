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
  // Measure signatures relative to the preview content (not the padded wrapper)
  const content = container.querySelector('.docx-preview-content') || container;
  const contentRect = content.getBoundingClientRect();
  const signatures = [];

  for (const el of signatureEls) {
    const img = el.querySelector('img');
    if (!img) continue;

    const imgRect = img.getBoundingClientRect();

    const relX = (imgRect.left - contentRect.left) / contentRect.width;
    const relY = (imgRect.top - contentRect.top) / contentRect.height;
    const relW = imgRect.width / contentRect.width;
    const relH = imgRect.height / contentRect.height;

    signatures.push({
      dataUrl: img.src,
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