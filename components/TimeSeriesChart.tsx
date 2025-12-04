import React, { useEffect, useRef } from 'react';

interface DataPoint {
  time: number;
  value: number;
}

interface Props {
  data: DataPoint[];
  xLabel: string;
  yLabel: string;
  color: string;
}

const TimeSeriesChart: React.FC<Props> = ({ data, xLabel, yLabel, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const PADDING_L = 50;
    const PADDING_R = 20;
    const PADDING_T = 20;
    const PADDING_B = 40;
    const DRAW_W = w - PADDING_L - PADDING_R;
    const DRAW_H = h - PADDING_T - PADDING_B;

    // Determine Ranges
    const times = data.map(d => d.time);
    const values = data.map(d => d.value);
    
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const minV = Math.min(0, ...values); // Ensure 0 is included if data is positive
    const maxV = Math.max(...values) * 1.1; // Add 10% headroom

    const rangeT = maxT - minT || 1;
    const rangeV = maxV - minV || 1;

    // Helpers
    const toX = (t: number) => PADDING_L + ((t - minT) / rangeT) * DRAW_W;
    const toY = (v: number) => PADDING_T + DRAW_H - ((v - minV) / rangeV) * DRAW_H;

    // Draw Grid
    ctx.strokeStyle = '#e2e8f0'; // slate-200
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Vertical lines (Time) - 5 steps
    for (let i = 0; i <= 5; i++) {
        const x = PADDING_L + (DRAW_W * i) / 5;
        ctx.moveTo(x, PADDING_T);
        ctx.lineTo(x, h - PADDING_B);
        
        // Label
        const tVal = minT + (rangeT * i) / 5;
        ctx.fillStyle = '#64748b'; // slate-500
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tVal.toFixed(1), x, h - PADDING_B + 15);
    }

    // Horizontal lines (Value) - 5 steps
    for (let i = 0; i <= 5; i++) {
        const y = PADDING_T + (DRAW_H * i) / 5;
        ctx.moveTo(PADDING_L, y);
        ctx.lineTo(w - PADDING_R, y);
        
        // Label
        const vVal = maxV - (rangeV * i) / 5;
        ctx.fillStyle = '#64748b'; // slate-500
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(vVal.toFixed(2), PADDING_L - 8, y + 3);
    }
    ctx.stroke();

    // Axis Labels
    ctx.save();
    ctx.translate(15, h/2);
    ctx.rotate(-Math.PI/2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(xLabel, w/2 + PADDING_L/2, h - 5);

    // Draw Line Path
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    
    if (data.length > 0) {
        ctx.moveTo(toX(data[0].time), toY(data[0].value));
        for (let i = 1; i < data.length; i++) {
            ctx.lineTo(toX(data[i].time), toY(data[i].value));
        }
    }
    ctx.stroke();

    // Fill Area under curve
    ctx.fillStyle = color + '20'; // 20 hex = approx 12% alpha
    ctx.lineTo(toX(data[data.length-1].time), toY(0));
    ctx.lineTo(toX(data[0].time), toY(0));
    ctx.closePath();
    ctx.fill();

    // Draw Points
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const d of data) {
        const cx = toX(d.time);
        const cy = toY(d.value);
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

  }, [data, xLabel, yLabel, color]);

  return (
    <div className="w-full h-full min-h-[300px] bg-white rounded-lg">
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={400} 
        className="w-full h-full object-contain"
      />
    </div>
  );
};

export default TimeSeriesChart;