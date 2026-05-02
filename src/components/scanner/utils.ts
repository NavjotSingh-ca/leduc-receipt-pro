/** Laplacian variance blur detection via greyscale canvas convolution */
export async function computeBlurScore(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(999);
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      // Convert to greyscale
      const grey: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        grey.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      // Laplacian kernel: [0,1,0,1,-4,1,0,1,0]
      let sumSq = 0;
      let count = 0;
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const idx = y * size + x;
          const lap =
            grey[idx - size] +
            grey[idx + size] +
            grey[idx - 1] +
            grey[idx + 1] -
            4 * grey[idx];
          sumSq += lap * lap;
          count++;
        }
      }
      resolve(count > 0 ? sumSq / count : 999);
    };
    img.onerror = () => resolve(999);
    img.src = dataUrl;
  });
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export async function resizeImage(
  dataUrl: string, 
  maxDimension: number, 
  quality: number, 
  outputMimeType = 'image/jpeg'
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longestSide = Math.max(width, height);

      if (longestSide > maxDimension) {
        const scale = maxDimension / longestSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas is not available.'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL(outputMimeType, quality));
    };
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = dataUrl;
  });
}
