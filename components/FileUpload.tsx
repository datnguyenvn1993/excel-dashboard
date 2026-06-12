"use client";
import { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { ParsedData } from "@/types/data";

interface FileUploadProps { onDataParsed: (data: ParsedData) => void; }

export default function FileUpload({ onDataParsed }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) { setError("Please upload an Excel or CSV file."); return; }
    setIsLoading(true); setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
        if (!jsonData.length) { setError("File is empty."); setIsLoading(false); return; }
        onDataParsed({ headers: Object.keys(jsonData[0]), rows: jsonData, fileName: file.name, sheetName, totalRows: jsonData.length });
      } catch { setError("Failed to parse the file."); } finally { setIsLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  }, [onDataParsed]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">Upload Your Data</h2>
        <p className="text-slate-400">Import an Excel or CSV file to generate interactive charts</p>
      </div>
      <div
        onDragOver={(e)=>{e.preventDefault();setIsDragging(true);}}
        onDragLeave={()=>setIsDragging(false)}
        onDrop={(e)=>{e.preventDefault();setIsDragging(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
        onClick={()=>document.getElementById("fi")?.click()}
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${isDragging?"border-blue-400 bg-blue-500/10":"border-slate-600 hover:border-slate-400 bg-slate-800/50"}`}
      >
        <input id="fi" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)processFile(f);}} />
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
            <p className="text-slate-300">Processing...</p>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-700 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Drop your file here</p>
            <p className="text-slate-400 text-sm">or click to browse</p>
            <p className="text-slate-500 text-xs mt-3">Supports .xlsx, .xls, .csv</p>
          </>
        )}
      </div>
      {error && <p className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm">{error}</p>}
    </div>
  );
}
