/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as math from 'mathjs';
import {
  Sun,
  Moon,
  Download,
  Copy,
  Check,
  Trash2,
  Upload,
  RotateCcw,
  Info,
  Sliders,
  History,
  Calculator as CalcIcon
} from 'lucide-react';

// Create mathjs instance with BigNumber support
const mathInstance = math.create(math.all, {
  number: 'BigNumber',
  precision: 128,
});

interface HistoryItem {
  id: string;
  expr: string;
  result: string;
  ts: number;
}

export default function App() {
  // States
  const [expression, setExpression] = useState<string>('');
  const [current, setCurrent] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('calc_history_v3');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('calc_theme_v3') as 'light' | 'dark') || 'light';
  });

  const [precision, setPrecision] = useState<number>(() => {
    const saved = localStorage.getItem('calc_precision_v3');
    return saved ? parseInt(saved, 10) : 14;
  });

  const [mode, setMode] = useState<'rad' | 'deg'>(() => {
    return (localStorage.getItem('calc_mode_v3') as 'rad' | 'deg') || 'rad';
  });

  const [copied, setCopied] = useState<boolean>(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState<boolean>(false);
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [pendingImportData, setPendingImportData] = useState<HistoryItem[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Save state updates to localStorage
  useEffect(() => {
    localStorage.setItem('calc_history_v3', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('calc_theme_v3', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('calc_precision_v3', precision.toString());
  }, [precision]);

  useEffect(() => {
    localStorage.setItem('calc_mode_v3', mode);
  }, [mode]);

  // Escape HTML helper
  const escapeHtml = (unsafe: string) => {
    return unsafe.replace(/[&<>"']/g, (m) => {
      return (
        {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        }[m] || m
      );
    });
  };

  // Parentheses check
  const balancedParentheses = (s: string) => {
    let depth = 0;
    for (const ch of s) {
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth < 0) return false;
      }
    }
    return depth === 0;
  };

  // Preprocess expression
  const preprocess = (expr: string) => {
    let clean = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/π/g, 'pi');
    // Replace percentage like 50% -> (50*0.01)
    clean = clean.replace(/(\d+(\.\d+)?(?:e[+\-]?\d+)?)%/gi, '($1*0.01)');
    return clean;
  };

  // Build evaluation scope
  const buildScope = () => {
    const isDeg = mode === 'deg';

    const wrapTrig = (fnName: string) => {
      return function (x: any) {
        if (x === undefined) return;
        if (isDeg) {
          const rad = mathInstance.multiply(x, mathInstance.pi as any) as any;
          const converted = rad.div(180);
          return (mathInstance as any)[fnName](converted);
        } else {
          return (mathInstance as any)[fnName](x);
        }
      };
    };

    return {
      sin: wrapTrig('sin'),
      cos: wrapTrig('cos'),
      tan: wrapTrig('tan'),
      asin: wrapTrig('asin'),
      acos: wrapTrig('acos'),
      atan: wrapTrig('atan'),
      log: function (x: any) {
        return (mathInstance as any).log10(x);
      },
      ln: function (x: any) {
        return (mathInstance as any).log(x);
      },
      exp: function (x: any) {
        return (mathInstance as any).exp(x);
      },
      sqrt: function (x: any) {
        return (mathInstance as any).sqrt(x);
      },
      abs: function (x: any) {
        return (mathInstance as any).abs(x);
      },
      pi: mathInstance.pi,
      e: mathInstance.e,
    };
  };

  const isExprSafe = (s: string) => {
    return /^[0-9+\-*/()., %eEpiA-Za-z_^]+$/.test(s);
  };

  // Evaluate function
  const safeEvaluate = (exprRaw: string) => {
    const expr = preprocess(exprRaw);
    if (!isExprSafe(expr)) throw new Error('Invalid characters in expression');
    if (!balancedParentheses(expr)) throw new Error('Mismatched parentheses');

    const scope = buildScope();
    const result = mathInstance.evaluate(expr, scope);

    const formatted = mathInstance.format(result, {
      notation: 'auto',
      precision: precision,
    });
    return formatted;
  };

  // History push
  const pushHistory = (expr: string, result: string) => {
    const newItem: HistoryItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      expr,
      result,
      ts: Date.now(),
    };
    setHistory((prev) => [newItem, ...prev].slice(0, 500));
  };

  // Actions
  const appendNumber = (n: string) => {
    setCurrent((prev) => {
      if (prev === '0' && n === '0') return prev;
      if (prev === '0' && n !== '.') return n;
      return prev + n;
    });
  };

  const appendOperator = (op: string) => {
    setExpression((prevExpr) => {
      let updatedExpr = prevExpr;
      if (current !== '') {
        updatedExpr += current;
        setCurrent('');
      }
      if (/[+\-*/^]$/.test(updatedExpr) && /[+\-*/^]/.test(op)) {
        return updatedExpr.slice(0, -1) + op;
      }
      return updatedExpr + op;
    });
  };

  const insertFunction = (fn: string) => {
    if (fn === 'pi') {
      if (current !== '') {
        setExpression((prev) => prev + current);
        setCurrent('');
      }
      setExpression((prev) => prev + 'π');
    } else if (fn === '^') {
      if (current !== '') {
        setExpression((prev) => prev + current);
        setCurrent('');
      }
      setExpression((prev) => prev + '^');
    } else {
      if (current !== '') {
        setExpression((prev) => prev + current);
        setCurrent('');
      }
      setExpression((prev) => prev + fn + '(');
    }
  };

  const clearAll = () => {
    setCurrent('');
    setExpression('');
  };

  const deleteLast = () => {
    if (current !== '') {
      setCurrent((prev) => prev.slice(0, -1));
    } else if (expression !== '') {
      setExpression((prev) => prev.slice(0, -1));
    }
  };

  const calculate = () => {
    try {
      const full = expression + current;
      if (full.trim() === '') return;
      const result = safeEvaluate(full);
      pushHistory(full, result);
      setCurrent(String(result));
      setExpression('');
    } catch (err: any) {
      setCurrent('Error');
      setExpression('');
      console.error(err?.message || err);
    }
  };

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is in an input field or modal
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      const key = e.key;
      if ((key >= '0' && key <= '9') || key === '.') {
        appendNumber(key);
        e.preventDefault();
      } else if (['+', '-', '*', '/', '%', '^'].includes(key)) {
        appendOperator(key);
        e.preventDefault();
      } else if (key === 'Enter' || key === '=') {
        calculate();
        e.preventDefault();
      } else if (key === 'Backspace') {
        deleteLast();
        e.preventDefault();
      } else if (key === 'Escape') {
        clearAll();
        e.preventDefault();
      } else if (key === '(' || key === ')') {
        if (key === '(') {
          if (current !== '') {
            setExpression((prev) => prev + current);
            setCurrent('');
          }
          setExpression((prev) => prev + '(');
        } else {
          if (current !== '') {
            setExpression((prev) => prev + current);
            setCurrent('');
          }
          setExpression((prev) => prev + ')');
        }
        e.preventDefault();
      } else {
        const map: Record<string, string> = {
          s: 'sin',
          c: 'cos',
          t: 'tan',
          l: 'ln',
          o: 'log',
          p: 'pi',
          e: 'exp',
        };
        const lower = key.toLowerCase();
        if (map[lower]) {
          insertFunction(map[lower]);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, expression, mode, precision]);

  // Copy result
  const handleCopy = async () => {
    const text = current === '' ? '0' : current;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  // Export history JSON
  const handleExportHistory = () => {
    const data = JSON.stringify(history, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calculator-history.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import history file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(parsed)) {
          alert('Invalid history format (expected JSON array).');
          return;
        }
        const valid: HistoryItem[] = parsed.filter(
          (it) => it && typeof it.expr === 'string' && 'result' in it
        ).map((it) => ({
          id: it.id || Date.now().toString() + Math.random().toString(36).substring(2, 6),
          expr: it.expr,
          result: String(it.result),
          ts: typeof it.ts === 'number' ? it.ts : Date.now(),
        }));

        if (valid.length === 0) {
          alert('No valid history entries found in file.');
          return;
        }

        setPendingImportData(valid);
        setImportModalOpen(true);
      } catch (err: any) {
        alert('Failed to import history: ' + (err?.message || err));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const processImport = (merge: boolean) => {
    if (!pendingImportData) return;
    if (merge) {
      const combined = [...pendingImportData, ...history];
      const map = new Map<string, HistoryItem>();
      combined.forEach((entry) => {
        const key = `${entry.expr}||${entry.result}`;
        if (!map.has(key) || (entry.ts && map.get(key)!.ts < entry.ts)) {
          map.set(key, entry);
        }
      });
      const merged = Array.from(map.values()).sort((a, b) => b.ts - a.ts);
      setHistory(merged.slice(0, 500));
    } else {
      setHistory(pendingImportData.slice(0, 500));
    }
    setImportModalOpen(false);
    setPendingImportData(null);
  };

  // Download Demo HTML
  const handleDownloadDemo = () => {
    const doctype = document.doctype
      ? new XMLSerializer().serializeToString(document.doctype) + '\n'
      : '<!doctype html>\n';
    const htmlText = doctype + document.documentElement.outerHTML;
    const blob = new Blob([htmlText], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pastel-calculator-v3.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="app-root"
      className={`min-h-screen transition-colors duration-300 font-sans ${
        theme === 'dark'
          ? 'bg-slate-950 text-slate-100'
          : 'bg-gradient-to-b from-sky-50 via-rose-50 to-pink-50 text-slate-800'
      } p-4 sm:p-6 flex flex-col items-center justify-between gap-6`}
    >
      {/* Top Header Controls */}
      <header id="app-header" className="w-full max-w-5xl flex flex-wrap items-center justify-between gap-4 py-2 border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center gap-3">
          <div
            id="logo-icon"
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-400 via-rose-300 to-sky-300 flex items-center justify-center text-white shadow-md shadow-rose-200/50 dark:shadow-none"
          >
            <CalcIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-500 to-sky-600 dark:from-rose-400 dark:to-sky-400">
              Pastel Vibrant Calculator
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              High-Precision Scientific & History Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="theme-toggle-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-sm transition-all text-slate-700 dark:text-slate-200"
            title="Toggle Light/Dark Theme"
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-4 h-4 text-slate-600" />
                <span>Dark Theme</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Light Theme</span>
              </>
            )}
          </button>

          <button
            id="help-btn"
            onClick={() => setShowKeyboardHelp(true)}
            className="p-2 text-xs font-semibold rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-sm transition-all text-slate-700 dark:text-slate-200"
            title="Keyboard Shortcuts"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            id="download-demo-btn"
            onClick={handleDownloadDemo}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-sm transition-all text-slate-700 dark:text-slate-200"
            title="Download full page HTML"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export HTML</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main id="main-content" className="w-full max-w-5xl flex flex-col lg:flex-row gap-6 items-start justify-center">
        {/* History Sidebar */}
        <aside
          id="history-sidebar"
          className="w-full lg:w-72 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-2xl p-4 shadow-xl shadow-rose-100/20 dark:shadow-none border border-white/60 dark:border-slate-800 flex flex-col max-h-[640px]"
        >
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold text-sm">
              <History className="w-4 h-4 text-rose-500" />
              <h2>Calculation History</h2>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 font-medium">
              {history.length}
            </span>
          </div>

          <div id="history-list" className="flex-1 overflow-y-auto space-y-2 pr-1 my-1 custom-scrollbar">
            {history.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                No calculations stored yet
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setExpression('');
                    setCurrent(item.result);
                  }}
                  className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-800/80 hover:bg-rose-50/80 dark:hover:bg-rose-950/30 border border-slate-100 dark:border-slate-700/60 cursor-pointer transition-all text-left group"
                >
                  <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 font-mono truncate gap-2">
                    <span className="truncate">{item.expr}</span>
                    <span className="text-[10px] text-slate-400 opacity-60">
                      {new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono truncate mt-0.5">
                    = {item.result}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* History Actions */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                id="export-history-btn"
                onClick={handleExportHistory}
                disabled={history.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 font-medium text-slate-700 dark:text-slate-300 transition-colors"
                title="Export history to JSON"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>

              <button
                id="import-history-btn"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium text-slate-700 dark:text-slate-300 transition-colors"
                title="Import history from JSON"
              >
                <Upload className="w-3.5 h-3.5" />
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <button
              id="clear-history-btn"
              onClick={() => setHistory([])}
              disabled={history.length === 0}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 disabled:opacity-40 font-medium transition-colors"
              title="Clear all history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>

        {/* Calculator Main Panel */}
        <section
          id="calculator-panel"
          className={`flex-1 w-full max-w-xl rounded-3xl p-5 shadow-2xl transition-all ${
            theme === 'dark'
              ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800'
              : 'bg-gradient-to-br from-pink-100/90 via-sky-100/80 to-purple-100/90 border border-white/80 shadow-rose-200/40'
          }`}
        >
          {/* Controls Bar inside Calculator */}
          <div id="calc-controls" className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white/50 dark:bg-slate-800/50 p-2.5 rounded-2xl border border-white/60 dark:border-slate-700/50">
            <div className="flex items-center gap-2 text-xs">
              <Sliders className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="font-semibold text-slate-600 dark:text-slate-300">Precision:</span>
              <input
                id="precision-slider"
                type="range"
                min="6"
                max="30"
                value={precision}
                onChange={(e) => setPrecision(parseInt(e.target.value, 10))}
                className="w-24 accent-rose-500 cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-rose-500 w-5">{precision}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Mode:</span>
                <select
                  id="mode-select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'rad' | 'deg')}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-semibold text-slate-700 dark:text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  <option value="rad">Radians</option>
                  <option value="deg">Degrees</option>
                </select>
              </div>

              <button
                id="copy-result-btn"
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
                title="Copy result"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Calculator Display */}
          <div
            id="calculator-display"
            className="w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-md rounded-2xl p-4 mb-4 text-right shadow-inner border border-white/80 dark:border-slate-800/80 min-h-[100px] flex flex-col justify-center overflow-hidden"
          >
            <div id="display-expression" className="text-slate-400 dark:text-slate-500 font-mono text-sm min-h-[20px] truncate">
              {expression || '\u00A0'}
            </div>
            <div id="display-current" className="text-3xl sm:text-4xl font-extrabold text-slate-800 dark:text-slate-100 font-mono tracking-wide break-all mt-1">
              {current === '' ? '0' : current}
            </div>
          </div>

          {/* Calculator Numpad Grid */}
          <div id="calculator-keys" className="grid grid-cols-4 gap-2.5 mb-3">
            {/* Row 1 */}
            <button
              id="btn-clear"
              onClick={clearAll}
              className="py-3.5 rounded-xl text-base font-bold bg-gradient-to-b from-amber-100 to-amber-200/80 dark:from-amber-950/50 dark:to-amber-900/40 text-amber-900 dark:text-amber-200 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              C
            </button>
            <button
              id="btn-delete"
              onClick={deleteLast}
              className="py-3.5 rounded-xl text-base font-bold bg-gradient-to-b from-rose-100 to-rose-200/80 dark:from-rose-950/50 dark:to-rose-900/40 text-rose-900 dark:text-rose-200 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              ⌫
            </button>
            <button
              id="btn-paren-open"
              onClick={() => {
                if (current !== '') {
                  setExpression((prev) => prev + current);
                  setCurrent('');
                }
                setExpression((prev) => prev + '(');
              }}
              className="py-3.5 rounded-xl text-base font-semibold bg-gradient-to-b from-sky-100 to-sky-200/80 dark:from-sky-950/50 dark:to-sky-900/40 text-sky-900 dark:text-sky-200 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              (
            </button>
            <button
              id="btn-paren-close"
              onClick={() => {
                if (current !== '') {
                  setExpression((prev) => prev + current);
                  setCurrent('');
                }
                setExpression((prev) => prev + ')');
              }}
              className="py-3.5 rounded-xl text-base font-semibold bg-gradient-to-b from-sky-100 to-sky-200/80 dark:from-sky-950/50 dark:to-sky-900/40 text-sky-900 dark:text-sky-200 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              )
            </button>

            {/* Row 2 */}
            <button
              id="btn-sqrt"
              onClick={() => insertFunction('sqrt')}
              className="py-3 rounded-xl text-sm font-semibold bg-white/90 dark:bg-slate-800/90 text-purple-700 dark:text-purple-300 shadow-sm hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              √
            </button>
            <button
              id="btn-power"
              onClick={() => insertFunction('^')}
              className="py-3 rounded-xl text-sm font-semibold bg-white/90 dark:bg-slate-800/90 text-purple-700 dark:text-purple-300 shadow-sm hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              ^
            </button>
            <button
              id="btn-percent"
              onClick={() => appendOperator('%')}
              className="py-3.5 rounded-xl text-base font-semibold bg-gradient-to-b from-sky-100 to-sky-200/80 dark:from-sky-950/50 dark:to-sky-900/40 text-sky-900 dark:text-sky-200 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              %
            </button>
            <button
              id="btn-divide"
              onClick={() => appendOperator('/')}
              className="py-3.5 rounded-xl text-lg font-bold bg-gradient-to-b from-sky-200 to-sky-300/90 dark:from-sky-900/70 dark:to-sky-800/60 text-sky-950 dark:text-sky-100 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              ÷
            </button>

            {/* Row 3 */}
            <button
              id="btn-num-7"
              onClick={() => appendNumber('7')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              7
            </button>
            <button
              id="btn-num-8"
              onClick={() => appendNumber('8')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              8
            </button>
            <button
              id="btn-num-9"
              onClick={() => appendNumber('9')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              9
            </button>
            <button
              id="btn-multiply"
              onClick={() => appendOperator('*')}
              className="py-3.5 rounded-xl text-lg font-bold bg-gradient-to-b from-sky-200 to-sky-300/90 dark:from-sky-900/70 dark:to-sky-800/60 text-sky-950 dark:text-sky-100 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              ×
            </button>

            {/* Row 4 */}
            <button
              id="btn-num-4"
              onClick={() => appendNumber('4')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              4
            </button>
            <button
              id="btn-num-5"
              onClick={() => appendNumber('5')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              5
            </button>
            <button
              id="btn-num-6"
              onClick={() => appendNumber('6')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              6
            </button>
            <button
              id="btn-subtract"
              onClick={() => appendOperator('-')}
              className="py-3.5 rounded-xl text-lg font-bold bg-gradient-to-b from-sky-200 to-sky-300/90 dark:from-sky-900/70 dark:to-sky-800/60 text-sky-950 dark:text-sky-100 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              −
            </button>

            {/* Row 5 */}
            <button
              id="btn-num-1"
              onClick={() => appendNumber('1')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              1
            </button>
            <button
              id="btn-num-2"
              onClick={() => appendNumber('2')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              2
            </button>
            <button
              id="btn-num-3"
              onClick={() => appendNumber('3')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              3
            </button>
            <button
              id="btn-add"
              onClick={() => appendOperator('+')}
              className="py-3.5 rounded-xl text-lg font-bold bg-gradient-to-b from-sky-200 to-sky-300/90 dark:from-sky-900/70 dark:to-sky-800/60 text-sky-950 dark:text-sky-100 shadow-md hover:brightness-105 active:scale-95 transition-all"
            >
              +
            </button>

            {/* Row 6 */}
            <button
              id="btn-num-0"
              onClick={() => appendNumber('0')}
              className="col-span-2 py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              0
            </button>
            <button
              id="btn-decimal"
              onClick={() => appendNumber('.')}
              className="py-3.5 rounded-xl text-lg font-semibold bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md hover:bg-white dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-100 dark:border-slate-700/60"
            >
              .
            </button>
            <button
              id="btn-equals"
              onClick={calculate}
              className="py-3.5 rounded-xl text-xl font-extrabold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-lg shadow-rose-400/40 dark:shadow-rose-900/40 active:scale-95 transition-all"
            >
              =
            </button>
          </div>

          {/* Scientific Toolbar */}
          <div id="scientific-toolbar" className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 pt-2 border-t border-slate-200/50 dark:border-slate-800/50">
            <button
              id="btn-sin"
              onClick={() => insertFunction('sin')}
              className="py-2 rounded-lg text-xs font-semibold bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all border border-slate-100 dark:border-slate-700/50"
            >
              sin
            </button>
            <button
              id="btn-cos"
              onClick={() => insertFunction('cos')}
              className="py-2 rounded-lg text-xs font-semibold bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all border border-slate-100 dark:border-slate-700/50"
            >
              cos
            </button>
            <button
              id="btn-tan"
              onClick={() => insertFunction('tan')}
              className="py-2 rounded-lg text-xs font-semibold bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all border border-slate-100 dark:border-slate-700/50"
            >
              tan
            </button>
            <button
              id="btn-log"
              onClick={() => insertFunction('log')}
              className="py-2 rounded-lg text-xs font-semibold bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all border border-slate-100 dark:border-slate-700/50"
            >
              log
            </button>
            <button
              id="btn-ln"
              onClick={() => insertFunction('ln')}
              className="py-2 rounded-lg text-xs font-semibold bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all border border-slate-100 dark:border-slate-700/50"
            >
              ln
            </button>
            <button
              id="btn-exp"
              onClick={() => insertFunction('exp')}
              className="py-2 rounded-lg text-xs font-semibold bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all border border-slate-100 dark:border-slate-700/50"
            >
              exp
            </button>
            <button
              id="btn-abs"
              onClick={() => insertFunction('abs')}
              className="py-2 rounded-lg text-xs font-semibold bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all border border-slate-100 dark:border-slate-700/50"
            >
              abs
            </button>
            <button
              id="btn-pi"
              onClick={() => insertFunction('pi')}
              className="py-2 rounded-lg text-xs font-semibold bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-800 text-purple-600 dark:text-purple-300 transition-all border border-slate-100 dark:border-slate-700/50"
            >
              π
            </button>
          </div>
        </section>
      </main>

      {/* Footer Info */}
      <footer id="app-footer" className="text-center text-xs text-slate-500 dark:text-slate-400 py-2">
        <span>Keyboard shortcuts supported (Numbers, + - * / ^, Enter, Backspace, Esc). </span>
        <button
          onClick={() => setShowKeyboardHelp(true)}
          className="underline hover:text-rose-500 font-medium ml-1"
        >
          View All Shortcuts
        </button>
      </footer>

      {/* Keyboard Shortcuts Modal */}
      {showKeyboardHelp && (
        <div id="keyboard-help-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Info className="w-5 h-5 text-rose-500" />
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowKeyboardHelp(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-xl px-2"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">0-9, .</div>
                <div className="self-center">Enter numbers & decimals</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">+ - * / ^ %</div>
                <div className="self-center">Basic math operators</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">Enter / =</div>
                <div className="self-center">Evaluate expression</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">Backspace</div>
                <div className="self-center">Delete last character</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">Escape</div>
                <div className="self-center">Clear calculation</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">s</div>
                <div className="self-center">sin(</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">c</div>
                <div className="self-center">cos(</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">t</div>
                <div className="self-center">tan(</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">l</div>
                <div className="self-center">ln(</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">o</div>
                <div className="self-center">log10(</div>

                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 font-mono">p</div>
                <div className="self-center">π (pi)</div>
              </div>
            </div>

            <button
              onClick={() => setShowKeyboardHelp(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-sm transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Import Choice Modal */}
      {importModalOpen && (
        <div id="import-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-slate-800 text-center">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
              Import History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Found {pendingImportData?.length || 0} valid entries. How would you like to update your current history?
            </p>

            <div className="flex flex-col gap-2">
              <button
                id="merge-import-btn"
                onClick={() => processImport(true)}
                className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-sm transition-colors shadow-md shadow-rose-200 dark:shadow-none"
              >
                Merge with Existing History
              </button>
              <button
                id="replace-import-btn"
                onClick={() => processImport(false)}
                className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-colors"
              >
                Replace Current History
              </button>
              <button
                onClick={() => {
                  setImportModalOpen(false);
                  setPendingImportData(null);
                }}
                className="w-full py-2 text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
