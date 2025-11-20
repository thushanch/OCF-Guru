import React, { useEffect, useRef } from 'react';
import { ChannelType, InputParams } from '../types';

interface Props {
  type: ChannelType;
  params: InputParams;
  displayDepth: number;
  criticalDepth?: number; // Optional reference
}

const ChannelVisualizer: React.FC<Props> = ({ type, params, displayDepth, criticalDepth }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Configuration for scaling
    const PADDING = 40;
    const DRAW_W = w - PADDING * 2;
    const DRAW_H = h - PADDING * 2;

    // Calculate Bounding Box of the Geometry
    // We need to fit the geometry + water level
    const maxDepthToRender = Math.max(displayDepth, criticalDepth || 0) * 1.2;
    
    let geomW = 0;
    let geomH = 0;

    // Determine dimensions based on shape
    if (type === ChannelType.Circular) {
      geomH = params.diameter;
      geomW = params.diameter;
    } else if (type === ChannelType.Rectangular) {
      geomH = Math.max(maxDepthToRender, params.width * 0.4); 
      geomW = params.width;
    } else if (type === ChannelType.Trapezoidal) {
      geomH = maxDepthToRender;
      const topWidth = params.width + 2 * params.sideSlope * geomH;
      geomW = topWidth;
    } else if (type === ChannelType.Triangular) {
      geomH = maxDepthToRender;
      geomW = 2 * params.sideSlope * geomH;
    }
    
    // Ensure minimums to prevent div by zero or bad scale
    if (geomH <= 0) geomH = 1;
    if (geomW <= 0) geomW = 1;

    // Calculate Scale
    const scaleX = DRAW_W / geomW;
    const scaleY = DRAW_H / geomH;
    const scale = Math.min(scaleX, scaleY);

    // Calculate Center Offsets
    // World coordinates: (0,0) is the bottom-center of the channel invert
    // Canvas coordinates: we want (0, geomH/2) in world to map to (w/2, h/2) in canvas
    // Actually, let's map the center of the bounding box to the center of the canvas.
    
    // World Bounding Box Center Y = geomH / 2
    // World Bounding Box Center X = 0 (since we build geometry symmetric around 0)
    
    // Canvas Center = (w/2, h/2)
    // Transformation: canvasX = w/2 + (worldX - centerX) * scale
    // Transformation: canvasY = h/2 - (worldY - centerY) * scale
    
    const worldCenterX = 0;
    const worldCenterY = geomH / 2;

    const toCanvas = (x: number, y: number) => ({
      x: w / 2 + (x - worldCenterX) * scale,
      y: h / 2 - (y - worldCenterY) * scale
    });

    // Draw Channel Geometry
    ctx.beginPath();
    ctx.strokeStyle = '#334155'; // slate-700
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (type === ChannelType.Circular) {
      const r = params.diameter / 2;
      const center = toCanvas(0, r);
      ctx.arc(center.x, center.y, r * scale, 0, 2 * Math.PI);
    } else if (type === ChannelType.Rectangular) {
      const halfB = params.width / 2;
      const p1 = toCanvas(-halfB, geomH);
      const p2 = toCanvas(-halfB, 0);
      const p3 = toCanvas(halfB, 0);
      const p4 = toCanvas(halfB, geomH);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
    } else if (type === ChannelType.Trapezoidal) {
      const halfB = params.width / 2;
      const topXOffset = params.sideSlope * geomH;
      const p1 = toCanvas(-halfB - topXOffset, geomH);
      const p2 = toCanvas(-halfB, 0);
      const p3 = toCanvas(halfB, 0);
      const p4 = toCanvas(halfB + topXOffset, geomH);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
    } else if (type === ChannelType.Triangular) {
      const topXOffset = params.sideSlope * geomH;
      const p1 = toCanvas(-topXOffset, geomH);
      const p2 = toCanvas(0, 0);
      const p3 = toCanvas(topXOffset, geomH);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
    }
    ctx.stroke();

    // Draw Water
    if (displayDepth > 0) {
      ctx.fillStyle = 'rgba(14, 165, 233, 0.3)'; // Sky blue transparent
      ctx.beginPath();

      if (type === ChannelType.Circular) {
        const r = params.diameter / 2;
        const center = toCanvas(0, r);
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(center.x, center.y, r * scale, 0, 2 * Math.PI);
        ctx.clip();
        
        const waterLevelY = toCanvas(0, displayDepth).y;
        const bottomY = toCanvas(0, 0).y;
        // Draw massive rect over bottom part
        ctx.beginPath();
        ctx.rect(0, waterLevelY, w, h); 
        ctx.fill();
        ctx.restore();

        // Surface Line
        const dy = r - displayDepth;
        if (Math.abs(dy) < r) {
          const chordHalfWidth = Math.sqrt(r*r - dy*dy);
          const pLeft = toCanvas(-chordHalfWidth, displayDepth);
          const pRight = toCanvas(chordHalfWidth, displayDepth);
          
          ctx.beginPath();
          ctx.strokeStyle = '#0ea5e9'; // brand-500
          ctx.lineWidth = 2;
          ctx.moveTo(pLeft.x, pLeft.y);
          ctx.lineTo(pRight.x, pRight.y);
          ctx.stroke();
        }
      } else {
        // Polygons
        let pBL, pBR, pTL, pTR;
        
        if (type === ChannelType.Rectangular) {
           const halfB = params.width / 2;
           pTL = toCanvas(-halfB, displayDepth);
           pTR = toCanvas(halfB, displayDepth);
           pBL = toCanvas(-halfB, 0);
           pBR = toCanvas(halfB, 0);
        } else if (type === ChannelType.Trapezoidal) {
           const halfB = params.width / 2;
           const topOffset = params.sideSlope * displayDepth;
           pTL = toCanvas(-halfB - topOffset, displayDepth);
           pTR = toCanvas(halfB + topOffset, displayDepth);
           pBL = toCanvas(-halfB, 0);
           pBR = toCanvas(halfB, 0);
        } else { // Triangular
           const topOffset = params.sideSlope * displayDepth;
           pTL = toCanvas(-topOffset, displayDepth);
           pTR = toCanvas(topOffset, displayDepth);
           pBL = toCanvas(0, 0);
           pBR = toCanvas(0, 0);
        }

        ctx.moveTo(pBL.x, pBL.y);
        ctx.lineTo(pBR.x, pBR.y);
        ctx.lineTo(pTR.x, pTR.y);
        ctx.lineTo(pTL.x, pTL.y);
        ctx.closePath();
        ctx.fill();

        // Surface Line
        ctx.beginPath();
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.moveTo(pTL.x, pTL.y);
        ctx.lineTo(pTR.x, pTR.y);
        ctx.stroke();
      }
    }
    
    // Label Depth
    if (displayDepth > 0) {
        ctx.fillStyle = '#0369a1';
        ctx.font = 'bold 12px sans-serif';
        const lvl = toCanvas(0, displayDepth);
        // Adjust label position to not overlap too much
        ctx.fillText(`y = ${displayDepth.toFixed(3)}`, lvl.x + 5, lvl.y - 5);
    }

  }, [type, params, displayDepth, criticalDepth]);

  return (
    <div className="w-full h-full flex items-center justify-center rounded-lg relative">
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={500} 
        className="w-full h-full object-contain"
      />
    </div>
  );
};

export default ChannelVisualizer;
