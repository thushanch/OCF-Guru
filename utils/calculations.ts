import { ChannelType, InputParams, CalculationResult, SectionProperties, UnitSystem } from '../types';

const MAX_ITER = 100;
const TOLERANCE = 1e-6;

// Unit Constants
const UNIT_CONSTANTS = {
  SI: { G: 9.81, K: 1.0 },
  Imperial: { G: 32.2, K: 1.486 }
};

// --- Geometric Helpers ---

interface Geometry {
  A: number;
  P: number;
  T: number;
  centroidDepth: number; // Depth of centroid from water surface
}

export const getGeometry = (type: ChannelType, y: number, p: InputParams): Geometry => {
  let A = 0, P = 0, T = 0, centroidDepth = 0;

  if (y <= 0) return { A: 0, P: 0, T: 0, centroidDepth: 0 };

  switch (type) {
    case ChannelType.Rectangular:
      A = p.width * y;
      P = p.width + 2 * y;
      T = p.width;
      centroidDepth = y / 2;
      break;
      
    case ChannelType.Trapezoidal:
      // A = y * (b + zy)
      // T = b + 2zy
      A = (p.width + p.sideSlope * y) * y;
      P = p.width + 2 * y * Math.sqrt(1 + p.sideSlope * p.sideSlope);
      T = p.width + 2 * p.sideSlope * y;
      
      // Centroid height from bottom (h_c)
      // For trapezoid with parallel sides a=T (top) and b=p.width (bottom)
      // h_c = (y * (2*T + b)) / (3 * (T + b))  <-- relative to top? No standard formula relative to parallel base b is y(2a+b)/3(a+b)
      // Let's use standard formula for y_bar from bottom:
      // y_bar_bottom = (y/3) * ( (2*T + p.width) / (T + p.width) )
      const y_bar_bottom = (y / 3) * ((2 * T + p.width) / (T + p.width));
      centroidDepth = y - y_bar_bottom;
      break;

    case ChannelType.Triangular:
      A = p.sideSlope * y * y;
      P = 2 * y * Math.sqrt(1 + p.sideSlope * p.sideSlope);
      T = 2 * p.sideSlope * y;
      // Centroid of triangle is y/3 from the base (top surface in this inverted triangle case)
      centroidDepth = y / 3; 
      break;

    case ChannelType.Circular:
      const D = p.diameter;
      // Clamp y to D for calculation stability if full
      let depth = y;
      if (depth > D) depth = D;
      
      const r = D / 2;
      // Theta is the central angle of the wetted area
      // theta = 2 * acos( (r - h) / r )
      const h = depth;
      const theta = 2 * Math.acos(1 - (2 * h) / D);
      
      A = (Math.pow(D, 2) / 8) * (theta - Math.sin(theta));
      P = (D / 2) * theta;
      T = D * Math.sin(theta / 2);
      
      // Centroid of circular segment from center of circle
      // y_c_from_center = (4 * r * sin^3(theta/2)) / (3 * (theta - sin(theta)))
      const alpha = theta / 2;
      const segmentCentroidFromCenter = (2 * D * Math.pow(Math.sin(alpha), 3)) / (3 * (theta - Math.sin(theta)));
      
      // Determine distance from surface.
      // Surface is at distance (r - h) from center.
      // If h < r, surface is above invert, below center. Center is above surface by (r-h). 
      //    Centroid is below center. Dist = segmentCentroidFromCenter - (r-h).
      // If h > r, surface is above center. Center is below surface by (h-r).
      //    Centroid is below center? No, segment centroid is always on axis of symmetry.
      // Let's use simpler coordinate geometry relative to surface.
      
      // First moment of area about surface Q_x = 2/3 * T^3 ? No.
      // Use Specific Force formula logic directly? No, need general property.
      
      // Let's calculate distance from Invert (bottom) to Centroid (y_bar)
      // y_bar_bottom = depth - centroidDepth
      
      // It is often easier to compute moment about center and shift.
      // Moment of Area about center M_c = A * y_c_from_center? No.
      // The formula for y_c_from_center is correct. It is the distance from circle center to centroid.
      // The centroid is always on the side of the segment.
      
      const distSurfToCenter = h - r; // Positive if surface above center
      
      // If h < r (less than half full), centroid is further from center than surface?
      // Wait, the segment is "bottom" part. Centroid is definitely below center.
      // y_c_from_center is positive distance downwards from center (towards invert).
      
      // Distance from Surface to Centroid = Distance Surface to Center + Distance Center to Centroid
      // No.
      // Let invert be y=0. Center is y=r. Surface is y=h.
      // Centroid Y coordinate y_g = r - segmentCentroidFromCenter.
      // centroidDepth = h - y_g = h - (r - segmentCentroidFromCenter) = h - r + segmentCentroidFromCenter.
      
      centroidDepth = (h - r) + segmentCentroidFromCenter;
      break;
  }
  return { A, P, T, centroidDepth };
};

