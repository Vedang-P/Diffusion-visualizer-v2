import { useEffect, useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyDarken(channel, darken) {
  return Math.round(channel * clamp(1 - darken, 0, 1));
}

export default function WebcamPixelGrid({
  gridCols = 60,
  gridRows = 40,
  maxElevation = 50,
  motionSensitivity = 0.25,
  elevationSmoothing = 0.2,
  colorMode = 'webcam',
  backgroundColor = '#030303',
  mirror = true,
  gapRatio = 0.05,
  invertColors = false,
  darken = 0.6,
  borderColor = '#ffffff',
  borderOpacity = 0.06,
  className = '',
  onWebcamReady,
  onWebcamError,
  active = true,
  showFallbackMessage = true
}) {
  const canvasRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let animationId = 0;
    let stream = null;
    let resizeObserver = null;
    let mounted = true;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    const sampleCanvas = document.createElement('canvas');
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    const canvas = canvasRef.current;
    if (!canvas || !sampleContext) {
      return undefined;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }

    const cols = Math.max(8, Math.floor(gridCols));
    const rows = Math.max(8, Math.floor(gridRows));
    const cellCount = cols * rows;
    const previousLuma = new Float32Array(cellCount);
    const elevations = new Float32Array(cellCount);
    sampleCanvas.width = cols;
    sampleCanvas.height = rows;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const drawFrame = () => {
      if (!mounted) {
        return;
      }

      const width = canvas.width;
      const height = canvas.height;
      if (width < 1 || height < 1 || video.readyState < 2) {
        animationId = window.requestAnimationFrame(drawFrame);
        return;
      }

      sampleContext.drawImage(video, 0, 0, cols, rows);
      const frame = sampleContext.getImageData(0, 0, cols, rows);
      const pixels = frame.data;

      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, width, height);

      const cellWidth = width / cols;
      const cellHeight = height / rows;
      const gap = Math.max(0, Math.min(cellWidth, cellHeight) * gapRatio);
      const innerWidth = Math.max(1, cellWidth - gap);
      const innerHeight = Math.max(1, cellHeight - gap);
      const edgeAlpha = clamp(borderOpacity, 0, 1);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const sourceCol = mirror ? cols - 1 - col : col;
          const pixelIndex = (row * cols + sourceCol) * 4;
          const elevationIndex = row * cols + col;

          let red = pixels[pixelIndex];
          let green = pixels[pixelIndex + 1];
          let blue = pixels[pixelIndex + 2];

          if (invertColors) {
            red = 255 - red;
            green = 255 - green;
            blue = 255 - blue;
          }

          red = applyDarken(red, darken);
          green = applyDarken(green, darken);
          blue = applyDarken(blue, darken);

          const luma = (red + green + blue) / (255 * 3);
          const delta = Math.abs(luma - previousLuma[elevationIndex]);
          previousLuma[elevationIndex] = luma;

          const targetElevation = clamp((delta / Math.max(0.01, motionSensitivity)) * maxElevation, 0, maxElevation);
          const eased = elevations[elevationIndex] + (targetElevation - elevations[elevationIndex]) * clamp(elevationSmoothing, 0.02, 1);
          elevations[elevationIndex] = eased;

          const offsetY = eased * 0.18;
          const x = col * cellWidth + gap * 0.5;
          const y = row * cellHeight + gap * 0.5 - offsetY;
          const drawHeight = innerHeight + offsetY;

          if (colorMode !== 'webcam') {
            const mono = Math.round(luma * 255);
            red = mono;
            green = mono;
            blue = mono;
          }

          context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
          context.fillRect(x, y, innerWidth, drawHeight);

          if (edgeAlpha > 0) {
            context.strokeStyle = borderColor;
            context.globalAlpha = edgeAlpha;
            context.strokeRect(x + 0.5, y + 0.5, innerWidth - 1, drawHeight - 1);
            context.globalAlpha = 1;
          }
        }
      }

      animationId = window.requestAnimationFrame(drawFrame);
    };

    const start = async () => {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Webcam is not available in this browser.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        video.srcObject = stream;
        await video.play();

        if (!mounted) {
          return;
        }

        resizeCanvas();
        resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(canvas);

        if (typeof onWebcamReady === 'function') {
          onWebcamReady();
        }

        animationId = window.requestAnimationFrame(drawFrame);
      } catch (webcamError) {
        const message = webcamError instanceof Error ? webcamError.message : 'Unable to access webcam.';
        setError(message);
        if (typeof onWebcamError === 'function') {
          onWebcamError(webcamError);
        }
      }
    };

    start();

    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      video.pause();
      video.srcObject = null;
    };
  }, [
    active,
    backgroundColor,
    borderColor,
    borderOpacity,
    colorMode,
    darken,
    elevationSmoothing,
    gapRatio,
    gridCols,
    gridRows,
    invertColors,
    maxElevation,
    mirror,
    motionSensitivity,
    onWebcamError,
    onWebcamReady
  ]);

  return (
    <div className={`webcam-pixel-grid ${className}`.trim()}>
      <canvas ref={canvasRef} />
      {showFallbackMessage && error ? <p className="webcam-fallback">Webcam unavailable. {error}</p> : null}
    </div>
  );
}
