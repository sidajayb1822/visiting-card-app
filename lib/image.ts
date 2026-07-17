/** Longest edge of the JPEG we send to Gemini. */
const MAX_EDGE = 1600;

/** JPEG quality. 0.85 keeps small print legible without bloating the upload. */
const JPEG_QUALITY = 0.85;

/**
 * Scales a source down so its longest edge is at most MAX_EDGE, and encodes it
 * as a JPEG data URL.
 *
 * Phone cameras produce 4000px+ images that are several megabytes. Gemini reads
 * card text perfectly well at 1600px, and the smaller upload is the difference
 * between a snappy scan and a stalled one on venue wifi.
 */
export function toScaledJpeg(
  source: HTMLVideoElement | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
): string {
  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get a canvas context.");

  context.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * Reads a picked file (the native-camera fallback path) into a scaled JPEG.
 *
 * Goes through an <img> rather than the raw file so that a 12MP HEIC/JPEG from
 * the camera app gets the same downscale treatment as a live capture.
 */
export function fileToScaledJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        resolve(toScaledJpeg(image, image.naturalWidth, image.naturalHeight));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };

    image.src = url;
  });
}
