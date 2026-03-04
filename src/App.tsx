import { useState, useRef, useEffect } from "react";
import { ImageUploader } from "./components/ImageUploader";
import { AnalysisResult } from "./components/AnalysisResult";
import { analyzeImage, AnalysisData } from "./utils/gemini";
import { resizeImage } from "./utils/image";
import { Loader2, RefreshCw, AlertCircle, Trash2, Plus, Box, Download } from "lucide-react";
import { cn } from "./lib/utils";

interface AnalysisItem {
  id: string;
  file: File;
  base64: string;
  analysis: AnalysisData | null;
  status: 'idle' | 'analyzing' | 'success' | 'error';
  error?: string;
  executionTime?: number;
}

export default function App() {
  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Global Timer logic (for overall batch)
  useEffect(() => {
    if (loading) {
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime((Date.now() - startTime) / 1000);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  const handleImagesSelect = (files: File[], base64s: string[]) => {
    const newItems: AnalysisItem[] = files.map((file, index) => ({
      id: Math.random().toString(36).substring(7),
      file,
      base64: base64s[index],
      analysis: null,
      status: 'idle'
    }));
    setItems(prev => [...prev, ...newItems]);
    addLog(`已新增 ${files.length} 張圖片。`);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const recordTrainingData = async (item: AnalysisItem, result: AnalysisData, duration: number) => {
    try {
      await fetch('/api/training-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageName: item.file.name,
          analysis: result,
          duration: duration,
          imageSize: item.file.size,
          imageType: item.file.type,
          imageBase64: item.base64 // Include full image data for training
        }),
      });
      addLog(`已記錄 ${item.file.name} 的分析結果`);
    } catch (error) {
      console.error("Failed to record training data", error);
      addLog(`無法記錄 ${item.file.name} 的分析結果`);
    }
  };

  const handleAnalyzeAll = async () => {
    const itemsToAnalyze = items.filter(item => item.status === 'idle' || item.status === 'error');
    if (itemsToAnalyze.length === 0) return;

    setLoading(true);
    setElapsedTime(0);
    addLog(`開始批次分析 ${itemsToAnalyze.length} 個項目...`);

    // Process sequentially to avoid rate limits and better log flow
    for (const item of itemsToAnalyze) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'analyzing', error: undefined } : i));
      addLog(`正在分析 ${item.file.name}...`);
      
      const itemStartTime = Date.now();

      try {
        addLog(`正在調整 ${item.file.name} 的尺寸...`);
        const resizedBase64 = await resizeImage(item.file);
        
        // Increased timeout to 120 seconds
        const timeoutPromise = new Promise<AnalysisData>((_, reject) => 
          setTimeout(() => reject(new Error("請求超時。請嘗試較小的圖片或再試一次。")), 120000)
        );

        const result = await Promise.race([
          analyzeImage(resizedBase64, "image/jpeg", addLog),
          timeoutPromise
        ]);

        const itemDuration = (Date.now() - itemStartTime) / 1000;

        setItems(prev => prev.map(i => i.id === item.id ? { 
          ...i, 
          status: 'success', 
          analysis: result,
          executionTime: itemDuration
        } : i));
        
        addLog(`${item.file.name} 分析完成，耗時 ${itemDuration.toFixed(2)} 秒`);
        
        // Record result for training
        await recordTrainingData(item, result, itemDuration);

      } catch (err: any) {
        console.error(err);
        const errorMessage = err instanceof Error ? err.message : "分析失敗";
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: errorMessage } : i));
        addLog(`分析 ${item.file.name} 時發生錯誤: ${errorMessage}`);
      }
    }

    setLoading(false);
    addLog("批次分析結束。");
  };

  const handleDownloadData = async () => {
    try {
      const response = await fetch('/api/training-data/download');
      if (!response.ok) {
        if (response.status === 404) {
          alert("尚未有訓練資料。請先分析一些圖片。");
          return;
        }
        throw new Error("下載失敗");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "training_data.jsonl";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading data:", error);
      alert("下載訓練資料失敗");
    }
  };

  const reset = () => {
    setItems([]);
    setLogs([]);
    setElapsedTime(null);
  };

  const totalVolume = items.reduce((acc, item) => {
    if (item.analysis?.main_object?.volume_m3) {
      return acc + item.analysis.main_object.volume_m3;
    }
    return acc;
  }, 0);

  const successfulItems = items.filter(item => item.status === 'success' && item.analysis);
  const totalCount = successfulItems.length;

  const getRecommendedVehicle = (volume: number) => {
    if (volume === 0) return "尚未估算";
    if (volume <= 7.0) return "3.5噸 標準貨車";
    if (volume <= 14.0) return "兩台 3.5噸 或 一台 8噸貨車";
    if (volume <= 21.0) return "三台 3.5噸 或 15噸大貨車";
    return "需專人到府評估 (超大體積)";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
              AI
            </div>
            <h1 className="font-bold text-xl tracking-tight">AI 搬家估算系統</h1>
          </div>
          <div className="text-sm text-slate-500 hidden sm:flex items-center gap-4">
            <span>由 Gemini 3.1 Pro 驅動</span>
            <button 
              onClick={handleDownloadData}
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
              title="下載訓練資料"
            >
              <Download className="w-4 h-4" />
              <span className="text-xs">資料</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Intro */}
        {items.length === 0 && (
          <div className="text-center space-y-4 py-12">
            <h2 className="text-3xl font-bold text-slate-900">
              從照片估算搬家體積
            </h2>
            <p className="text-slate-600 max-w-lg mx-auto">
              請上傳包含 <strong>A4紙</strong>（強烈建議）、<strong>悠遊卡/信用卡</strong> 或 <strong>台幣十元硬幣</strong> 與您想搬運之物體的照片。AI 將根據參考物的已知尺寸來估算傢俱大小與所需車型。
            </p>
          </div>
        )}

        {/* Upload Area */}
        <div className="max-w-xl mx-auto">
          <ImageUploader onImagesSelect={handleImagesSelect} />
        </div>

        {/* Items Grid */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 gap-8">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-slate-700 truncate max-w-[200px]">{item.file.name}</h3>
                    {item.executionTime && (
                      <span className="text-xs font-mono bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">
                        {item.executionTime.toFixed(2)}s
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={() => handleRemoveItem(item.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-1"
                    disabled={loading}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                  {/* Image Preview */}
                  <div className="lg:col-span-2 bg-slate-100 rounded-xl overflow-hidden relative min-h-[300px] flex items-center justify-center">
                    <ItemCanvas item={item} />
                    {item.status === 'analyzing' && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                        <p className="text-indigo-900 font-medium animate-pulse">分析中...</p>
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="absolute inset-0 bg-red-50/90 backdrop-blur-sm flex flex-col items-center justify-center z-10 p-4 text-center">
                        <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
                        <p className="text-red-700 font-medium">{item.error}</p>
                      </div>
                    )}
                  </div>

                  {/* Result */}
                  <div className="lg:col-span-1">
                    {item.analysis ? (
                      <AnalysisResult data={item.analysis} />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 border-2 border-dashed border-slate-100 rounded-xl">
                        <Box className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">等待分析</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Controls & Summary */}
        {items.length > 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            {/* Summary List */}
            {successfulItems.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-semibold text-slate-800 text-sm">估算結果清單</h3>
                </div>
                <div className="p-0 overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-sm text-left text-slate-600">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">
                      <tr>
                        <th className="px-4 py-2">縮圖</th>
                        <th className="px-4 py-2">物體名稱</th>
                        <th className="px-4 py-2">長度 (m)</th>
                        <th className="px-4 py-2">寬度 (m)</th>
                        <th className="px-4 py-2">高度 (m)</th>
                        <th className="px-4 py-2">體積 (m³)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {successfulItems.map((item) => (
                        <tr key={`summary-${item.id}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-2">
                            <img src={`data:${item.file.type};base64,${item.base64}`} alt="thumbnail" className="w-10 h-10 object-cover rounded-md border border-slate-200" />
                          </td>
                          <td className="px-4 py-2 font-medium text-slate-900">
                            {item.analysis?.main_object.label}
                            {item.analysis?.main_object.is_cardboard && (
                              <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">紙箱</span>
                            )}
                          </td>
                          <td className="px-4 py-2">{item.analysis?.main_object.dimensions_m.length.toFixed(3)}</td>
                          <td className="px-4 py-2">{item.analysis?.main_object.dimensions_m.width.toFixed(3)}</td>
                          <td className="px-4 py-2">{item.analysis?.main_object.dimensions_m.height.toFixed(3)}</td>
                          <td className="px-4 py-2 font-semibold text-indigo-600">{item.analysis?.main_object.volume_m3.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-end justify-between">
              <div className="w-full lg:w-auto flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex gap-4 col-span-1 md:col-span-4">
                   <div className="flex-1 px-4 py-3 bg-slate-100 rounded-xl text-slate-600 font-mono font-medium flex flex-col justify-center h-[50px] self-end">
                      <span className="text-[10px] uppercase text-slate-400 leading-none mb-1">總體積</span>
                      <span className="leading-none text-indigo-600 font-bold">{totalVolume.toFixed(4)} m³</span>
                    </div>
                    <div className="flex-1 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800 font-medium flex flex-col justify-center h-[50px] self-end">
                      <span className="text-[10px] uppercase text-indigo-500 leading-none mb-1">建議搬家車型</span>
                      <span className="leading-none font-bold">{getRecommendedVehicle(totalVolume)}</span>
                    </div>
                    <div className="px-4 py-3 bg-slate-100 rounded-xl text-slate-600 font-mono font-medium min-w-[80px] text-center flex flex-col justify-center h-[50px] self-end hidden sm:flex">
                      <span className="text-[10px] uppercase text-slate-400 leading-none mb-1">估算總數</span>
                      <span className="leading-none text-indigo-600 font-bold">{totalCount}</span>
                    </div>
                    {elapsedTime !== null && (
                      <div className="px-4 py-3 bg-slate-100 rounded-xl text-slate-600 font-mono font-medium min-w-[80px] text-center flex flex-col justify-center h-[50px] self-end hidden sm:flex">
                        <span className="text-[10px] uppercase text-slate-400 leading-none mb-1">總耗時</span>
                        <span className="leading-none">{elapsedTime.toFixed(1)}s</span>
                      </div>
                    )}
                </div>
              </div>

              <div className="flex gap-3 w-full lg:w-auto">
                <button
                  onClick={handleAnalyzeAll}
                  disabled={loading || items.length === 0 || items.every(i => i.status === 'success')}
                  className={cn(
                    "flex-1 lg:flex-none py-3 px-6 rounded-xl font-semibold text-white shadow-md transition-all whitespace-nowrap",
                    loading || items.length === 0 || items.every(i => i.status === 'success')
                      ? "bg-slate-300 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5"
                  )}
                >
                  {loading ? "處理中..." : "分析全部"}
                </button>
                <button
                  onClick={reset}
                  disabled={loading}
                  className="px-4 py-3 rounded-xl font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Log Console */}
        <div className="bg-black rounded-xl p-4 shadow-lg border border-slate-800 font-mono text-xs overflow-hidden">
          <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
            <span className="text-slate-400 font-semibold uppercase tracking-wider">系統日誌</span>
            <span className="text-slate-600">{logs.length} 筆事件</span>
          </div>
          <div className="h-32 overflow-y-auto space-y-1 text-slate-300 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {logs.length === 0 ? (
              <div className="text-slate-600 italic">等待活動中...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="break-all border-l-2 border-slate-800 pl-2 hover:border-indigo-500 hover:bg-slate-900/50 transition-colors">
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </main>
    </div>
  );
}

function ItemCanvas({ item }: { item: AnalysisItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = `data:${item.file.type};base64,${item.base64}`;
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      if (item.analysis) {
        const drawBox = (
          box: [number, number, number, number],
          color: string,
          label: string
        ) => {
          const [ymin, xmin, ymax, xmax] = box;
          const x = (xmin / 1000) * canvas.width;
          const y = (ymin / 1000) * canvas.height;
          const w = ((xmax - xmin) / 1000) * canvas.width;
          const h = ((ymax - ymin) / 1000) * canvas.height;

          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(2, canvas.width / 200);
          ctx.strokeRect(x, y, w, h);

          ctx.fillStyle = color;
          const fontSize = Math.max(12, canvas.width / 50);
          ctx.font = `bold ${fontSize}px sans-serif`;
          const textWidth = ctx.measureText(label).width;
          ctx.fillRect(x, y - fontSize - 4, textWidth + 8, fontSize + 4);

          ctx.fillStyle = "white";
          ctx.fillText(label, x + 4, y - 4);
        };

        if (item.analysis.reference_object) {
          drawBox(item.analysis.reference_object.box_2d, "#10b981", "參考物");
        }
        if (item.analysis.main_object) {
          drawBox(item.analysis.main_object.box_2d, "#4f46e5", item.analysis.main_object.label || "目標物體");
        }
      }
    };
  }, [item.base64, item.analysis]);

  return <canvas ref={canvasRef} className="w-full h-full object-contain max-h-[500px]" />;
}
