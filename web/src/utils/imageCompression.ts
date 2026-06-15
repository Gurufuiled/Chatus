const MAX_QUICK_SEND_DIMENSION = 2048;
const JPEG_QUALITY = 0.82;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
      type,
      quality,
    );
  });
}

/** Resize/compress raster images for quick send; returns original file when not applicable. */
export async function compressImageForQuickSend(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  try {
    const img = await loadImage(file);
    const maxSide = Math.max(img.naturalWidth, img.naturalHeight);
    if (maxSide <= MAX_QUICK_SEND_DIMENSION && file.size < 1_500_000) {
      return file;
    }

    const scale = Math.min(1, MAX_QUICK_SEND_DIMENSION / maxSide);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type;
    const blob = await canvasToBlob(canvas, outputType, JPEG_QUALITY);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    const ext = outputType === 'image/png' ? 'png' : 'jpg';
    return new File([blob], `${baseName}.${ext}`, { type: outputType, lastModified: Date.now() });
  } catch {
    return file;
  }
}
