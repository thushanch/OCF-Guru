
import { ChannelType, InputParams, CalculationResult, SectionProperties, UnitSystem, ProfilePoint, BoundaryCondition, CanalSectionInput } from '../types';

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
      const y_bar_bottom = (y / 3) * ((2 * T + p.width) / (T + p.width));
      centroidDepth = y - y_bar_bottom;
      break;

    case ChannelType.Triangular:
      A = p.sideSlope * y * y;
      P = 2 * y * Math.sqrt(1 + p.sideSlope * p.sideSlope);
      T = 2 * p.sideSlope * y;
      centroidDepth = y / 3; 
      break;

    case ChannelType.Circular:
      const D = p.diameter;
      let depth = y;
      if (depth > D) depth = D;
      const r = D / 2;
      const h = depth;
      const theta = 2 * Math.acos(1 - (2 * h) / D);
      A = (Math.pow(D, 2) / 8) * (theta - Math.sin(theta));
      P = (D / 2) * theta;
      T = D * Math.sin(theta / 2);
      const alpha = theta / 2;
      const segmentCentroidFromCenter = (2 * D * Math.pow(Math.sin(alpha), 3)) / (3 * (theta - Math.sin(theta)));
      const distSurfToCenter = h - r; 
      centroidDepth = (h - r) + segmentCentroidFromCenter;
      break;
  }
  return { A, P, T, centroidDepth };
};

// --- Solvers ---

export const solveNormalDepth = (type: ChannelType, p: InputParams, unit: UnitSystem): number => {
  const { K } = UNIT_CONSTANTS[unit];
  const target = (p.flowRate * p.manningN) / (K * Math.sqrt(p.slope));
  
  let min = 0;
  let max = type === ChannelType.Circular ? p.diameter : 50; 
  
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
    const val = G * Math.pow(geom.A, 3) - Q2 * geom.T;

    if (Math.abs(val) < TOLERANCE) return mid;
    if (val < 0) min = mid;
    else max = mid;
  }
  return (min + max) / 2;
};

// Solve for depth given Specific Energy E (Subcritical or Supercritical root)
const solveDepthFromEnergy = (type: ChannelType, p: InputParams, E: number, unit: UnitSystem, regime: 'Subcritical' | 'Supercritical'): number => {
    const { G } = UNIT_CONSTANTS[unit];
    const yc = solveCriticalDepth(type, p, unit);
    const geomC = getGeometry(type, yc, p);
    const Vc = p.flowRate / geomC.A;
    const Ec = yc + (Vc * Vc) / (2 * G);

    if (E < Ec) return yc; // Cannot solve, return critical

    let min = 0, max = 0;
    if (regime === 'Supercritical') {
        min = 0.01;
        max = yc;
    } else {
        min = yc;
        max = Math.max(yc * 5, E * 1.5); // Upper bound guess
    }

    for(let i=0; i<50; i++) {
        const mid = (min + max) / 2;
        const geom = getGeometry(type, mid, p);
        const V = geom.A > 0 ? p.flowRate / geom.A : 0;
        const E_calc = mid + (V*V)/(2*G);
        
        if (Math.abs(E_calc - E) < 1e-4) return mid;

        // Energy curve is parabolic. 
        // Supercritical (y < yc): as y increases, E decreases.
        // Subcritical (y > yc): as y increases, E increases.
        
        if (regime === 'Supercritical') {
             if (E_calc > E) min = mid; // Need lower E -> increase y (wait, SC branch: y up -> E down)
             else max = mid;
        } else {
             if (E_calc < E) min = mid; // Need higher E -> increase y
             else max = mid;
        }
    }
    return (min + max) / 2;
};


// --- Multi-Reach Profile Calculation ---

