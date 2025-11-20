import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Droplets, 
  Settings as SettingsIcon, 
  Activity, 
  Waves, 
  Square, 
  Triangle, 
  Circle, 
  Spline,
  Info,
  Ruler,
  Zap,
  ArrowRightLeft,
  BookOpen,
  User
} from 'lucide-react';
import { ChannelType, InputParams, CalculationResult, DEFAULT_PARAMS, UnitSystem, SectionProperties } from './types';
import { calculateFlow, calculateSectionProperties } from './utils/calculations';
import ChannelVisualizer from './components/ChannelVisualizer';

const ChannelIcons = {
  [ChannelType.Rectangular]: Square,
  [ChannelType.Trapezoidal]: Spline, 
  [ChannelType.Triangular]: Triangle,
  [ChannelType.Circular]: Circle,
};

type AnalysisMode = 'Normal' | 'Critical' | 'Custom';
type AppView = 'Calculator' | 'Theory' | 'Settings' | 'About';
type ViewMode = 'Simple' | 'Advanced';

const App: React.FC = () => {
  // Navigation & App State
  const [currentView, setCurrentView] = useState<AppView>('Calculator');
  const [viewMode, setViewMode] = useState<ViewMode>('Advanced');
  const [unit, setUnit] = useState<UnitSystem>('SI');
  
  // Calculator State
  const [activeTab, setActiveTab] = useState<ChannelType>(ChannelType.Trapezoidal);
  const [params, setParams] = useState<InputParams>(DEFAULT_PARAMS[ChannelType.Trapezoidal]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  
  // Section Analysis State
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('Normal');
  const [customDepth, setCustomDepth] = useState<number>(1.0);
  const [sectionProps, setSectionProps] = useState<SectionProperties | null>(null);

  // Unit Conversion Logic
  const toggleUnit = () => {
    setUnit(prev => {
      const newUnit = prev === 'SI' ? 'Imperial' : 'SI';
      
      // Convert Params
      const newParams = { ...params };
      if (newUnit === 'Imperial') {
        // SI -> Imperial
        newParams.flowRate = newParams.flowRate * 35.3147;
        newParams.width = newParams.width * 3.28084;
        newParams.diameter = newParams.diameter * 3.28084;
      } else {
        // Imperial -> SI
        newParams.flowRate = newParams.flowRate / 35.3147;
        newParams.width = newParams.width / 3.28084;
        newParams.diameter = newParams.diameter / 3.28084;
      }
      setParams(newParams);
      
      // Convert Custom Depth
      setCustomDepth(d => newUnit === 'Imperial' ? d * 3.28084 : d / 3.28084);

      return newUnit;
    });
  };

  const handleTabChange = (type: ChannelType) => {
    setActiveTab(type);
    const def = DEFAULT_PARAMS[type];
    if (unit === 'Imperial') {
      setParams({
        ...def,
        flowRate: def.flowRate * 35.3147,
        width: def.width * 3.28084,
        diameter: def.diameter * 3.28084,
      });
    } else {
      setParams(def);
    }
    setAnalysisMode('Normal');
  };

  const handleChange = (field: keyof InputParams, value: string) => {
    const numVal = parseFloat(value);
    setParams(prev => ({
      ...prev,
      [field]: isNaN(numVal) ? 0 : numVal
    }));
  };

  // Effects
  useEffect(() => {
    const res = calculateFlow(activeTab, params, unit);
    setResult(res);
  }, [activeTab, params, unit]);

  useEffect(() => {
    if (!result) return;

    let depth = 0;
    if (analysisMode === 'Normal') depth = result.normalDepth;
    else if (analysisMode === 'Critical') depth = result.criticalDepth;
    else depth = customDepth;

    if (isNaN(depth)) depth = 0;

    const props = calculateSectionProperties(activeTab, depth, params, unit);
    setSectionProps(props);

  }, [activeTab, params, unit, analysisMode, customDepth, result]);

  // Labels
  const U = {
    L: unit === 'SI' ? 'm' : 'ft',
    Q: unit === 'SI' ? 'm³/s' : 'ft³/s',
    V: unit === 'SI' ? 'm/s' : 'ft/s',
    Area: unit === 'SI' ? 'm²' : 'ft²',
    Force: unit === 'SI' ? 'm³' : 'ft³',
    Energy: unit === 'SI' ? 'm' : 'ft',
  };

  // --- SUB-COMPONENTS ---

  const CalculatorView = () => (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* INPUTS */}
      <div className="xl:col-span-4 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-slate-400" />
              Parameters ({unit})
            </h2>
          </div>
          
          <div className="p-6 space-y-5">
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Flow Rate Q ({U.Q})</span>
                <input 
                  type="number" 
                  step="0.1" 
                  value={params.flowRate.toFixed(3)} 
                  onChange={(e) => handleChange('flowRate', e.target.value)}
                  className="w-full bg-white text-slate-900 rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm p-2 border"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Slope S (ft/ft, m/m)</span>
                  <input 
                    type="number" 
                    step="0.0001" 
                    value={params.slope} 
                    onChange={(e) => handleChange('slope', e.target.value)}
                    className="w-full bg-white text-slate-900 rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm p-2 border"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Manning's n</span>
                  <input 
                    type="number" 
                    step="0.001" 
                    value={params.manningN} 
                    onChange={(e) => handleChange('manningN', e.target.value)}
                    className="w-full bg-white text-slate-900 rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm p-2 border"
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Channel Geometry</h3>
              
              {activeTab !== ChannelType.Triangular && activeTab !== ChannelType.Circular && (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Bottom Width b ({U.L})</span>
                  <input 
                    type="number" 
                    value={params.width.toFixed(3)} 
                    onChange={(e) => handleChange('width', e.target.value)}
                    className="w-full bg-white text-slate-900 rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm p-2 border"
                  />
                </label>
              )}

              {activeTab === ChannelType.Circular && (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Diameter D ({U.L})</span>
                  <input 
                    type="number" 
                    value={params.diameter.toFixed(3)} 
                    onChange={(e) => handleChange('diameter', e.target.value)}
                    className="w-full bg-white text-slate-900 rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm p-2 border"
                  />
                </label>
              )}

              {(activeTab === ChannelType.Trapezoidal || activeTab === ChannelType.Triangular) && (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Side Slope z (H:V)</span>
                  <input 
                    type="number" 
                    step="0.1" 
                    value={params.sideSlope} 
                    onChange={(e) => handleChange('sideSlope', e.target.value)}
                    className="w-full bg-white text-slate-900 rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm p-2 border"
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Section Analysis Controls - ADVANCED ONLY */}
        {viewMode === 'Advanced' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Ruler className="w-4 h-4 text-slate-400" />
                Section Analysis
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex rounded-md shadow-sm" role="group">
                <button 
                  type="button" 
                  onClick={() => setAnalysisMode('Normal')}
                  className={`px-4 py-2 text-xs font-medium rounded-l-lg border ${analysisMode === 'Normal' ? 'bg-brand-50 text-brand-700 border-brand-200 z-10' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  Normal Depth
                </button>
                <button 
                  type="button" 
                  onClick={() => setAnalysisMode('Critical')}
                  className={`px-4 py-2 text-xs font-medium border-t border-b ${analysisMode === 'Critical' ? 'bg-brand-50 text-brand-700 border-brand-200 z-10' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  Critical Depth
                </button>
                <button 
                  type="button" 
                  onClick={() => setAnalysisMode('Custom')}
                  className={`px-4 py-2 text-xs font-medium rounded-r-lg border ${analysisMode === 'Custom' ? 'bg-brand-50 text-brand-700 border-brand-200 z-10' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  Custom
                </button>
              </div>

              {analysisMode === 'Custom' && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-500 uppercase mb-1 block">Custom Depth y ({U.L})</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={customDepth} 
                    onChange={(e) => setCustomDepth(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white text-slate-900 rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm p-2 border"
                  />
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RESULTS */}
      <div className="xl:col-span-8 space-y-6">
        
        {/* VISUALIZER */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 overflow-hidden h-[420px] flex flex-col">
          <div className="px-5 py-3 flex items-center justify-between bg-white border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Droplets className="w-4 h-4 text-brand-500" />
              Cross-Section {viewMode === 'Advanced' ? `: ${analysisMode} Depth` : ''}
            </h2>
            {sectionProps && (
              <div className="flex items-center gap-4 text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    y = {sectionProps.depth.toFixed(3)} {U.L}
                  </span>
              </div>
            )}
          </div>
          <div className="flex-1 bg-slate-50 relative flex items-center justify-center">
            {sectionProps && (
              <ChannelVisualizer 
                type={activeTab} 
                params={params} 
                displayDepth={sectionProps.depth}
                criticalDepth={result?.criticalDepth}
              />
            )}
          </div>
        </div>

        {/* KEY RESULTS CARDS */}
        {result && !result.error ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group md:col-span-1">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Activity className="w-16 h-16 text-brand-600" />
              </div>
              <p className="text-sm text-slate-500 font-medium mb-1">Flow Condition</p>
              <div className="text-2xl font-bold text-slate-900">{result.flowRegime}</div>
              <div className="mt-2 flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold border ${
                    result.flowRegime === 'Supercritical' 
                    ? 'bg-rose-50 text-rose-700 border-rose-100' 
                    : result.flowRegime === 'Subcritical' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-amber-50 text-amber-700 border-amber-100'
                  }`}>
                    Fr = {result.froudeNumber.toFixed(2)}
                  </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center md:col-span-2">
              <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Normal Depth</p>
                      <p className="text-xl font-bold text-brand-600">{result.normalDepth.toFixed(3)} <span className="text-sm font-normal text-slate-400">{U.L}</span></p>
                  </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Critical Depth</p>
                      <p className="text-xl font-bold text-slate-800">{result.criticalDepth.toFixed(3)} <span className="text-sm font-normal text-slate-400">{U.L}</span></p>
                  </div>
                  <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Avg Velocity</p>
                      <p className="text-xl font-bold text-slate-800">{result.velocity.toFixed(2)} <span className="text-sm font-normal text-slate-400">{U.V}</span></p>
                  </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center text-rose-800">
            <h3 className="font-bold mb-1">Calculation Error</h3>
            <p className="text-sm">{result?.error || "Invalid Parameters"}</p>
          </div>
        )}

        {/* DETAILED PROPERTIES - Hidden in Simple Mode */}
        {sectionProps && viewMode === 'Advanced' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Geometric Props */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-slate-400" /> 
                      Section Properties (at y = {sectionProps.depth.toFixed(3)} {U.L})
                  </h3>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex justify-between items-center p-2 hover:bg-slate-50 rounded">
                    <span className="text-sm text-slate-500">Wetted Area (A)</span>
                    <span className="font-mono font-medium text-slate-700">{sectionProps.area.toFixed(3)} {U.Area}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 hover:bg-slate-50 rounded">
                    <span className="text-sm text-slate-500">Wetted Perimeter (P)</span>
                    <span className="font-mono font-medium text-slate-700">{sectionProps.perimeter.toFixed(3)} {U.L}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 hover:bg-slate-50 rounded">
                    <span className="text-sm text-slate-500">Hydraulic Radius (R)</span>
                    <span className="font-mono font-medium text-slate-700">{sectionProps.hydraulicRadius.toFixed(3)} {U.L}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 hover:bg-slate-50 rounded">
                    <span className="text-sm text-slate-500">Top Width (T)</span>
                    <span className="font-mono font-medium text-slate-700">{sectionProps.topWidth.toFixed(3)} {U.L}</span>
                  </div>
                </div>
            </div>

            {/* Energy & Momentum */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" /> 
                      Energy & Momentum
                  </h3>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                      <div className="flex justify-between mb-1">
                          <span className="text-sm text-slate-500">Specific Energy (E)</span>
                          <span className="text-sm font-bold text-slate-800">{sectionProps.specificEnergy.toFixed(3)} {U.Energy}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{width: '60%'}}></div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">E = y + V²/2g</p>
                  </div>

                  <div>
                      <div className="flex justify-between mb-1">
                          <span className="text-sm text-slate-500">Specific Force (M)</span>
                          <span className="text-sm font-bold text-slate-800">{sectionProps.specificForce.toFixed(3)} {U.Force}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full" style={{width: '60%'}}></div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">M = Q²/gA + Aȳ</p>
                  </div>
                </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );

  const TheoryView = () => (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-brand-600" />
          Theoretical Background
        </h2>
        <p className="text-slate-500 mt-1">Fundamental equations used in Open Channel Flow calculations.</p>
      </div>
      <div className="p-8 space-y-8">
        <section>
          <h3 className="text-lg font-semibold text-slate-900 mb-3 border-b border-slate-100 pb-2">Manning's Equation</h3>
          <p className="text-slate-600 mb-4 leading-relaxed">
            The Manning formula is an empirical formula estimating the average velocity of a liquid flowing in a conduit that does not completely enclose the liquid.
          </p>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 font-mono text-sm text-center text-slate-800">
             V = (k/n) * R^(2/3) * S^(1/2)
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li><strong className="text-slate-800">V</strong> = Flow Velocity ({U.V})</li>
            <li><strong className="text-slate-800">k</strong> = 1.0 for SI units, 1.486 for Imperial units</li>
            <li><strong className="text-slate-800">n</strong> = Manning's Roughness Coefficient</li>
            <li><strong className="text-slate-800">R</strong> = Hydraulic Radius (A/P)</li>
            <li><strong className="text-slate-800">S</strong> = Channel Bed Slope</li>
          </ul>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-slate-900 mb-3 border-b border-slate-100 pb-2">Specific Energy</h3>
          <p className="text-slate-600 mb-4 leading-relaxed">
            Specific energy in a channel section is defined as the energy per pound of water at any section of a channel measured with respect to the channel bottom.
          </p>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 font-mono text-sm text-center text-slate-800">
             E = y + V² / (2g)
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-slate-900 mb-3 border-b border-slate-100 pb-2">Froude Number</h3>
          <p className="text-slate-600 mb-4 leading-relaxed">
            The Froude number is a dimensionless number defined as the ratio of the flow inertia to the external field (the latter in many applications simply being gravity).
          </p>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 font-mono text-sm text-center text-slate-800">
             Fr = V / sqrt(g * D_hyd)
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4 text-center text-sm">
             <div className="p-2 bg-emerald-50 text-emerald-700 rounded border border-emerald-100">Fr &lt; 1 <br/>Subcritical</div>
             <div className="p-2 bg-amber-50 text-amber-700 rounded border border-amber-100">Fr = 1 <br/>Critical</div>
             <div className="p-2 bg-rose-50 text-rose-700 rounded border border-rose-100">Fr &gt; 1 <br/>Supercritical</div>
          </div>
        </section>
      </div>
    </div>
  );

  const SettingsView = () => (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
       <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-slate-600" />
          Settings
        </h2>
      </div>
      <div className="p-8 space-y-6">
         <div className="flex items-center justify-between pb-6 border-b border-slate-100">
            <div>
               <h3 className="text-lg font-medium text-slate-900">Interface Mode</h3>
               <p className="text-sm text-slate-500">Toggle between simplified and detailed engineering views.</p>
            </div>
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
               <button 
                 onClick={() => setViewMode('Simple')}
                 className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewMode === 'Simple' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 Simple
               </button>
               <button 
                 onClick={() => setViewMode('Advanced')}
                 className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${viewMode === 'Advanced' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 Advanced
               </button>
            </div>
         </div>

         <div className="flex items-center justify-between pb-6 border-b border-slate-100">
            <div>
               <h3 className="text-lg font-medium text-slate-900">Unit System</h3>
               <p className="text-sm text-slate-500">Switch between SI (Metric) and Imperial units.</p>
            </div>
            <button 
              onClick={toggleUnit}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Currently: {unit}
            </button>
         </div>
      </div>
    </div>
  );

  const AboutView = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
         <div className="h-32 bg-gradient-to-r from-brand-600 to-brand-400 flex items-center justify-center">
            <div className="text-center text-white">
               <Waves className="w-12 h-12 mx-auto mb-2 opacity-90" />
               <h1 className="text-3xl font-bold tracking-tight">OCF Guru</h1>
            </div>
         </div>
         <div className="p-8 text-center">
            <p className="text-lg text-slate-600 mb-6">
              Professional Open Channel Flow calculations made simple. Designed for civil engineers, students, and hydrologists.
            </p>
            
            <div className="grid grid-cols-1 gap-6 max-w-sm mx-auto">
              <div className="flex flex-col items-center p-4 rounded-lg bg-slate-50 border border-slate-100">
                 <User className="w-8 h-8 text-brand-500 mb-3" />
                 <h3 className="font-semibold text-slate-900">Created By</h3>
                 <p className="text-slate-700 mt-1">Thushan Chamika</p>
                 <p className="text-sm text-slate-500">University of Moratuwa</p>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
               <span className="px-2 py-1 rounded-full bg-slate-100">Supported by Gemini</span>
               <span>•</span>
               <span>v1.2.0</span>
            </div>
         </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100 text-slate-900 font-sans">
      
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-brand-600">
            <Waves className="w-8 h-8" />
            <span className="text-2xl font-bold tracking-tight">OCF Guru</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Open Channel Flow Calculator</p>
        </div>

        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          
          {/* Main Nav */}
          <div className="space-y-1">
            <button 
              onClick={() => setCurrentView('Calculator')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${currentView === 'Calculator' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Calculator className="w-4 h-4" />
              Calculator
            </button>
            <button 
               onClick={() => setCurrentView('Theory')}
               className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${currentView === 'Theory' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <BookOpen className="w-4 h-4" />
              Theory
            </button>
            <button 
               onClick={() => setCurrentView('Settings')}
               className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${currentView === 'Settings' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <SettingsIcon className="w-4 h-4" />
              Settings
            </button>
            <button 
               onClick={() => setCurrentView('About')}
               className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${currentView === 'About' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Info className="w-4 h-4" />
              About
            </button>
          </div>

          {/* Calculator Sub-Nav */}
          {currentView === 'Calculator' && (
            <div className="pt-4 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
                Channel Shapes
              </div>
              <div className="space-y-1">
                {(Object.keys(ChannelType) as Array<keyof typeof ChannelType>).map((key) => {
                  const Icon = ChannelIcons[ChannelType[key]];
                  const isActive = activeTab === ChannelType[key];
                  return (
                    <button
                      key={key}
                      onClick={() => handleTabChange(ChannelType[key])}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                        ${isActive 
                          ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-200' 
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-brand-500' : 'text-slate-400'}`} />
                      {ChannelType[key]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
           <button 
            onClick={toggleUnit}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-semibold text-slate-600 transition-colors"
          >
            <ArrowRightLeft className="w-3 h-3" />
            Switch to {unit === 'SI' ? 'Imperial' : 'Metric'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen p-4 md:p-8 scroll-smooth">
        <div className="max-w-7xl mx-auto">
          
          {/* Header Mobile */}
          <div className="md:hidden mb-6 flex justify-between items-center text-brand-600">
             <div className="flex items-center gap-2">
                <Waves className="w-6 h-6" />
                <span className="text-xl font-bold">OCF Guru</span>
             </div>
             <button onClick={() => setCurrentView('Settings')} className="p-2 bg-white rounded-md shadow-sm">
               <SettingsIcon className="w-5 h-5 text-slate-600" />
             </button>
          </div>

          {/* Dynamic Content */}
          {currentView === 'Calculator' && <CalculatorView />}
          {currentView === 'Theory' && <TheoryView />}
          {currentView === 'Settings' && <SettingsView />}
          {currentView === 'About' && <AboutView />}

        </div>
      </main>
    </div>
  );
};

export default App;