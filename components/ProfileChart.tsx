
import React, { useEffect, useRef } from 'react';
import { ProfilePoint } from '../types';

interface Props {
  data: ProfilePoint[];
  unitLabel: string;
}

const ProfileChart: React.FC<Props> = ({ data, unitLabel }) => {
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
    const PADDING_T = 30;
    const PADDING_B = 40;
    const DRAW_W = w - PADDING_L - PADDING_R;
    const DRAW_H = h - PADDING_T - PADDING_B;

    // Ranges
    const distances = data.map(d => d.distance);
    // Gather all elevations to find Y min/max
    const elevations = data.flatMap(d => [d.bedElevation, d.waterElevation, d.normalDepthElevation, d.criticalDepthElevation]);
    
    const minX = Math.min(...distances);
    const maxX = Math.max(...distances);
    let minZ = Math.min(...elevations);
    let maxZ = Math.max(...elevations);

    // Add some padding to Y axis
    const rangeZ = maxZ - minZ || 1;
    minZ -= rangeZ * 0.1;
    maxZ += rangeZ * 0.1;
    
    const rangeX = maxX - minX || 1;
    const finalRangeZ = maxZ - minZ || 1;

    // Helpers
    const toX = (dist: number) => PADDING_L + ((dist - minX) / rangeX) * DRAW_W;
    const toY = (elev: number) => PADDING_T + DRAW_H - ((elev - minZ) / finalRangeZ) * DRAW_H;

    // --- Grid & Axes ---
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Vertical Grid
    for (let i = 0; i <= 5; i++) {
      const x = PADDING_L + (DRAW_W * i) / 5;
      ctx.moveTo(x, PADDING_T);
      ctx.lineTo(x, h - PADDING_B);
      // Label
      const dVal = minX + (rangeX * i) / 5;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dVal.toFixed(0), x, h - PADDING_B + 15);
    }
    
    // Horizontal Grid
    for (let i = 0; i <= 5; i++) {
      const y = PADDING_T + (DRAW_H * i) / 5;
      ctx.moveTo(PADDING_L, y);
      ctx.lineTo(w - PADDING_R, y);
      // Label
      const zVal = maxZ - (finalRangeZ * i) / 5;
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(zVal.toFixed(2), PADDING_L - 8, y + 3);
    }
    ctx.stroke();

    // Axis Titles
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Distance (${unitLabel})`, w / 2 + PADDING_L / 2, h - 5);
    
    ctx.save();
    ctx.translate(15, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Elevation (${unitLabel})`, 0, 0);
    ctx.restore();

    // --- Draw Lines ---
    // Handle discontinuities (jumps) between sections if they are far apart in data array
    // Our data is sorted by distance. Small dx steps are connected. Large jumps imply breaks or sections.
    // The data includes 'sectionIndex'. We can lift pen between sections if needed.
    // But usually we want continuous drawing within sections.

    const drawProfileLine = (accessor: (p: ProfilePoint) => number, color: string, width: number, dashed: boolean = false) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dashed) ctx.setLineDash([5, 5]);
      else ctx.setLineDash([]);
      
      let lastSectionIdx = -1;

      data.forEach((p, i) => {
        const x = toX(p.distance);
        const y = toY(accessor(p));
        
        if (i === 0 || p.sectionIndex !== lastSectionIdx) {
            ctx.moveTo(x, y);
            // If strictly continuous physically, we might want to lineTo, but Bed can drop.
            // Let's assume bed drops are vertical lines? 
            // If i > 0 and distance is same (vertical drop), lineTo works.
        } else {
            ctx.lineTo(x, y);
        }
        lastSectionIdx = p.sectionIndex;
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // 1. Bed (Brown)
    drawProfileLine(d => d.bedElevation, '#78350f', 3);
    
    // 2. Critical Depth (Red Dashed)
    drawProfileLine(d => d.criticalDepthElevation, '#ef4444', 1.5, true);

    // 3. Normal Depth (Green Dashed)
    drawProfileLine(d => d.normalDepthElevation, '#10b981', 1.5, true);

    // 4. Water Surface (Blue)
    drawProfileLine(d => d.waterElevation, '#0ea5e9', 3);

    // Fill Water (Tricky with multi-sections/jumps, simplistic fill for now)
    // We fill polygon: Bed points -> Water points reversed.
    // Do per section to be safe.
    
    ctx.fillStyle = '#0ea5e920';
    const uniqueSections = Array.from(new Set(data.map(d => d.sectionIndex)));
    
    uniqueSections.forEach(secIdx => {
        const secPts = data.filter(d => d.sectionIndex === secIdx);
        if (secPts.length < 2) return;

        ctx.beginPath();
        // Trace Bed
        secPts.forEach((p, i) => {
            if (i===0) ctx.moveTo(toX(p.distance), toY(p.bedElevation));
            else ctx.lineTo(toX(p.distance), toY(p.bedElevation));
        });
        // Trace Water backwards
        for(let i=secPts.length-1; i>=0; i--) {
            ctx.lineTo(toX(secPts[i].distance), toY(secPts[i].waterElevation));
        }
        ctx.closePath();
        ctx.fill();
    });


    // --- Legend ---
    const legendY = PADDING_T + 10;
    const legendX = PADDING_L + 20;
    
    const drawLegendItem = (label: string, color: string, y: number, dashed: boolean) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (dashed) ctx.setLineDash([3, 3]);
      ctx.moveTo(legendX, y);
      ctx.lineTo(legendX + 20, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'left';
      ctx.font = '10px sans-serif';
      ctx.fillText(label, legendX + 28, y + 3);
    };

    drawLegendItem("Water Surface", "#0ea5e9", legendY, false);
    drawLegendItem("Normal Depth", "#10b981", legendY + 15, true);
    drawLegendItem("Critical Depth", "#ef4444", legendY + 30, true);
    drawLegendItem("Channel Bed", "#78350f", legendY + 45, false);

  }, [data, unitLabel]);

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

export default ProfileChart;
