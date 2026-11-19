import React, { useState } from 'react';
import { Calculator, Compass, X, Delete, RotateCcw } from 'lucide-react';

export const FloatingTools: React.FC = () => {
  const [openTool, setOpenTool] = useState<'none' | 'casio' | 'geogebra'>('none');
  const [expr, setExpr] = useState('sin(pi/6) + 2^3');
  const [result, setResult] = useState('8.5');
  const [fnExpr, setFnExpr] = useState('x^3 - 3*x^2 + 2');
  const [rulerAngle, setRulerAngle] = useState(0);

  const evaluateCasio = (input: string) => {
    try {
      const jsExpr = input
        .replace(/π|pi/g, 'Math.PI')
        .replace(/e(?![a-z])/g, 'Math.E')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/√\(|sqrt\(/g, 'Math.sqrt(')
        .replace(/\^/g, '**')
        .replace(/×/g, '*')
        .replace(/÷/g, '/');
      // eslint-disable-next-line no-new-func
      const val = Function(`"use strict"; return (${jsExpr})`)();
      if (typeof val === 'number' && Number.isFinite(val)) {
        const rounded = Math.round(val * 1e6) / 1e6;
        setResult(String(rounded).replace('.', ','));
      } else {
        setResult('Math ERROR');
      }
    } catch {
      setResult('Syntax ERROR');
    }
  };

  const appendKey = (k: string) => {
    const next = expr === '0' ? k : expr + k;
    setExpr(next);
  };

  // Generate SVG path for mini GeoGebra drawer
  const buildPlotPath = () => {
    const pts: string[] = [];
    for (let x = -4; x <= 4; x += 0.1) {
      try {
        const safe = fnExpr.replace(/\^/g, '**');
        // eslint-disable-next-line no-new-func
        const y = Function('x', `"use strict"; return (${safe})`)(x);
        if (typeof y === 'number' && Number.isFinite(y) && Math.abs(y) <= 8) {
          const sx = 140 + x * 30;
          const sy = 100 - y * 15;
          pts.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
        }
      } catch {
        // ignore invalid intermediate input
      }
    }
    return pts.join(' ');
  };

  return (
    <>
      {/* Floating Buttons */}
      <div className="no-print fixed right-5 bottom-5 z-40 flex flex-col gap-2.5">
        <button
          onClick={() => setOpenTool(openTool === 'geogebra' ? 'none' : 'geogebra')}
          title="Bảng vẽ hình GeoGebra & Thước đo nhanh"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#136F63] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#0F594F]"
        >
          <Compass className="h-5 w-5" />
        </button>
        <button
          onClick={() => setOpenTool(openTool === 'casio' ? 'none' : 'casio')}
          title="Máy tính cầm tay Casio fx-580VN X"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0F594F] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#0B3B35]"
        >
          <Calculator className="h-5 w-5" />
        </button>
      </div>

      {/* Casio fx-580VN X Drawer */}
      {openTool === 'casio' && (
        <div className="no-print fixed right-3 bottom-20 left-3 z-50 overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-[#0F172A] text-white shadow-xl sm:right-20 sm:bottom-5 sm:left-auto sm:w-80">
          <div className="flex items-center justify-between bg-[#136F63] px-4 py-2">
            <div>
              <div className="text-[13.5px] font-semibold tracking-wide text-white">CASIO fx-580VN X</div>
              <div className="text-[12px] text-white/80">CLASSWIZ Mô phỏng nhanh</div>
            </div>
            <button
              onClick={() => setOpenTool('none')}
              aria-label="Đóng máy tính"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px] hover:bg-[#0F594F]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-3.5">
            <div className="mb-3 rounded-[8px] border border-[#136F63] bg-[#d9ead3] p-2.5 text-[#0F172A] tabular-nums">
              <div className="truncate text-[12px] text-[#334155]">{expr || '0'}</div>
              <div className="mt-1 text-right text-[18px] font-semibold tabular-nums">{result}</div>
            </div>
            <div className="grid grid-cols-5 gap-1.5 text-[13.5px] font-medium">
              {[
                'sin(', 'cos(', 'tan(', 'log(', 'ln(',
                '√(', '(', ')', '^', 'pi',
                '7', '8', '9', 'DEL', 'AC',
                '4', '5', '6', '×', '÷',
                '1', '2', '3', '+', '-',
                '0', '.', 'e', 'Ans', '=',
              ].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === 'AC') {
                      setExpr('');
                      setResult('0');
                    } else if (k === 'DEL') {
                      setExpr((v) => v.slice(0, -1));
                    } else if (k === '=') {
                      evaluateCasio(expr);
                    } else if (k === 'Ans') {
                      appendKey(result.replace(',', '.'));
                    } else {
                      appendKey(k);
                    }
                  }}
                  className={`rounded-[8px] py-2 transition-colors ${
                    k === '='
                      ? 'bg-[#136F63] text-white hover:bg-[#0F594F]'
                      : k === 'DEL' || k === 'AC'
                      ? 'bg-[#FEE2E2] text-[#B91C1C] hover:opacity-90'
                      : ['sin(', 'cos(', 'tan(', 'log(', 'ln(', '√(', '^', 'pi'].includes(k)
                      ? 'bg-slate-700 text-teal-100 hover:bg-slate-600'
                      : 'bg-slate-800 text-white hover:bg-slate-700'
                  }`}
                >
                  {k === 'DEL' ? <Delete className="mx-auto h-3.5 w-3.5" /> : k}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GeoGebra Quick Plotter & Ruler */}
      {openTool === 'geogebra' && (
        <div className="no-print fixed right-3 bottom-20 left-3 z-50 overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white text-[#334155] shadow-xl sm:right-20 sm:bottom-5 sm:left-auto sm:w-84">
          <div className="flex items-center justify-between bg-[#136F63] px-4 py-2 text-white">
            <div className="text-[13.5px] font-semibold">Bảng vẽ GeoGebra &amp; Thước đo nhanh</div>
            <button
              onClick={() => setOpenTool('none')}
              aria-label="Đóng bảng vẽ"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px] hover:bg-[#0F594F]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 p-3.5">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                Hàm số f(x) =
              </label>
              <input
                value={fnExpr}
                onChange={(e) => setFnExpr(e.target.value)}
                className="w-full rounded-[8px] border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[13.5px] text-[#334155] focus:border-[#136F63] focus:outline-none"
              />
            </div>

            <svg viewBox="0 0 280 200" className="w-full rounded-[8px] border border-[#E2E8F0] bg-white">
              <defs>
                <pattern id="miniGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#E2E8F0" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="280" height="200" fill="url(#miniGrid)" />
              <line x1="0" y1="100" x2="280" y2="100" stroke="#475569" strokeWidth="1.2" />
              <line x1="140" y1="0" x2="140" y2="200" stroke="#475569" strokeWidth="1.2" />
              <polyline points={buildPlotPath()} fill="none" stroke="#136F63" strokeWidth="2.2" />
              {/* Interactive virtual ruler */}
              <g transform={`translate(140, 100) rotate(${rulerAngle})`}>
                <rect x="-90" y="-8" width="180" height="16" rx="2" fill="rgba(19,111,99,0.16)" stroke="#136F63" strokeWidth="1" />
                {Array.from({ length: 13 }, (_, i) => (
                  <line key={i} x1={-75 + i * 12.5} y1="-8" x2={-75 + i * 12.5} y2="-2" stroke="#0F594F" strokeWidth="1" />
                ))}
              </g>
            </svg>

            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-[#64748B]">Góc thước: {rulerAngle}°</span>
              <input
                type="range"
                min={-90}
                max={90}
                value={rulerAngle}
                onChange={(e) => setRulerAngle(Number(e.target.value))}
                className="flex-1 accent-[#136F63]"
              />
              <button
                onClick={() => setRulerAngle(0)}
                className="rounded-[8px] border border-[#CBD5E1] bg-white p-1 text-[#334155] hover:bg-[#F8FAFC]"
                title="Đặt lại thước"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
