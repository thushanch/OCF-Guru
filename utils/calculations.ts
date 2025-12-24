
import { ChannelType, InputParams, CalculationResult, SectionProperties, UnitSystem, ProfilePoint, BoundaryCondition, CanalSectionInput } from '../types';

const MAX_ITER = 100;
const TOLERANCE = 1e-6;

const UNIT_CONSTANTS = {
  SI: { G: 9.81, K: 1.0 },
  Imperial: { G: 32.2, K: 1.486 }
};

interface Geometry {
  A: number;
  P: number;
  T: number;
  centroidDepth: number;
}

export const getGeometry = (type: ChannelType, y: number, p: InputParams): Geometry => {
  let A = 0, P = 0, T = 0, centroidDepth = 0;
  if (y <= 0) return { A: 0.0001, P: 0.0001, T: 0.0001, centroidDepth: 0 };

  switch (type) {
    case ChannelType.Rectangular:
      A = p.width * y;
      P = p.width + 2 * y;
      T = p.width;
      centroidDepth = y / 2;
      break;
    case ChannelType.Trapezoidal:
      A = (p.width + p.sideSlope * y) * y;
      P = p.width + 2 * y * Math.sqrt(1 + p.sideSlope * p.sideSlope);
      T = p.width + 2 * p.sideSlope * y;
      centroidDepth = y - (y / 3) * ((2 * T + p.width) / (T + p.width));
      break;
    case ChannelType.Triangular:
      A = p.sideSlope * y * y;
      P = 2 * y * Math.sqrt(1 + p.sideSlope * p.sideSlope);
      T = 2 * p.sideSlope * y;
      centroidDepth = y / 3;
      break;
    case ChannelType.Circular:
      const D = p.diameter;
      const depth = Math.min(y, D * 0.9999);
      const r = D / 2;
      const theta = 2 * Math.acos(1 - (2 * depth) / D);
      A = (Math.pow(D, 2) / 8) * (theta - Math.sin(theta));
      P = r * theta;
      T = D * Math.sin(theta / 2);
      const alpha = theta / 2;
      const segCentroidFromCenter = (2 * D * Math.pow(Math.sin(alpha), 3)) / (3 * (theta - Math.sin(theta)));
      centroidDepth = (depth - r) + segCentroidFromCenter;
      break;
  }
  return { A, P, T, centroidDepth };
};

export const solveNormalDepth = (type: ChannelType, p: InputParams, unit: UnitSystem): number => {
  const { K } = UNIT_CONSTANTS[unit];
  if (p.slope <= 0) return 10; // Default flat
  const target = (p.flowRate * p.manningN) / (K * Math.sqrt(p.slope));
  let min = 0, max = type === ChannelType.Circular ? p.diameter * 0.99 : 100;
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (min + max) / 2;
    const geom = getGeometry(type, mid, p);
    const val = geom.A * Math.pow(geom.A / geom.P, 2 / 3);
    if (Math.abs(val - target) < TOLERANCE) return mid;
    if (val < target) min = mid; else max = mid;
  }
  return (min + max) / 2;
};

const solveCriticalDepth = (type: ChannelType, p: InputParams, unit: UnitSystem): number => {
  const { G } = UNIT_CONSTANTS[unit];
  const Q2 = Math.pow(p.flowRate, 2);
  let min = 0, max = type === ChannelType.Circular ? p.diameter * 0.99 : 100;
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (min + max) / 2;
    const geom = getGeometry(type, mid, p);
    const val = G * Math.pow(geom.A, 3) - Q2 * geom.T;
    if (Math.abs(val) < TOLERANCE) return mid;
    if (val < 0) min = mid; else max = mid;
  }
  return (min + max) / 2;
};

