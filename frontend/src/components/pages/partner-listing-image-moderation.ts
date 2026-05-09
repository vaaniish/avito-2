export type ImageModerationSignal =
  | "image_exact_duplicate"
  | "image_near_duplicate"
  | "image_low_contrast"
  | "image_low_resolution"
  | "image_similar_composition";

type ImageFingerprint = {
  index: number;
  width: number;
  height: number;
  averageHash: string;
  compositionHash: string;
  mean: number;
  contrast: number;
};

const HASH_SIZE = 8;
const SAMPLE_SIZE = 32;
const MIN_REASONABLE_SIDE = 600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось прочитать фото"));
    image.src = src;
  });
}

function drawImageToCanvas(
  image: HTMLImageElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  return context;
}

function luminanceAt(data: Uint8ClampedArray, offset: number): number {
  return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
}

function hashFromContext(context: CanvasRenderingContext2D, size: number): string {
  const { data } = context.getImageData(0, 0, size, size);
  const values: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    values.push(luminanceAt(data, i));
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => (value >= average ? "1" : "0")).join("");
}

function compositionHashFromContext(context: CanvasRenderingContext2D): string {
  const size = SAMPLE_SIZE;
  const cell = size / 4;
  const values: number[] = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const { data } = context.getImageData(x * cell, y * cell, cell, cell);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += luminanceAt(data, i);
      }
      values.push(sum / (data.length / 4));
    }
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => (value >= average ? "1" : "0")).join("");
}

function hammingDistance(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let i = 0; i < length; i += 1) {
    if (left[i] !== right[i]) distance += 1;
  }
  return distance;
}

async function fingerprintImage(src: string, index: number): Promise<ImageFingerprint | null> {
  try {
    const image = await loadImage(src);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const hashContext = drawImageToCanvas(image, HASH_SIZE, HASH_SIZE);
    const sampleContext = drawImageToCanvas(image, SAMPLE_SIZE, SAMPLE_SIZE);
    if (!hashContext || !sampleContext) return null;

    const { data } = sampleContext.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const values: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      values.push(luminanceAt(data, i));
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

    return {
      index,
      width,
      height,
      averageHash: hashFromContext(hashContext, HASH_SIZE),
      compositionHash: compositionHashFromContext(sampleContext),
      mean,
      contrast: Math.sqrt(variance),
    };
  } catch {
    return null;
  }
}

export async function analyzeListingImagesForModeration(
  images: string[],
): Promise<ImageModerationSignal[]> {
  const signals = new Set<ImageModerationSignal>();
  const exactImages = new Set<string>();
  for (const image of images) {
    if (exactImages.has(image)) {
      signals.add("image_exact_duplicate");
      break;
    }
    exactImages.add(image);
  }

  const fingerprints = (
    await Promise.all(images.map((image, index) => fingerprintImage(image, index)))
  ).filter((item): item is ImageFingerprint => Boolean(item));

  for (const fingerprint of fingerprints) {
    if (fingerprint.width < MIN_REASONABLE_SIDE || fingerprint.height < MIN_REASONABLE_SIDE) {
      signals.add("image_low_resolution");
    }
    if (fingerprint.contrast < 10) {
      signals.add("image_low_contrast");
    }
  }

  let similarCompositionPairs = 0;
  for (let i = 0; i < fingerprints.length; i += 1) {
    for (let j = i + 1; j < fingerprints.length; j += 1) {
      const hashDistance = hammingDistance(
        fingerprints[i].averageHash,
        fingerprints[j].averageHash,
      );
      if (hashDistance <= 5) {
        signals.add("image_near_duplicate");
      }
      const compositionDistance = hammingDistance(
        fingerprints[i].compositionHash,
        fingerprints[j].compositionHash,
      );
      if (compositionDistance <= 2) {
        similarCompositionPairs += 1;
      }
    }
  }

  if (fingerprints.length >= 3 && similarCompositionPairs >= 2) {
    signals.add("image_similar_composition");
  }

  return Array.from(signals);
}
