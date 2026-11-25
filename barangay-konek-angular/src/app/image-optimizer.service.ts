import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ImageOptimizerService {
  async optimize(
    file: File,
    options: { maxDimension?: number; maxInputBytes?: number; maxOutputBytes?: number; quality?: number } = {},
  ): Promise<string> {
    const maxDimension = options.maxDimension ?? 1280;
    const maxInputBytes = options.maxInputBytes ?? 10 * 1024 * 1024;
    const maxOutputBytes = options.maxOutputBytes ?? 550 * 1024;
    const quality = options.quality ?? 0.82;
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
    if (file.size > maxInputBytes) throw new Error(`Choose an image smaller than ${Math.round(maxInputBytes / 1024 / 1024)} MB.`);

    const bitmap = await createImageBitmap(file);
    try {
      let dimension = Math.min(maxDimension, Math.max(bitmap.width, bitmap.height));
      let outputQuality = quality;
      for (let attempt = 0; attempt < 8; attempt++) {
        const scale = Math.min(1, dimension / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image processing is unavailable in this browser.');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', outputQuality);
        if (dataUrl.length * 0.75 <= maxOutputBytes) return dataUrl;
        dimension = Math.max(64, Math.floor(dimension * 0.8));
        outputQuality = Math.max(0.62, outputQuality - 0.06);
      }
      throw new Error('The image could not be reduced enough to save.');
    } finally {
      bitmap.close();
    }
  }
}
