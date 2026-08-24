import { useEffect, useRef } from 'react';

interface WaveformProps {
  /** Live time-domain samples from the microphone, or null when idle. */
  samples: Float32Array | null;
  active: boolean;
}

/**
 * The signature element: a real oscilloscope trace of the user's own voice.
 *
 * Drawn from `getFloatTimeDomainData`, not from a canned animation loop, so the
 * feedback is genuinely theirs. When idle it settles to a flat rule, which is
 * also the visual the transcript card resolves into once speech is final.
 */
export function Waveform({ samples, active }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Eased amplitude, so the trace settles rather than snapping when speech stops.
  const decayRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const styles = getComputedStyle(canvas);
    const stroke = styles.getPropertyValue('--wave-color').trim() || '#8a2149';
    const rule = styles.getPropertyValue('--wave-rule').trim() || '#d2d8d0';

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const middle = height / 2;

    // Baseline rule: the resting state, and the line the trace collapses onto.
    context.strokeStyle = rule;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, middle);
    context.lineTo(width, middle);
    context.stroke();

    const target = active && samples ? 1 : 0;
    decayRef.current += (target - decayRef.current) * 0.25;
    const envelope = decayRef.current;

    if (!samples || envelope < 0.02) return;

    // Downsample to one column every ~2.5px: enough detail to read as speech,
    // cheap enough to redraw every frame on a phone.
    const columns = Math.max(24, Math.floor(width / 2.5));
    const step = Math.floor(samples.length / columns) || 1;

    context.strokeStyle = stroke;
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    context.beginPath();

    for (let column = 0; column < columns; column++) {
      let peak = 0;
      const start = column * step;
      for (let i = start; i < start + step && i < samples.length; i++) {
        const value = Math.abs(samples[i]!);
        if (value > peak) peak = value;
      }

      const x = (column / (columns - 1)) * width;
      // Taper the ends so the trace reads as a ribbon rather than a hard cut.
      const taper = Math.sin((column / (columns - 1)) * Math.PI) ** 0.5;
      const amplitude = Math.min(1, peak * 6) * (middle - 2) * envelope * taper;

      context.moveTo(x, middle - amplitude);
      context.lineTo(x, middle + amplitude);
    }

    context.stroke();
  }, [samples, active]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform"
      aria-hidden="true"
      style={
        {
          '--wave-color': 'var(--beet)',
          '--wave-rule': 'var(--line)',
        } as React.CSSProperties
      }
    />
  );
}
