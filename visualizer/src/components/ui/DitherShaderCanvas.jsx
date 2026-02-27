import { useEffect, useRef } from 'react';

const BAYER_4X4 = [
  0 / 16,
  8 / 16,
  2 / 16,
  10 / 16,
  12 / 16,
  4 / 16,
  14 / 16,
  6 / 16,
  3 / 16,
  11 / 16,
  1 / 16,
  9 / 16,
  15 / 16,
  7 / 16,
  13 / 16,
  5 / 16
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const sanitized = String(hex || '').replace('#', '');
  const value = sanitized.length === 3
    ? sanitized
        .split('')
        .map((part) => `${part}${part}`)
        .join('')
    : sanitized;

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function sampleThreshold({ ditherMode, x, y, gridSize, threshold, phase }) {
  if (ditherMode === 'bayer') {
    const bayer = BAYER_4X4[((Math.floor(y / gridSize) % 4) * 4) + (Math.floor(x / gridSize) % 4)];
    return threshold + (bayer - 0.5) * 0.34;
  }

  if (ditherMode === 'noise') {
    const noise = 0.24 * Math.sin((x * 0.07) + (y * 0.11) + phase);
    return threshold + noise;
  }

  return threshold;
}

function fillPixel({ context, colorMode, level, limit, primary, secondary, x, y, size }) {
  if (colorMode === 'grayscale') {
    const value = clamp(level, 0, 1);
    const grayscale = Math.floor(value * 255);
    context.fillStyle = `rgb(${grayscale}, ${grayscale}, ${grayscale})`;
    context.fillRect(x, y, size, size);
    return;
  }

  const useAccent = level > limit;
  const fill = useAccent ? secondary : primary;
  context.fillStyle = `rgb(${fill.r}, ${fill.g}, ${fill.b})`;
  context.fillRect(x, y, size, size);
}

function drawDitherFrame({
  canvas,
  image,
  width,
  height,
  gridSize,
  threshold,
  phase,
  ditherMode,
  colorMode,
  primary,
  secondary,
  contrast,
  brightness
}) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return;
  }

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const off = offscreen.getContext('2d', { willReadFrequently: true });
  if (!off) {
    return;
  }

  const imageRatio = image.width / image.height;
  const canvasRatio = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (imageRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
    offsetX = (width - drawWidth) * 0.5;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
    offsetY = (height - drawHeight) * 0.5;
  }

  off.clearRect(0, 0, width, height);
  off.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const data = off.getImageData(0, 0, width, height).data;
  context.clearRect(0, 0, width, height);

  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      const px = Math.min(width - 1, x + Math.floor(gridSize * 0.5));
      const py = Math.min(height - 1, y + Math.floor(gridSize * 0.5));
      const index = (py * width + px) * 4;

      const red = data[index] / 255;
      const green = data[index + 1] / 255;
      const blue = data[index + 2] / 255;

      let luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      luminance = clamp((luminance - 0.5) * contrast + 0.5 + brightness, 0, 1);

      const limit = sampleThreshold({ ditherMode, x, y, gridSize, threshold, phase });
      fillPixel({
        context,
        colorMode,
        level: luminance,
        limit,
        primary,
        secondary,
        x,
        y,
        size: gridSize
      });
    }
  }
}

export default function DitherShaderCanvas({
  src,
  className = '',
  gridSize = 1,
  ditherMode = 'bayer',
  colorMode = 'duotone',
  primaryColor = '#1e3a5f',
  secondaryColor = '#f0e68c',
  threshold = 0.45,
  animated = true,
  contrast = 1.12,
  brightness = -0.02
}) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas || !src) {
      return undefined;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';

    let raf = 0;
    let mounted = true;
    let phase = 0;

    const primary = hexToRgb(primaryColor);
    const secondary = hexToRgb(secondaryColor);

    const render = () => {
      if (!mounted || !image.complete || !wrapper) {
        return;
      }

      const rect = wrapper.getBoundingClientRect();
      const width = Math.max(8, Math.floor(rect.width));
      const height = Math.max(8, Math.floor(rect.height));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      drawDitherFrame({
        canvas,
        image,
        width,
        height,
        gridSize: Math.max(1, Math.floor(gridSize)),
        threshold,
        phase,
        ditherMode,
        colorMode,
        primary,
        secondary,
        contrast,
        brightness
      });

      if (animated) {
        phase += 0.12;
        raf = window.requestAnimationFrame(render);
      }
    };

    const observer = new ResizeObserver(() => {
      phase += 0.05;
      render();
    });

    image.onload = () => {
      if (!mounted) {
        return;
      }
      observer.observe(wrapper);
      render();
    };

    image.src = src;

    return () => {
      mounted = false;
      observer.disconnect();
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [animated, brightness, colorMode, contrast, ditherMode, gridSize, primaryColor, secondaryColor, src, threshold]);

  return (
    <div ref={wrapperRef} className={`dither-canvas-wrap ${className}`.trim()}>
      <canvas ref={canvasRef} />
    </div>
  );
}
