
import React, { useState, useEffect } from 'react';
import { 
  Calculator, Droplets, Settings as SettingsIcon, Activity, Waves, Square, Triangle, Circle, Spline,
  Info, Ruler, Zap, ArrowRightLeft, BookOpen, User, LineChart, Map, ArrowRight, Plus, Trash2, 
  ChevronDown, HelpCircle, AlertCircle, TrendingUp
} from 'lucide-react';
import { ChannelType, InputParams, CalculationResult, DEFAULT_PARAMS, UnitSystem, SectionProperties, ProfilePoint, BoundaryCondition, CanalSectionInput } from './types';
import { calculateFlow, calculateSectionProperties, solveNormalDepth, calculateMultiReachProfile } from './utils/calculations';
import ChannelVisualizer from './components/ChannelVisualizer';
import TimeSeriesChart from './components/TimeSeriesChart';
import ProfileChart from './components/ProfileChart';

const ChannelIcons = {
  [ChannelType.Rectangular]: Square,
  [ChannelType.Trapezoidal]: Spline, 
  [ChannelType.Triangular]: Triangle,
  [ChannelType.Circular]: Circle,
};

type AnalysisMode = 'Normal' | 'Critical' | 'Custom';
type AppView = 'Calculator' | 'Hydrograph' | 'CanalModel' | 'Theory' | 'Settings' | 'About';
type ViewMode = 'Simple' | 'Advanced';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('Calculator');
  const [viewMode, setViewMode] = useState<ViewMode>('Advanced');
  const [unit, setUnit] = useState<UnitSystem>('SI');
  
  const [activeTab, setActiveTab] = useState<ChannelType>(ChannelType.Trapezoidal);
  const [params, setParams] = useState<InputParams>(DEFAULT_PARAMS[ChannelType.Trapezoidal]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('Normal');
  const [customDepth, setCustomDepth] = useState<number>(1.0);
  const [sectionProps, setSectionProps] = useState<SectionProperties | null>(null);

  const [hydroInput, setHydroInput] = useState<string>("0, 10\n1, 15\n2, 25\n3, 20\n4, 12\n5, 10");
  const [hydroData, setHydroData] = useState<{time: number, value: number}[]>([]);

  const [canalSections, setCanalSections] = useState<CanalSectionInput[]>([
      { id: '1', inputMode: 'Slope', length: 1000, slope: 0.001, usElevation: 10, dsElevation: 9 }
  ]);
  const [boundaryCond, setBoundaryCond] = useState<BoundaryCondition>({
    location: 'Downstream',
    type: 'NormalDepth',
    value: 1.0
  });
  const [profileData, setProfileData] = useState<ProfilePoint[]>([]);

  const toggleUnit = () => {
    setUnit(prev => {
      const newUnit = prev === 'SI' ? 'Imperial' : 'SI';
      const f = 3.28084;
      const qf = 35.3147;
      setParams(p => ({ ...p, flowRate: newUnit === 'Imperial' ? p.flowRate * qf : p.flowRate / qf, width: newUnit === 'Imperial' ? p.width * f : p.width / f, diameter: newUnit === 'Imperial' ? p.diameter * f : p.diameter / f }));
      setCustomDepth(d => newUnit === 'Imperial' ? d * f : d / f);
      setCanalSections(ss => ss.map(s => ({ ...s, length: newUnit === 'Imperial' ? s.length * f : s.length / f, usElevation: newUnit === 'Imperial' ? s.usElevation * f : s.usElevation / f, dsElevation: newUnit === 'Imperial' ? s.dsElevation * f : s.dsElevation / f })));
      setBoundaryCond(bc => ({ ...bc, value: newUnit === 'Imperial' ? bc.value * f : bc.value / f }));
      return newUnit;
    });
  };

  const handleTabChange = (type: ChannelType) => {
    setActiveTab(type);
    const def = DEFAULT_PARAMS[type];
    setParams(unit === 'Imperial' ? { ...def, flowRate: def.flowRate * 35.3147, width: def.width * 3.28084, diameter: def.diameter * 3.28084 } : def);
  };

  useEffect(() => {
    const res = calculateFlow(activeTab, params, unit);
    setResult(res);
  }, [activeTab, params, unit]);

  useEffect(() => {
    if (!result) return;
    const depth = analysisMode === 'Normal' ? result.normalDepth : analysisMode === 'Critical' ? result.criticalDepth : customDepth;
    setSectionProps(calculateSectionProperties(activeTab, depth, params, unit));
  }, [activeTab, params, unit, analysisMode, customDepth, result]);

  const addCanalSection = () => {
    if (canalSections.length >= 5) return;
    const last = canalSections[canalSections.length - 1];
    setCanalSections([...canalSections, { id: Date.now().toString(), inputMode: last.inputMode, length: last.length, slope: last.slope, usElevation: last.dsElevation, dsElevation: last.dsElevation - (last.slope * last.length) }]);
  };

  const updateSection = (id: string, field: keyof CanalSectionInput, value: any) => {
    setCanalSections(ss => ss.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleRunModel = () => {
    let val = boundaryCond.value;
    if (result) {
      if (boundaryCond.type === 'NormalDepth') val = result.normalDepth;
      else if (boundaryCond.type === 'CriticalDepth') val = result.criticalDepth;
    }
    setProfileData(calculateMultiReachProfile(activeTab, params, canalSections, { ...boundaryCond, value: val }, unit));
  };

  const U = { L: unit === 'SI' ? 'm' : 'ft', Q: unit === 'SI' ? 'm³/s' : 'ft³/s', V: unit === 'SI' ? 'm/s' : 'ft/s', Area: unit === 'SI' ? 'm²' : 'ft²', Energy: unit === 'SI' ? 'm' : 'ft' };

  const TheoryPrompt = ({ title, desc }: { title: string, desc: string }) => (
    <div className="group relative inline-block ml-1">
      <HelpCircle className="w-3.5 h-3.5 text-slate-300 cursor-help hover:text-brand-500 transition-colors" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50">
        <p className="font-bold border-b border-slate-700 mb-1 pb-1">{title}</p>
        {desc}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100 text-slate-900 font-sans">
      <aside className="w-full md:w-72 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col z-10 shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-brand-600">
            <Waves className="w-8 h-8" />
            <span className="text-2xl font-bold tracking-tight">OCF Guru</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 uppercase font-semibold">Civil Engineering Toolkit</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {[
            { id: 'Calculator', icon: Calculator, label: 'Single Section' },
            { id: 'CanalModel', icon: Map, label: 'Canal Modeling' },
            { id: 'Hydrograph', icon: LineChart, label: 'Hydrograph' },
            { id: 'Theory', icon: BookOpen, label: 'OCF Theory' },
            { id: 'Settings', icon: SettingsIcon, label: 'Settings' },
            { id: 'About', icon: Info, label: 'About' }
          ].map(v => (
            <button key={v.id} onClick={() => setCurrentView(v.id as AppView)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${currentView === v.id ? 'bg-brand-50 text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
              <v.icon className="w-4 h-4" /> {v.label}
            </button>
          ))}
          
          {currentView === 'Calculator' && (
            <div className="pt-4 mt-4 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2">Geometry</p>
              {Object.keys(ChannelType).map((k) => {
                const Icon = ChannelIcons[ChannelType[k as keyof typeof ChannelType]];
                const active = activeTab === ChannelType[k as keyof typeof ChannelType];
                return (
                  <button key={k} onClick={() => handleTabChange(ChannelType[k as keyof typeof ChannelType])} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-all ${active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <Icon className="w-4 h-4" /> {k}
                  </button>
                );
              })}
            </div>
          )}
        </nav>
        <div className="p-4 border-t border-slate-100 bg-slate-50">
           <button onClick={toggleUnit} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-bold text-slate-600 transition-colors shadow-sm">
            <ArrowRightLeft className="w-3 h-3" /> Unit: {unit}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto h-screen p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {currentView === 'Calculator' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-4 space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider border-b pb-3">
                    <SettingsIcon className="w-4 h-4 text-brand-500" /> System Parameters
                  </h2>
                  <div className="space-y-4">
                    <label className="block">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-600">Flow Rate Q ({U.Q})</span>
                        <TheoryPrompt title="Flow Rate (Q)" desc="Total volume of water passing through a section per unit of time." />
                      </div>
                      <input type="number" step="0.1" value={params.flowRate} onChange={e => setParams({...params, flowRate: parseFloat(e.target.value)||0})} className="w-full p-2 border rounded-md text-sm" />
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs font-bold text-slate-600 mb-1 block">Slope S₀</span>
                        <input type="number" step="0.0001" value={params.slope} onChange={e => setParams({...params, slope: parseFloat(e.target.value)||0})} className="w-full p-2 border rounded-md text-sm" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-600 mb-1 block">Manning's n</span>
                        <input type="number" step="0.001" value={params.manningN} onChange={e => setParams({...params, manningN: parseFloat(e.target.value)||0.013})} className="w-full p-2 border rounded-md text-sm" />
                      </label>
                    </div>
                  </div>
                  <div className="pt-4 border-t space-y-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Section Variables</p>
                    {activeTab !== ChannelType.Triangular && activeTab !== ChannelType.Circular && (
                      <label className="block">
                        <span className="text-xs font-bold text-slate-600 mb-1 block">Width b ({U.L})</span>
                        <input type="number" value={params.width} onChange={e => setParams({...params, width: parseFloat(e.target.value)||0})} className="w-full p-2 border rounded-md text-sm" />
                      </label>
                    )}
                    {activeTab === ChannelType.Circular && (
                      <label className="block">
                        <span className="text-xs font-bold text-slate-600 mb-1 block">Diameter D ({U.L})</span>
                        <input type="number" value={params.diameter} onChange={e => setParams({...params, diameter: parseFloat(e.target.value)||0})} className="w-full p-2 border rounded-md text-sm" />
                      </label>
                    )}
                    {(activeTab === ChannelType.Trapezoidal || activeTab === ChannelType.Triangular) && (
                      <label className="block">
                        <span className="text-xs font-bold text-slate-600 mb-1 block">Side Slope z (H:V)</span>
                        <input type="number" value={params.sideSlope} onChange={e => setParams({...params, sideSlope: parseFloat(e.target.value)||0})} className="w-full p-2 border rounded-md text-sm" />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8 space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[450px] flex flex-col relative">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase">
                      <TrendingUp className="w-4 h-4 text-brand-500" /> Visualization
                    </h3>
                    <div className="flex gap-2">
                      {['Normal', 'Critical', 'Custom'].map(m => (
                        <button key={m} onClick={() => setAnalysisMode(m as AnalysisMode)} className={`px-3 py-1 text-[10px] font-bold rounded-full border transition-all ${analysisMode === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                          {m} Depth
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 bg-slate-50/30">
                    {sectionProps && <ChannelVisualizer type={activeTab} params={params} displayDepth={sectionProps.depth} criticalDepth={result?.criticalDepth} />}
                  </div>
                </div>

                {result && !result.error && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Regime</p>
                      <p className={`text-lg font-black ${result.flowRegime === 'Supercritical' ? 'text-rose-600' : 'text-emerald-600'}`}>{result.flowRegime}</p>
                      <p className="text-xs font-medium text-slate-500">Fr = {result.froudeNumber.toFixed(3)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Normal yₙ</p>
                      <p className="text-lg font-black text-slate-800">{result.normalDepth.toFixed(3)} {U.L}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Critical y꜀</p>
                      <p className="text-lg font-black text-slate-800">{result.criticalDepth.toFixed(3)} {U.L}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Velocity V</p>
                      <p className="text-lg font-black text-slate-800">{result.velocity.toFixed(2)} {U.V}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === 'CanalModel' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-4 space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Map className="w-4 h-4 text-brand-500" /> Multi-Reach Input
                    </h2>
                    <button onClick={addCanalSection} disabled={canalSections.length >= 5} className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50 shadow-sm">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 overflow-y-auto space-y-4">
                    {canalSections.map((s, idx) => (
                      <div key={s.id} className="p-3 border rounded-lg bg-slate-50/50 relative group">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase">Section {idx+1}</span>
                          {idx > 0 && <button onClick={() => setCanalSections(ss => ss.filter(x => x.id !== s.id))} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                        <div className="flex gap-1 mb-2">
                          <button onClick={() => updateSection(s.id, 'inputMode', 'Slope')} className={`flex-1 text-[9px] font-bold py-1 border rounded ${s.inputMode === 'Slope' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}>SLOPE</button>
                          <button onClick={() => updateSection(s.id, 'inputMode', 'Elevation')} className={`flex-1 text-[9px] font-bold py-1 border rounded ${s.inputMode === 'Elevation' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}>ELEV</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[9px] font-bold text-slate-500 uppercase">Length ({U.L})</span>
                            <input type="number" value={s.length} onChange={e => updateSection(s.id, 'length', parseFloat(e.target.value)||0)} className="w-full p-1.5 border rounded text-xs" />
                          </label>
                          {s.inputMode === 'Slope' ? (
                            <label className="block">
                              <span className="text-[9px] font-bold text-slate-500 uppercase">Slope</span>
                              <input type="number" step="0.0001" value={s.slope} onChange={e => updateSection(s.id, 'slope', parseFloat(e.target.value)||0)} className="w-full p-1.5 border rounded text-xs" />
                            </label>
                          ) : (
                            <>
                              <label className="block">
                                <span className="text-[9px] font-bold text-slate-500 uppercase">US EL</span>
                                <input type="number" value={s.usElevation} onChange={e => updateSection(s.id, 'usElevation', parseFloat(e.target.value)||0)} className="w-full p-1.5 border rounded text-xs" />
                              </label>
                              <label className="block col-start-2">
                                <span className="text-[9px] font-bold text-slate-500 uppercase">DS EL</span>
                                <input type="number" value={s.dsElevation} onChange={e => updateSection(s.id, 'dsElevation', parseFloat(e.target.value)||0)} className="w-full p-1.5 border rounded text-xs" />
                              </label>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    <div className="pt-4 border-t space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Boundary Conditions</span>
                        <TheoryPrompt title="BC Strategy" desc="Subcritical flow is controlled downstream. Supercritical flow is controlled upstream." />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setBoundaryCond({...boundaryCond, location: 'Upstream'})} className={`py-2 text-[10px] font-bold border rounded ${boundaryCond.location === 'Upstream' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}>UPSTREAM</button>
                        <button onClick={() => setBoundaryCond({...boundaryCond, location: 'Downstream'})} className={`py-2 text-[10px] font-bold border rounded ${boundaryCond.location === 'Downstream' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}>DOWNSTREAM</button>
                      </div>
                      <select value={boundaryCond.type} onChange={e => setBoundaryCond({...boundaryCond, type: e.target.value as any})} className="w-full p-2 border rounded text-xs font-medium">
                        <option value="NormalDepth">Normal Depth (yₙ)</option>
                        <option value="CriticalDepth">Critical Depth (y꜀)</option>
                        <option value="KnownDepth">Known Depth (y)</option>
                      </select>
                      {boundaryCond.type === 'KnownDepth' && <input type="number" step="0.01" value={boundaryCond.value} onChange={e => setBoundaryCond({...boundaryCond, value: parseFloat(e.target.value)||0})} className="w-full p-2 border rounded text-xs" placeholder="Enter Depth" />}
                    </div>

                    <button onClick={handleRunModel} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all shadow-md flex items-center justify-center gap-2">
                      <ArrowRight className="w-4 h-4" /> Generate Profile
                    </button>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8 space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 h-[550px] flex flex-col relative">
                   <div className="p-3 flex justify-between items-center bg-white border-b">
                     <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                       <Activity className="w-4 h-4 text-brand-500" /> Hydraulic Profile Analysis
                     </h3>
                     {result && <div className={`text-[10px] font-black px-2 py-0.5 rounded border ${result.flowRegime === 'Subcritical' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'}`}>{result.flowRegime.toUpperCase()}</div>}
                   </div>
                   <div className="flex-1 bg-slate-50/30 p-4">
                     {profileData.length > 0 ? <ProfileChart data={profileData} unitLabel={U.L} /> : (
                       <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                         <AlertCircle className="w-12 h-12 mb-3 opacity-20" />
                         <p className="text-sm font-medium">Setup your canal reaches and click 'Generate'</p>
                       </div>
                     )}
                   </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 border rounded-xl shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total L</p>
                    <p className="text-sm font-black text-slate-800">{canalSections.reduce((a,c) => a+c.length, 0).toFixed(0)} {U.L}</p>
                  </div>
                  <div className="bg-white p-4 border rounded-xl shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Avg Slope</p>
                    <p className="text-sm font-black text-slate-800">{(canalSections.reduce((a,c) => a+c.slope, 0) / canalSections.length).toFixed(4)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentView === 'Theory' && <TheoryView />}
          {currentView === 'Settings' && <SettingsView />}
          {currentView === 'About' && <AboutView />}
          {currentView === 'Hydrograph' && <HydrographView />}
        </div>
      </main>
    </div>
  );
};

// ... keep existing sub-component implementations (HydrographView, TheoryView, etc) ...
// Ensure they use the updated U and params state as before.
export default App;
