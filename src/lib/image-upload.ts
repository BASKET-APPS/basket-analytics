export async function processPlayerPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido (PNG, JPEG o WebP)');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen inválido'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetWidth = 320;
        const targetHeight = 400;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }

        // Fit cover
        const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
        const x = (targetWidth - img.width * scale) / 2;
        const y = (targetHeight - img.height * scale) / 2;

        ctx.fillStyle = '#101D2F';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Export to WebP (fallback to JPEG)
        const dataUrl = canvas.toDataURL('image/webp', 0.82);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
