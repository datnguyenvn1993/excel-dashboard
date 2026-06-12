"use client";
import { useMemo, useState } from "react";
import { BarChart,Bar,LineChart,Line,PieChart,Pie,Cell,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer } from "recharts";
import { ParsedData,ColumnInfo,ColumnType } from "@/types/data";
const COLORS=["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
function detectType(vals:unknown[]):ColumnType{const ne=vals.filter(v=>v!==""&&v!=null);return ne.filter(v=>!isNaN(Number(v))&&v!=="").length/ne.length>0.8?"number":"string";}
function analyze(headers:string[],rows:Record<string,unknown>[]):ColumnInfo[]{return headers.map(h=>{const vals=rows.map(r=>r[h]);const type=detectType(vals);const uniqueCount=new Set(vals.map(String)).size;let numericStats;if(type==="number"){const nums=vals.map(Number).filter(n=>!isNaN(n));numericStats={min:Math.min(...nums),max:Math.max(...nums),avg:nums.reduce((a,b)=>a+b,0)/nums.length,sum:nums.reduce((a,b)=>a+b,0)};}return{name:h,type,uniqueCount,numericStats};});}
export default function Dashboard({data}:{data:ParsedData}){
  const{headers,rows,fileName,totalRows}=data;
  const cols=useMemo(()=>analyze(headers,rows),[headers,rows]);
  const numCols=cols.filter(c=>c.type==="number");
  const[xAxis,setXAxis]=useState(cols.find(c=>c.type==="string")?.name||headers[0]);
  const[yAxis,setYAxis]=useState(numCols[0]?.name||headers[1]);
  const[ct,setCt]=useState<"bar"|"line"|"pie">("bar");
  const[page,setPage]=useState(0);const ps=10;
  const cd=useMemo(()=>{const g:Record<string,number>={};rows.forEach(r=>{const k=String(r[xAxis]||"?");g[k]=(g[k]||0)+(Number(r[yAxis])||0);});return Object.entries(g).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,20);},[rows,xAxis,yAxis]);
  const stats=cols.find(c=>c.name===yAxis)?.numericStats;
  const pr=rows.slice(page*ps,(page+1)*ps);const tp=Math.ceil(rows.length/ps);
  const cm={data:cd,margin:{top:5,right:20,left:0,bottom:60}};
  const axis=<>{<CartesianGrid strokeDasharray="3 3" stroke="#334155"/>}<XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:11}} angle={-30} textAnchor="end" interval={0}/><YAxis tick={{fill:"#94a3b8",fontSize:11}} tickFormatter={(v:number)=>v.toLocaleString()}/><Tooltip contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8}} formatter={(v:number)=>v.toLocaleString()}/></>;
  return(
    <div className="space-y-6">
      <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
        <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center"><svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
        <div><p className="text-white text-sm font-medium">{fileName}</p><p className="text-slate-400 text-xs">{totalRows.toLocaleString()} rows · {headers.length} columns</p></div>
      </div>
      {stats&&<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[{l:"Total "+yAxis,v:stats.sum},{l:"Average",v:stats.avg},{l:"Max",v:stats.max},{l:"Min",v:stats.min}].map(s=><div key={s.l} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"><p className="text-slate-400 text-xs uppercase tracking-wider mb-1">{s.l}</p><p className="text-white text-xl font-bold">{s.v.toLocaleString(undefined,{maximumFractionDigits:2})}</p></div>)}</div>}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <div><label className="text-slate-400 text-xs block mb-1">X Axis</label><select value={xAxis} onChange={e=>setXAxis(e.target.value)} className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5">{headers.map(h=><option key={h}>{h}</option>)}</select></div>
          <div><label className="text-slate-400 text-xs block mb-1">Y Axis</label><select value={yAxis} onChange={e=>setYAxis(e.target.value)} className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5">{numCols.map(c=><option key={c.name}>{c.name}</option>)}</select></div>
          <div><label className="text-slate-400 text-xs block mb-1">Type</label><div className="flex gap-1">{(["bar","line","pie"] as const).map(t=><button key={t} onClick={()=>setCt(t)} className={`px-3 py-1.5 rounded-lg text-sm capitalize ${ct===t?"bg-blue-500 text-white":"bg-slate-700 text-slate-300"}`}>{t}</button>)}</div></div>
        </div>
        {ct==="pie"?<ResponsiveContainer width="100%" height={320}><PieChart><Pie data={cd} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>{cd.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={(v:number)=>v.toLocaleString()}/></PieChart></ResponsiveContainer>
        :ct==="line"?<ResponsiveContainer width="100%" height={320}><LineChart {...cm}>{axis}<Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} name={yAxis}/></LineChart></ResponsiveContainer>
        :<ResponsiveContainer width="100%" height={320}><BarChart {...cm}>{axis}<Bar dataKey="value" name={yAxis} radius={[4,4,0,0]}>{cd.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer>}
      </div>
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex justify-between"><h3 className="text-white font-medium">Raw Data</h3><span className="text-slate-400 text-sm">{totalRows.toLocaleString()} rows</span></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-900/50">{headers.map(h=><th key={h} className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{pr.map((row,i)=><tr key={i} className="border-t border-slate-700/50 hover:bg-slate-700/30">{headers.map(h=><td key={h} className="px-4 py-3 text-slate-300 whitespace-nowrap max-w-[200px] truncate">{String(row[h]??"")}</td>)}</tr>)}</tbody></table></div>
        {tp>1&&<div className="px-6 py-4 border-t border-slate-700 flex justify-between"><button onClick={()=>setPage(Math.max(0,page-1))} disabled={page===0} className="text-sm text-slate-400 hover:text-white disabled:opacity-40">← Prev</button><span className="text-slate-400 text-sm">{page+1}/{tp}</span><button onClick={()=>setPage(Math.min(tp-1,page+1))} disabled={page===tp-1} className="text-sm text-slate-400 hover:text-white disabled:opacity-40">Next →</button></div>}
      </div>
    </div>
  );
}
