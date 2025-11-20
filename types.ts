export enum ChannelType {
  Rectangular = 'Rectangular',
  Trapezoidal = 'Trapezoidal',
  Triangular = 'Triangular',
  Circular = 'Circular',
}

export type UnitSystem = 'SI' | 'Imperial';

export interface InputParams {
  flowRate: number; // Q
  slope: number; // S
  manningN: number; // n
  width: number; // b
  sideSlope: number; // z
  diameter: number; // D
}

export interface CalculationResult {
  normalDepth: number; // yn
  criticalDepth: number; // yc
  velocity: number; // V
  froudeNumber: number; // Fr
  flowRegime: 'Subcritical' | 'Supercritical' | 'Critical';
  criticalVelocity: number; // Vc
  error?: string;
}

export interface SectionProperties {
  depth: number; // y
  area: number; // A
  perimeter: number; // P
  hydraulicRadius: number; // R
  topWidth: number; // T
  specificEnergy: number; // E
  specificForce: number; // M (Momentum)
  velocity: number; // V at this depth given Q
}

export const DEFAULT_PARAMS: Record<ChannelType, InputParams> = {
  [ChannelType.Rectangular]: { flowRate: 10, slope: 0.001, manningN: 0.013, width: 5, sideSlope: 0, diameter: 0 },
  [ChannelType.Trapezoidal]: { flowRate: 10, slope: 0.001, manningN: 0.013, width: 3, sideSlope: 2, diameter: 0 },
  [ChannelType.Triangular]: { flowRate: 5, slope: 0.005, manningN: 0.013, width: 0, sideSlope: 1.5, diameter: 0 },
  [ChannelType.Circular]: { flowRate: 2, slope: 0.002, manningN: 0.013, width: 0, sideSlope: 0, diameter: 2 },
};
