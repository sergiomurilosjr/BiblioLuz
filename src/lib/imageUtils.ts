/**
 * Resizes and compresses an image data URL or File to a lightweight JPEG data URL
 * suitable for storing safely within Firestore document limits (max ~150KB).
 */
export async function compressCoverImage(
  source: string | File,
  maxWidth = 420,
  maxHeight = 600,
  maxChars = 180000
): Promise<string> {
  const dataUrl = typeof source === 'string' ? source : await readFileAsDataUrl(source);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= 0 || height <= 0) {
        reject(new Error('Dimensões da imagem inválidas.'));
        return;
      }

      const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
      const targetWidth = Math.round(width * ratio);
      const targetHeight = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível processar a imagem.'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      let quality = 0.78;
      let output = canvas.toDataURL('image/jpeg', quality);

      while (output.length > maxChars && quality > 0.35) {
        quality -= 0.1;
        output = canvas.toDataURL('image/jpeg', quality);
      }

      resolve(output);
    };
    img.onerror = () => reject(new Error('Erro ao carregar a imagem capturada.'));
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao ler arquivo de imagem.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}