// --- Solvers ---

const solveNormalDepth = (type: ChannelType, p: InputParams, unit: UnitSystem): number => {
  const { K } = UNIT_CONSTANTS[unit];
  const target = (p.flowRate * p.manningN) / (K * Math.sqrt(p.slope));
  
  let min = 0;
  let max = type === ChannelType.Circular ? p.diameter : 50; // Bounds
  
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (min + max) / 2;
    const geom = getGeometry(type, mid, p);
    if (geom.P === 0) { min = mid; continue; }
    
    const R = geom.A / geom.P;
    const val = geom.A * Math.pow(R, 2/3);

    if (Math.abs(val - target) < TOLERANCE) return mid;
    if (val < target) min = mid;
    else max = mid;
  }
  return (min + max) / 2;
};

const solveCriticalDepth = (type: ChannelType, p: InputParams, unit: UnitSystem): number => {
  const { G } = UNIT_CONSTANTS[unit];
  const Q2 = Math.pow(p.flowRate, 2);
  
  let min = 0;
  let max = type === ChannelType.Circular ? p.diameter : 50;

  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (min + max) / 2;
    const geom = getGeometry(type, mid, p);
    
    // Froude=1 condition: Q^2*T / g*A^3 = 1  => g*A^3 - Q^2*T = 0
    const val = G * Math.pow(geom.A, 3) - Q2 * geom.T;

    if (Math.abs(val) < TOLERANCE) return mid;
    if (val < 0) min = mid;
    else max = mid;
  }
  return (min + max) / 2;
};

// --- Public Calculators ---

export const calculateSectionProperties = (type: ChannelType, y: number, p: InputParams, unit: UnitSystem): SectionProperties => {
  const { G } = UNIT_CONSTANTS[unit];
  const geom = getGeometry(type, y, p);
  const V = geom.A > 0 ? p.flowRate / geom.A : 0;
  
  // Specific Energy E = y + V^2 / 2g
  const E = y + (Math.pow(V, 2) / (2 * G));

  // Specific Force M = Q^2 / gA + A * z_bar
  // z_bar is centroid depth
  const M = (geom.A > 0) 
    ? (Math.pow(p.flowRate, 2) / (G * geom.A)) + (geom.A * geom.centroidDepth)
    : 0;

  return {
    depth: y,
    area: geom.A,
    perimeter: geom.P,
    hydraulicRadius: geom.P > 0 ? geom.A / geom.P : 0,
    topWidth: geom.T,
    specificEnergy: E,
    specificForce: M,
    velocity: V
  };
};

export const calculateFlow = (type: ChannelType, p: InputParams, unit: UnitSystem = 'SI'): CalculationResult => {
  try {
    // Validation
    if (p.slope <= 0 || p.manningN <= 0 || p.flowRate <= 0) throw new Error("Slope, n, and Q must be positive.");
    if (type === ChannelType.Circular && p.diameter <= 0) throw new Error("Diameter must be positive.");
    if (type === ChannelType.Rectangular && p.width <= 0) throw new Error("Width must be positive.");

    const yn = solveNormalDepth(type, p, unit);
    const yc = solveCriticalDepth(type, p, unit);
    const { G } = UNIT_CONSTANTS[unit];

    const geomN = getGeometry(type, yn, p);
    const V = p.flowRate / geomN.A;
    const D_hyd = geomN.A / geomN.T;
    const Fr = V / Math.sqrt(G * D_hyd);

    let regime: 'Subcritical' | 'Supercritical' | 'Critical' = 'Critical';
    if (Fr < 0.99) regime = 'Subcritical';
    else if (Fr > 1.01) regime = 'Supercritical';
    
    // Critical Velocity
    const geomC = getGeometry(type, yc, p);
    const Vc = p.flowRate / geomC.A;

    return {
      normalDepth: yn,
      criticalDepth: yc,
      velocity: V,
      froudeNumber: Fr,
      flowRegime: regime,
      criticalVelocity: Vc,
    };
  } catch (e: any) {
    return {
      normalDepth: 0, criticalDepth: 0, velocity: 0, froudeNumber: 0, 
      flowRegime: 'Critical', criticalVelocity: 0,
      error: e.message
    };
  }
};
