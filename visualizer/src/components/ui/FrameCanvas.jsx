import { useEffect, useRef } from 'react';

const IMAGE_CACHE = new Map();

function loadImage(src) {
  if (!src) {
    return Promise.resolve(null);
  }
  if (IMAGE_CACHE.has(src)) {
    return IMAGE_CACHE.get(src);
  }

  const imagePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to decode frame: ${src}`));
    image.src = src;
  });
  IMAGE_CACHE.set(src, imagePromise);
  return imagePromise;
}

function drawFrame(canvas, image) {
  const context = canvas.getContext('2d');
  if (!context || !image) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const imageAspect = image.width / image.height;
  const canvasAspect = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (imageAspect > canvasAspect) {
    drawHeight = height;
    drawWidth = height * imageAspect;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / imageAspect;
    offsetY = (height - drawHeight) / 2;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

export default function FrameCanvas({ src, className = '', alt = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !src) {
      return undefined;
    }

    let resizeObserver = null;
    let currentImage = null;

    loadImage(src)
      .then((image) => {
        if (cancelled) {
          return;
        }
        currentImage = image;
        drawFrame(canvas, image);
        resizeObserver = new ResizeObserver(() => drawFrame(canvas, image));
        resizeObserver.observe(canvas);
      })
      .catch(() => {
        // Render failures should not crash the timeline.
      });

    return () => {
      cancelled = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      currentImage = null;
    };
  }, [src]);

  return <canvas ref={canvasRef} className={`frame-canvas ${className}`.trim()} aria-label={alt} />;
}
