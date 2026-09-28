const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 });
const num = v => Number(v ?? 0);
const API_URL = "https://epyixyfcwdpkauenljle.supabase.co/functions/v1/summary";

function config(){ return { token:localStorage.getItem("moneyos.apiToken")||"" }; }
function showToast(msg){ const t=$("toast"); t.textContent=msg; t.classList.remove("hidden"); setTimeout(()=>t.classList.add("hidden"),3500); }
function pnlClass(v){ return num(v)>=0?"positive":"negative"; }
function signedMoney(v){ const n=num(v); return `${n>=0?"+":"−"}${money.format(Math.abs(n))}`; }

async function load(){
  const {token}=config();
  if(!token){ $("empty").classList.remove("hidden"); $("dashboard").classList.add("hidden"); return; }
  try{
    const r=await fetch(API_URL,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
    if(!r.ok) throw new Error(r.status===401?"Invalid dashboard token":`API error ${r.status}`);
    const data=await r.json(); render(data);
    $("empty").classList.add("hidden"); $("dashboard").classList.remove("hidden");
  }catch(e){ showToast(e.message); $("empty").classList.remove("hidden"); $("dashboard").classList.add("hidden"); }
}

function render({latest,history,positions,basis}){
  if(!latest){ $("empty").classList.remove("hidden"); return; }
  $("totalValue").textContent=money.format(num(latest.total_value));
  $("totalCost").textContent=money.format(num(latest.total_cost));
  $("unrealized").textContent=signedMoney(latest.unrealized_pnl); $("unrealized").className=pnlClass(latest.unrealized_pnl);
  $("realized").textContent=signedMoney(latest.realized_pnl); $("realized").className=pnlClass(latest.realized_pnl);
  const nb=$("niftyDay"); const np=latest.benchmark_day_pct; nb.textContent=np==null?"—":`${num(np)>=0?"+":""}${num(np).toFixed(2)}%`; nb.className=np==null?"":pnlClass(np);
  const dc=$("dayChange");
  if(latest.day_change == null || latest.day_change_pct == null){
    dc.textContent="— today"; dc.className="pill";
  } else {
    dc.textContent=`${signedMoney(latest.day_change)} (${num(latest.day_change_pct).toFixed(2)}%) today`;
    dc.className=`pill ${pnlClass(latest.day_change)}`;
  }
  const refreshed=latest.updated_at ? new Date(latest.updated_at).toLocaleString("en-IN", {dateStyle:"medium", timeStyle:"short"}) : latest.snapshot_date;
  $("asOf").textContent=`Refreshed ${refreshed}`;
  $("basisNote").textContent=basis?.as_of ? `Performance basis: CDSL opening baseline ${basis.as_of}; equity and demat-held fund P&L is measured from that baseline where original cost is unavailable.` : "";
  $("holdingCount").textContent=`${positions.length} positions`;
  $("holdings").innerHTML=positions.map(p=>{
    const i=p.instruments||{}; const name=i.symbol||i.name||i.scheme_code||"Instrument";
    return `<div class="holding"><div><div class="name">${escapeHtml(name)}</div><div class="meta">${escapeHtml(i.exchange||i.asset_type||"")} · ${num(p.quantity).toLocaleString("en-IN")} units · avg ${money.format(num(p.average_cost))}</div></div><div class="value"><div>${money.format(num(p.market_value))}</div><div class="${pnlClass(p.unrealized_pnl)}">${signedMoney(p.unrealized_pnl)}</div></div></div>`;
  }).join("");
  drawChart(history||[]);
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}

function drawChart(history){
  const canvas=$("chart"), dpr=window.devicePixelRatio||1, rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(300,rect.width)*dpr; canvas.height=220*dpr;
  const ctx=canvas.getContext("2d"); ctx.scale(dpr,dpr); const w=canvas.width/dpr,h=canvas.height/dpr; ctx.clearRect(0,0,w,h);
  if(history.length<2){ctx.fillStyle="#9199a6";ctx.fillText("History will appear after multiple snapshots",12,24);return;}
  const vals=history.map(x=>num(x.total_value)), min=Math.min(...vals), max=Math.max(...vals), span=Math.max(1,max-min), pad=18;
  ctx.strokeStyle="#73808e"; ctx.lineWidth=2; ctx.beginPath();
  vals.forEach((v,idx)=>{ const x=pad+(idx/(vals.length-1))*(w-pad*2), y=h-pad-((v-min)/span)*(h-pad*2); idx?ctx.lineTo(x,y):ctx.moveTo(x,y); });
  ctx.stroke();
}

$("settingsBtn").onclick=()=>{ $("apiToken").value=config().token; $("settingsDialog").showModal(); };
$("settingsForm").addEventListener("submit",e=>{ if(e.submitter?.value==="cancel") return; localStorage.setItem("moneyos.apiToken",$("apiToken").value.trim()); setTimeout(load,0); });
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
load();