export const calculateMultiReachProfile = (
  type: ChannelType, 
  baseParams: InputParams, 
  sections: CanalSectionInput[], 
  bc: BoundaryCondition,
  unit: UnitSystem,
  stepCount: number = 40
): ProfilePoint[] => {
  const { G, K } = UNIT_CONSTANTS[unit];
  const totalSections = sections.length;
  const isDownstreamControl = bc.location === 'Downstream';
  
  // 1. Pre-process sections to get slopes and elevations
  const computedSections = sections.map((s, i) => {
    let slope = s.slope;
    if (s.inputMode === 'Elevation') {
      slope = (s.usElevation - s.dsElevation) / s.length;
    }
    return { ...s, slope };
  });

  // 2. Solve global bed elevations
  const zNodes = new Array(totalSections + 1).fill(null);
  computedSections.forEach((s, i) => {
    if (s.inputMode === 'Elevation') {
      zNodes[i] = s.usElevation;
      zNodes[i+1] = s.dsElevation;
    }
  });
  if (zNodes[0] === null) zNodes[0] = 100; 
  for(let i=0; i<totalSections; i++) {
    if (zNodes[i+1] === null) zNodes[i+1] = zNodes[i] - computedSections[i].slope * computedSections[i].length;
  }
  for(let i=totalSections-1; i>=0; i--) {
    if (zNodes[i] === null) zNodes[i] = zNodes[i+1] + computedSections[i].slope * computedSections[i].length;
  }

  // 3. Calculation Logic
  const allPoints: ProfilePoint[] = [];
  let currentDepth = bc.value;

  const solveSection = (secIdx: number, startDepth: number) => {
    const s = computedSections[secIdx];
    const sParams = { ...baseParams, slope: s.slope };
    const yn = solveNormalDepth(type, sParams, unit);
    const yc = solveCriticalDepth(type, sParams, unit);
    
    let y = startDepth;
    const dx = s.length / stepCount;
    const sign = isDownstreamControl ? -1 : 1;
    const localPts: ProfilePoint[] = [];

    for (let i = 0; i <= stepCount; i++) {
      const localX = isDownstreamControl ? s.length - i * dx : i * dx;
      const globalX = sections.slice(0, secIdx).reduce((acc, curr) => acc + curr.length, 0) + localX;
      const bedZ = zNodes[secIdx] - s.slope * localX;

      localPts.push({
        distance: globalX,
        bedElevation: bedZ,
        waterElevation: bedZ + y,
        depth: y,
        normalDepthElevation: bedZ + yn,
        criticalDepthElevation: bedZ + yc,
        sectionIndex: secIdx,
        regime: y > yn ? (y > yc ? 'M1' : 'M3') : (y > yc ? 'M2' : 'S2') // Simplified label
      });

      if (i < stepCount) {
        // Standard Step Calculation for next y
        const geom = getGeometry(type, y, sParams);
        const V = baseParams.flowRate / geom.A;
        const Sf = Math.pow((sParams.manningN * V) / (K * Math.pow(geom.A / geom.P, 2/3)), 2);
        const Fr2 = (V * V) / (G * (geom.A / geom.T));
        const dy = ((s.slope - Sf) / (1 - Fr2)) * (sign * dx);
        
        y += dy;
        // Clamp to avoid singularities
        if (y < yc * 0.95 && y > yc * 1.05) {} // Normal
        else if (Math.abs(y - yc) < 0.05) y = yc * (y < yc ? 0.95 : 1.05);
        if (y <= 0) y = 0.01;
      }
    }
    return { points: localPts, endDepth: y };
  };

  const order = isDownstreamControl 
    ? Array.from({length: totalSections}, (_, i) => totalSections - 1 - i)
    : Array.from({length: totalSections}, (_, i) => i);

  for (const idx of order) {
    const { points, endDepth } = solveSection(idx, currentDepth);
    allPoints.push(...points);
    currentDepth = endDepth;
  }

  return allPoints.sort((a, b) => a.distance - b.distance);
};

export const calculateSectionProperties = (type: ChannelType, y: number, p: InputParams, unit: UnitSystem): SectionProperties => {
  const { G } = UNIT_CONSTANTS[unit];
  const geom = getGeometry(type, y, p);
  const V = geom.A > 0 ? p.flowRate / geom.A : 0;
  const E = y + (Math.pow(V, 2) / (2 * G));
  const M = (geom.A > 0) ? (Math.pow(p.flowRate, 2) / (G * geom.A)) + (geom.A * geom.centroidDepth) : 0;
  return { depth: y, area: geom.A, perimeter: geom.P, hydraulicRadius: geom.P > 0 ? geom.A / geom.P : 0, topWidth: geom.T, specificEnergy: E, specificForce: M, velocity: V };
};

export const calculateFlow = (type: ChannelType, p: InputParams, unit: UnitSystem = 'SI'): CalculationResult => {
  try {
    const yn = solveNormalDepth(type, p, unit);
    const yc = solveCriticalDepth(type, p, unit);
    const { G } = UNIT_CONSTANTS[unit];
    const geomN = getGeometry(type, yn, p);
    const V = p.flowRate / geomN.A;
    const Fr = V / Math.sqrt(G * (geomN.A / geomN.T));
    const regime = Fr < 0.98 ? 'Subcritical' : Fr > 1.02 ? 'Supercritical' : 'Critical';
    return { normalDepth: yn, criticalDepth: yc, velocity: V, froudeNumber: Fr, flowRegime: regime, criticalVelocity: p.flowRate / getGeometry(type, yc, p).A };
  } catch (e: any) {
    return { normalDepth: 0, criticalDepth: 0, velocity: 0, froudeNumber: 0, flowRegime: 'Critical', criticalVelocity: 0, error: e.message };
  }
};
