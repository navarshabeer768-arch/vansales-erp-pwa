import { useRef, useState, useEffect } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  label?: string;
}

export function SignaturePad({ onChange, label = 'Signature' }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current!.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="label !mb-0">{label}</label>
        {hasDrawn && (
          <button type="button" onClick={clear} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600">
            <Eraser size={12} /> Clear
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="w-full touch-none rounded-lg border border-slate-300 bg-white dark:border-slate-600"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <p className="mt-1 text-xs text-slate-400">Sign with mouse, finger, or stylus.</p>
    </div>
  );
}
