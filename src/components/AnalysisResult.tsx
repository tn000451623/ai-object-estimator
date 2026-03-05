import { Box, Cuboid, Ruler, ListChecks } from "lucide-react";
import { AnalysisData, BoxContentsData } from "../utils/gemini";

interface AnalysisResultProps {
  data: AnalysisData;
  contents?: BoxContentsData;
}

export function AnalysisResult({ data, contents }: AnalysisResultProps) {
  const { main_object, reference_object, reasoning } = data;

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Main Object Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4 text-indigo-600">
            <Cuboid className="w-5 h-5" />
            <h3 className="font-semibold text-lg">主要物體</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-sm">標籤</span>
              <span className="font-medium text-slate-900">{main_object.label}</span>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-sm">體積</span>
              <div className="flex flex-col items-end">
                <span className="font-bold text-slate-900 text-lg">
                  {main_object.volume_m3.toFixed(4)} m³
                </span>
                {main_object.is_cardboard && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                    x1.25 (紙箱)
                  </span>
                )}
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="grid grid-cols-3 gap-2 text-center pt-2">
              <div className="bg-slate-50 p-2 rounded-lg">
                <div className="text-xs text-slate-500 mb-1">長度</div>
                <div className="font-semibold text-slate-900">
                  {main_object.dimensions_m.length.toFixed(3)} <span className="text-xs text-slate-500">m</span>
                </div>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg">
                <div className="text-xs text-slate-500 mb-1">寬度</div>
                <div className="font-semibold text-slate-900">
                  {main_object.dimensions_m.width.toFixed(3)} <span className="text-xs text-slate-500">m</span>
                </div>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg">
                <div className="text-xs text-slate-500 mb-1">高度</div>
                <div className="font-semibold text-slate-900">
                  {main_object.dimensions_m.height.toFixed(3)} <span className="text-xs text-slate-500">m</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reference Object Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4 text-emerald-600">
            <Ruler className="w-5 h-5" />
            <h3 className="font-semibold text-lg">參考物</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-sm">物體</span>
              <span className="font-medium text-slate-900">{reference_object.label}</span>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="p-3 bg-emerald-50 rounded-lg text-sm text-emerald-800">
              偵測到參考物，用於比例尺校準。
            </div>
          </div>
        </div>
      </div>

      {/* Box Contents Card */}
      {contents && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in zoom-in-95 duration-300">
          <div className="flex items-center gap-2 mb-4 text-amber-600">
            <ListChecks className="w-5 h-5" />
            <h3 className="font-semibold text-lg">箱內物品清單</h3>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {contents.items.map((item, idx) => (
                <span key={idx} className="bg-amber-50 text-amber-800 px-3 py-1 rounded-full text-sm font-medium border border-amber-100">
                  {item}
                </span>
              ))}
            </div>
            <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 italic">
              {contents.summary}
            </div>
          </div>
        </div>
      )}

      {/* Reasoning Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4 text-slate-600">
          <Box className="w-5 h-5" />
          <h3 className="font-semibold text-lg">AI 推理過程</h3>
        </div>
        <p className="text-slate-600 leading-relaxed text-sm">
          {reasoning}
        </p>
      </div>
    </div>
  );
}