export const calculateMultiReachProfile = (
  type: ChannelType, 
  baseParams: InputParams, 
  sections: CanalSectionInput[], 
  bc: BoundaryCondition,
  unit: UnitSystem,
  stepPerSection: number = 20
): ProfilePoint[] => {
  const { G, K } = UNIT_CONSTANTS[unit];
  const allPoints: ProfilePoint[] = [];

  // 1. Determine Calculation Direction
  // Downstream Control -> Calculate Upstream (Backwater)
  // Upstream Control -> Calculate Downstream
  const isUpstreamCalc = bc.location === 'Downstream'; 

  // 2. Prepare Section Params (Slopes)
  // If Mode=Elevation, calculate Slope.
  // We also need absolute bed elevations for plotting.
  const computedSections = sections.map(s => {
      let slope = s.slope;
      if (s.inputMode === 'Elevation') {
          slope = (s.usElevation - s.dsElevation) / s.length;
      }
      return { ...s, slope };
  });

  // 3. Execution Order
  // If Upstream Calc (Backwater): Process Last Section -> First Section
  // If Downstream Calc: Process First Section -> Last Section
  const processingOrder = isUpstreamCalc 
      ? [...computedSections].reverse().map((s, idx) => ({ s, originalIdx: computedSections.length - 1 - idx }))
      : computedSections.map((s, idx) => ({ s, originalIdx: idx }));

  let currentDepth = bc.value;

  // We need to track Bed Elevation for continuity if doing energy balance
  // But plotting requires global coordinates.
  // Let's solve section by section, then stitch or store globally.
  
  // Strategy: 
  // Loop through sections in order. 
  // Maintain a "Current Boundary Depth" and "Current Junction Energy"
  
  for (let i = 0; i < processingOrder.length; i++) {
      const { s, originalIdx } = processingOrder[i];
      const sectionParams = { ...baseParams, slope: s.slope };
      
      const yn = solveNormalDepth(type, sectionParams, unit);
      const yc = solveCriticalDepth(type, sectionParams, unit);

      // Handle BC for this section
      // For first processed section, use Global BC.
      // For subsequent, calculate from previous section's end.
      
      if (i === 0) {
          // Check type of BC
          if (bc.type === 'NormalDepth') currentDepth = yn;
          else if (bc.type === 'CriticalDepth') currentDepth = yc;
          else currentDepth = bc.value;
      } else {
          // Transition logic (Continuity)
          // Previous section ended at 'currentDepth'. 
          // We need to account for Bed Step if using Elevation mode.
          const prevSec = processingOrder[i-1].s;
          const currSec = s;

          // Elevations at the junction
          // If moving Upstream (Backwater): Junction is (Prev Upstream) <-> (Curr Downstream)
          // If moving Downstream: Junction is (Prev Downstream) <-> (Curr Upstream)
          
          let z_prev_end = 0;
          let z_curr_start = 0;

          if (isUpstreamCalc) {
               // Moving 3 -> 2. Prev is 3. Curr is 2.
               // Junction is Upstream of 3 and Downstream of 2.
               if (prevSec.inputMode === 'Elevation') z_prev_end = prevSec.usElevation;
               if (currSec.inputMode === 'Elevation') z_curr_start = currSec.dsElevation;
          } else {
               // Moving 1 -> 2. Prev is 1. Curr is 2.
               // Junction is Downstream of 1 and Upstream of 2.
               if (prevSec.inputMode === 'Elevation') z_prev_end = prevSec.dsElevation;
               if (currSec.inputMode === 'Elevation') z_curr_start = currSec.usElevation;
          }

          // Energy Balance: E1 + z1 = E2 + z2
          // E_prev + z_prev = E_curr + z_curr
          const geomPrev = getGeometry(type, currentDepth, baseParams); // Q same
          const Vprev = baseParams.flowRate / geomPrev.A;
          const E_prev = currentDepth + (Vprev*Vprev)/(2*G);
          const TotalHead = E_prev + z_prev_end;
          
          const E_req = TotalHead - z_curr_start;
          
          // Solve for new depth in current section with Specific Energy E_req
          // Need to know regime. Usually assumes regime matches BC direction?
          // If Downstream Control (Subcritical Calc), we seek Subcritical root.
          const regime = isUpstreamCalc ? 'Subcritical' : 'Supercritical';
          
          // Fallback if step is crazy (E_req < E_min) -> Critical
          const yc_curr = solveCriticalDepth(type, sectionParams, unit);
          // Check E_min
          const geomC = getGeometry(type, yc_curr, sectionParams);
          const Vc = baseParams.flowRate / geomC.A;
          const Ec = yc_curr + (Vc*Vc)/(2*G);

          if (E_req < Ec) {
              currentDepth = yc_curr; // Choke condition
          } else {
              currentDepth = solveDepthFromEnergy(type, sectionParams, E_req, unit, regime);
          }
      }

      // Run GVF for this section
      // If UpstreamCalc: dx is negative (L -> 0)
      // If DownstreamCalc: dx is positive (0 -> L)
      const dx = (s.length / stepPerSection) * (isUpstreamCalc ? -1 : 1);
      
      const sectionPoints: ProfilePoint[] = [];
      let y = currentDepth;
      let x_local = isUpstreamCalc ? s.length : 0;

      // Bed Elevation Helper (Local)
      // If Elevation Mode: Interpolate
      // If Slope Mode: We stitch later? No, we need Z for profile point.
      // We'll normalize Z later or compute relative to section start.
      // Let's compute relative to Downstream end of section if UpstreamCalc?
      // Easier: Compute relative to section Start (0) = z_start.
      
      // Determine Z_start for this section
      let z_start_local = 0;
      let z_slope = s.slope;
      
      if (s.inputMode === 'Elevation') {
          z_start_local = s.usElevation; // At x_local = 0
          // slope is calculated
      } else {
          // Slope Mode. We need to anchor Z.
          // This is tricky for multi-reach visual stitching without absolute Z.
          // For visualization, we will construct specific Z values later in a second pass 
          // or assume continuous if Slope mode.
          // Let's store "Depth" and "Local Distance". We will flatten to global coords later.
      }

      // Add Start Point
      sectionPoints.push({
          distance: x_local,
          bedElevation: 0, // Placeholder
          waterElevation: 0, // Placeholder
          depth: y,
          normalDepthElevation: 0, // Placeholder
          criticalDepthElevation: 0, // Placeholder
          sectionIndex: originalIdx
      });

      for (let step = 0; step < stepPerSection; step++) {
          if (y <= 0) break;
          const geom = getGeometry(type, y, sectionParams);
          if (geom.A === 0 || geom.T === 0) break;
          
          const V = baseParams.flowRate / geom.A;
          const R = geom.P > 0 ? geom.A / geom.P : 0;
          const Dh = geom.A / geom.T;
          
          const Sf = Math.pow((sectionParams.manningN * V) / (K * Math.pow(R, 2/3)), 2);
          const Fr2 = (Math.pow(V, 2) / (G * Dh));
          
          const numerator = sectionParams.slope - Sf;
          const denominator = 1 - Fr2;

          if (Math.abs(denominator) < 0.05) {
             // Near critical depth singularity
             // Simple clamp or stop
             // If we cross critical depth, standard step fails. 
             // Ideally we stop or switch regimes. For now, stop.
             // break;
             // Let's just limit step size?
          }

          const dydx = numerator / denominator;
          const dy = dydx * dx;
          
          y += dy;
          x_local += dx;

          // Bounds check
          if (y <= 0) y = 0.01;
          if (y > 100) y = 100;

          sectionPoints.push({
              distance: x_local,
              bedElevation: 0,
              waterElevation: 0,
              depth: y,
              normalDepthElevation: 0,
              criticalDepthElevation: 0,
              sectionIndex: originalIdx
          });
      }
      
      // Update currentDepth for next iteration
      currentDepth = y;

      // Store points
      if (isUpstreamCalc) {
          allPoints.push(...sectionPoints.reverse()); // Store 0->L order
      } else {
          allPoints.push(...sectionPoints);
      }
  }

  // 4. Post-Processing: Stitch Coordinates and Elevations
  // We need to map local distances to global chainage.
  // We need to determine absolute Bed Z.
  
  // Sort sections by index
  const finalPoints: ProfilePoint[] = [];
  
  // Calculate Global Start Distances for each section
  let globalDist = 0;
  const sectionStartDist: number[] = [];
  for(let i=0; i<computedSections.length; i++) {
      sectionStartDist[i] = globalDist;
      globalDist += computedSections[i].length;
  }

  // Determine Anchors for Elevation
  // If Elevation Mode used anywhere, we should try to honor it.
  // If mixed, it's messy. Let's assume:
  // If Section has Elevations, use them.
  // If Section is Slope, attach to previous/next Elevation.
  // Default Z=0 at Downstream End if no info.
  
  // Let's build a Z_node array for section boundaries (0 to N)
  const z_nodes: number[] = new Array(computedSections.length + 1).fill(null);
  
  // Fill knowns
  computedSections.forEach((s, i) => {
      if (s.inputMode === 'Elevation') {
          z_nodes[i] = s.usElevation;
          z_nodes[i+1] = s.dsElevation;
      }
  });
  
  // Fill unknowns (forward pass)
  if (z_nodes[0] === null) z_nodes[0] = 100; // Arbitrary datum if completely unknown
  for(let i=0; i<computedSections.length; i++) {
      if (z_nodes[i+1] === null) {
          // Z_down = Z_up - S*L
          z_nodes[i+1] = z_nodes[i] - computedSections[i].slope * computedSections[i].length;
      }
  }
  // If we had gaps filled by Elevation inputs, z_nodes is good. 
  // If we have Slope mode following Elevation mode, it attaches.
  // What if Slope mode precedes Elevation mode? (Backward pass)
  // Re-check unknowns? (Actually Z_nodes[0] default handles the full float if all slope)
  // If specific elevations are set later, we might need backward pass.
  // Simple Backward pass:
  for(let i=computedSections.length-1; i>=0; i--) {
      if (z_nodes[i] === null && z_nodes[i+1] !== null) {
          z_nodes[i] = z_nodes[i+1] + computedSections[i].slope * computedSections[i].length;
      }
  }

  // Now Map Points
  // Group points by section
  const pointsBySection = new Map<number, ProfilePoint[]>();
  allPoints.forEach(p => {
      if (!pointsBySection.has(p.sectionIndex)) pointsBySection.set(p.sectionIndex, []);
      pointsBySection.get(p.sectionIndex)?.push(p);
  });

  for(let i=0; i<computedSections.length; i++) {
      const s = computedSections[i];
      const pts = pointsBySection.get(i) || [];
      const startX = sectionStartDist[i];
      const startZ = z_nodes[i];
      
      const yn = solveNormalDepth(type, { ...baseParams, slope: s.slope }, unit);
      const yc = solveCriticalDepth(type, { ...baseParams, slope: s.slope }, unit);

      pts.forEach(p => {
          // p.distance is local 0..L
          const globalX = startX + p.distance;
          // Bed Z = StartZ - S * localDist
          const bedZ = startZ - s.slope * p.distance;
          
          finalPoints.push({
              distance: globalX,
              bedElevation: bedZ,
              waterElevation: bedZ + p.depth,
              depth: p.depth,
              normalDepthElevation: bedZ + yn,
              criticalDepthElevation: bedZ + yc,
              sectionIndex: i
          });
      });
  }

  return finalPoints.sort((a, b) => a.distance - b.distance);
};

export const calculateSectionProperties = (type: ChannelType, y: number, p: InputParams, unit: UnitSystem): SectionProperties => {
  const { G } = UNIT_CONSTANTS[unit];
  const geom = getGeometry(type, y, p);
  const V = geom.A > 0 ? p.flowRate / geom.A : 0;
  const E = y + (Math.pow(V, 2) / (2 * G));
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
