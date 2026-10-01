// Page logic. Expects DATA and makeCore() to be defined above it.
const C=makeCore(DATA), I=C.I, R=C.R;
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function fmt(x){ if(!isFinite(x)) return "—"; if(Math.abs(x)<1e-9) return "0"; const a=Math.abs(x); if(a>=1000) return Math.round(x).toLocaleString(); if(a>=100) return x.toFixed(0); if(a>=10) return (+x.toFixed(1)).toString(); return (+x.toFixed(2)).toString(); }
const plural=(n,w)=>n+" "+(n===1?w:(/y$/.test(w)?w.slice(0,-1)+"ies":(/s$/.test(w)?w:w+"s")));
const listAnd=a=>a.length<=1?a.join(""):a.length===2?a.join(" and "):a.slice(0,-1).join(", ")+" and "+a[a.length-1];
const DEFAULT_RATE={"Coke Powder":45,"Advanced Fertilizer":60,"Glass":60};
$("ver").textContent="game "+DATA.version;

// ---------- settings ----------
const maxTier=Math.max(...Object.values(I).map(i=>i.tier));
for(let t=1;t<=maxTier;t++){ const o=document.createElement("option"); o.value=t; o.textContent=t; $("tier").appendChild(o); }
$("tier").value=maxTier;
// your settings are remembered in this browser
const SET_IDS=["tier","fe","mL","mW","mH","connmax"];
try{ const sv=JSON.parse(localStorage.getItem("bsp_settings")||"{}")||{}; for(const id of SET_IDS){ const v=+sv[id]; if(sv[id]!=null&&sv[id]!==""&&isFinite(v)&&v>=0&&(id!=="tier"||(v>=1&&v<=maxTier))) $(id).value=sv[id]; } }catch(e){}
const saveSettings=()=>{ try{ const o={}; for(const id of SET_IDS) o[id]=$(id).value; localStorage.setItem("bsp_settings",JSON.stringify(o)); }catch(e){} };
const num=(id,def,min)=>Math.max(min,+$(id).value||def);
const cap=()=>num("mL",14,1)*num("mW",14,1)*num("mH",15,1);
const dimTxt=()=>num("mL",14,1)+"×"+num("mW",14,1)+"×"+num("mH",15,1);
const tierMax=()=>+$("tier").value;
const fe=()=>Math.max(0,+$("fe").value||0);
const inTier=n=>I[n]&&I[n].tier<=tierMax();

// ---------- your own decisions: one per item, applied to every module (kept in this browser only) ----------
let choice={};
try{ choice=JSON.parse(localStorage.getItem("bsp_choice")||"{}")||{}; }catch(e){ choice={}; }
const saveChoice=()=>{ try{ localStorage.setItem("bsp_choice",JSON.stringify(choice)); }catch(e){} };
function decide(item,to){ if(to===null) delete choice[item]; else choice[item]=to; saveChoice(); redrawAll(); }

// ---------- the bus line for the current tier and tile size ----------
let LINE=null, lineKey="";
function line(){ const k=tierMax()+"|"+cap(); if(k!==lineKey){ LINE=C.busLine(tierMax(),cap()); lineKey=k; } return LINE; }
// Where an item stands. code: ded (own wagon type), mix (shared research wagon), maybe, no
function status(n){
  const it=I[n], L=line(); const users=it.uses.filter(inTier); const made=it.kind==="made"&&!it.liq;
  const usesTxt=listAnd(users.slice(0,4))+(users.length>4?" and others":"");
  if(choice[n]==="bus") return {code:"ded",mine:true,why:"Your choice. Every module that needs it takes it off the bus."};
  if(choice[n]==="off") return {code:"no",mine:true,why:"Your choice. Every module that needs it makes its own."+(L.bus.has(n)&&!C.UNIVERSAL.includes(n)?" Check those modules still fit: the "+listAnd((L.forcedBy[n]||[]).slice(0,3))+" module didn't have room for it.":"")};
  if(n==="Coke Powder") return {code:"ded",why:"Always. It's the fuel for every heated machine, and an ingredient in steel and some potions."};
  if(n==="Advanced Fertilizer") return {code:"ded",why:"Always. Every nursery in the base runs on it."};
  if(it.relic) return {code:"mix",why:"A relic. It only goes to the shop and to research, so it rides one shared \"research\" wagon type with the other relics."+(users.length?" "+usesTxt+" also take"+(users.length>1?"":"s")+" it off that wagon.":"")};
  if(L.bus.has(n)){ const fb=L.forcedBy[n]||[]; return {code:"ded",why:"The "+listAnd(fb.slice(0,3))+" module"+(fb.length>1?"s":"")+" can't fit making "+(fb.length>1?"their":"its")+" own "+n.toLowerCase()+" in one tile."}; }
  if(it.liq) return {code:"no",why:"Hard no. A liquid, piped inside whatever uses it."};
  if(it.kind==="raw") return {code:"no",why:"Hard no. Bought with coins inside whatever uses it."};
  if(it.kind==="crop") return {code:"no",why:"Hard no. Grown in nurseries inside whatever uses it."};
  { const src=C.simpleFrom(n); if(src&&inTier(src)){ if(onBus(src)) return {code:"no",why:"No. It's a straight one-for-one conversion of "+src+" in a single "+R[n].machine+". "+src+" is what rides the bus, and you convert it right where it's needed"+(it.sell?", including next to the shop":"")+"."};
      return {code:"no",why:"No. It's a straight one-for-one conversion of "+src+" in a single "+R[n].machine+". Whatever module needs it grinds its own from the "+src.toLowerCase()+" it already has"+(it.sell?". The shop's share gets made next to the shop.":".")}; } }
  if(!it.dense) return {code:"no",why:"Hard no. Bulk ("+it.rtxt+"). Make it right where it's used."+(it.sell?" The shop's share gets made next to the shop.":"")};
  if(users.length) return {code:"maybe",why:"Packed down ("+it.rtxt+"), but "+(users.length<=2?"only ":"just ")+usesTxt+" use"+(users.length>1?"":"s")+" it"+(it.sell?", plus the shop":"")+". Bus it from its own module, or build it into the "+usesTxt+" module"+(users.length>1?"s":"")+(it.sell?" and make the shop's share next to the shop":"")+". Fits either way."};
  if(it.sell) return {code:"no",why:"Only sold. Make it next to the shop."};
  return {code:"no",why:"Nothing at this tier uses it."};
}
const onBus=n=>{ const c=status(n).code; return c==="ded"||c==="mix"; };
function cutsFor(root){ const s=new Set(); for(const n in I) if(n!==root&&inTier(n)&&I[n].kind==="made"&&!I[n].liq&&onBus(n)) s.add(n); for(const u of C.UNIVERSAL) if(u!==root) s.add(u); return s; }
let cutCache={}, cutKey="";
function cuts(root){ const k=lineKey+"|"+JSON.stringify(choice); if(k!==cutKey){ cutCache={}; cutKey=k; } return cutCache[root]||(cutCache[root]=cutsFor(root)); }
const verdict=(lo,hi)=>hi<=100?["ok","Fits"]:(lo<=100?["edge","Tight squeeze"]:["over","Too big"]);
const SLABEL={ded:"Yes · own wagons",mix:"Yes · shared wagon",maybe:"Maybe",no:"No"};
const SORD={ded:0,mix:1,maybe:2,no:3};

// ---------- tab 1: what goes on the bus ----------
const flt={ded:true,mix:true,maybe:true,no:true,sold:false,basic:true};
function tog(id,key){ const b=$(id); b.setAttribute("aria-pressed",flt[key]); b.onclick=()=>{ flt[key]=!flt[key]; b.setAttribute("aria-pressed",flt[key]); renderItems(); }; }
tog("f-ded","ded"); tog("f-mix","mix"); tog("f-maybe","maybe"); tog("f-no","no"); tog("f-sold","sold"); tog("f-basic","basic");
let sortK="bus", sortDir=1;
function itemRow(n){
  const it=I[n]; const made=it.kind==="made"&&!it.liq; const st=status(n); const users=it.uses.filter(inTier);
  return {n,it,st,users,made};
}
const KEY={item:r=>r.n,bus:r=>SORD[r.st.code],why:r=>r.st.why,used:r=>r.users.join(", ")||"~",sell:r=>r.it.sell||0,tier:r=>r.it.tier};
$("sorthead").addEventListener("click",e=>{ const b=e.target.closest(".sortb"); if(!b) return; const k=b.dataset.k; if(sortK===k) sortDir=-sortDir; else{ sortK=k; sortDir=1; } renderItems(); });
function renderItems(){
  document.querySelectorAll(".sortb").forEach(x=>{ const on=x.dataset.k===sortK; x.dataset.dir=on?(sortDir>0?"asc":"desc"):""; });
  const q=$("q").value.trim().toLowerCase();
  let rows=Object.keys(I).filter(inTier).map(itemRow);
  rows=rows.filter(r=>flt[r.st.code]&&(!flt.sold||r.it.sell)&&(!flt.basic||r.made)&&(!q||r.n.toLowerCase().includes(q)||r.users.some(u=>u.toLowerCase().includes(q))));
  rows.sort((a,b)=>{ const ka=KEY[sortK](a), kb=KEY[sortK](b); let c=typeof ka==="number"?ka-kb:String(ka).localeCompare(String(kb)); if(!c) c=a.it.tier-b.it.tier||a.n.localeCompare(b.n); return c*sortDir; });
  const cnt={ded:0,mix:0,maybe:0,no:0}; rows.forEach(r=>cnt[r.st.code]++);
  $("count").textContent=rows.length+" shown: "+cnt.ded+" own wagons, "+cnt.mix+" shared wagon, "+cnt.maybe+" maybe, "+cnt.no+" no";
  $("rows").innerHTML=rows.map(r=>{
    const name=r.made?`<button class="link" data-mod="${esc(r.n)}">${esc(r.n)}</button>`:`<span class="name">${esc(r.n)}</span>`;
    const used=[...r.users.map(u=>`<span class="chip">${esc(u)}</span>`), r.it.relic?`<span class="chip resc">Research</span>`:"", r.it.sell?`<span class="chip shopc">Shop</span>`:""].join("")||"—";
    let act="";
    if(r.made&&!C.UNIVERSAL.includes(r.n)){
      if(r.st.mine) act=`<button class="swap" data-item="${esc(r.n)}" data-to="">Undo my choice</button>`;
      else if(r.st.code==="ded"||r.st.code==="mix") act=`<button class="swap" data-item="${esc(r.n)}" data-to="off">Keep it off the bus</button>`;
      else act=`<button class="swap" data-item="${esc(r.n)}" data-to="bus">Put it on the bus</button>`;
    }
    return `<tr><td class="nmc">${name}</td><td class="stc"><span class="st ${r.st.code}">${SLABEL[r.st.code]}</span>${r.st.mine?'<div class="mine">your choice</div>':""}</td><td class="why">${esc(r.st.why)}</td><td class="act">${act}</td><td class="usedc"><div class="chips">${used}</div></td><td class="num">${r.it.sell?r.it.sell.toLocaleString():""}</td><td class="num">${r.it.tier}</td></tr>`; }).join("")||`<tr><td colspan="7" class="empty">Nothing matches.</td></tr>`;
}
$("q").oninput=renderItems;
$("rows").addEventListener("click",e=>{ const s=e.target.closest(".swap"); if(s){ decide(s.dataset.item,s.dataset.to||null); return; } const b=e.target.closest("[data-mod]"); if(b) openMod(b.dataset.mod); });
$("undoall").onclick=()=>{ choice={}; saveChoice(); redrawAll(); };
$("choicelist").addEventListener("click",e=>{ const x=e.target.closest(".x"); if(x) decide(x.dataset.item,null); });

// ---------- tabs ----------
const TABS=["items","mods","rates"];
function setTab(w){ for(const k of TABS){ $("tab-"+k).setAttribute("aria-selected",k===w); $("pane-"+k).hidden=k!==w; } }
for(const k of TABS) $("tab-"+k).onclick=()=>setTab(k);

// ---------- tab 2: build a module ----------
let cur=null;
const modNames=()=>Object.keys(I).filter(n=>I[n].kind==="made"&&!I[n].liq&&inTier(n)).sort((a,b)=>I[a].tier-I[b].tier||a.localeCompare(b));
function renderList(){
  const q=$("mq").value.trim().toLowerCase();
  const names=modNames().filter(n=>!q||n.toLowerCase().includes(q));
  $("modlist").innerHTML=names.map(n=>`<button data-r="${esc(n)}" aria-current="${n===cur}"><span>${esc(n)}${onBus(n)?' <i class="bustag">bus</i>':""}</span><small>T${I[n].tier}</small></button>`).join("")||`<div class="empty" style="padding:10px">Nothing matches.</div>`;
  $("modsel").innerHTML=modNames().map(n=>`<option value="${esc(n)}"${n===cur?" selected":""}>${esc(n)} (T${I[n].tier})</option>`).join("");
}
$("mq").oninput=renderList;
$("modlist").onclick=e=>{ const b=e.target.closest("button"); if(b) openMod(b.dataset.r); };
$("modsel").onchange=e=>openMod(e.target.value);
function startRate(root){ if(DEFAULT_RATE[root]) return DEFAULT_RATE[root]; const cs=cuts(root), block=C.cleanRate(root,cs), one=C.rate(R[root],root).per; const v=C.volume(C.solve(root,block,cs)).v; return v*C.HI<=cap()?block:one; }
function openMod(root){ cur=root; $("rate").value=+startRate(root).toPrecision(5); setTab("mods"); renderList(); renderMod(); window.scrollTo&&window.scrollTo(0,0); }
const rowKV=(k,v,sub)=>`<div class="row"><span>${k}${sub?` <small class="mut">${sub}</small>`:""}</span><span>${v}</span></div>`;
function chain(root,cs){ const seen=new Set(), out=[];
  const walk=(n,d)=>{ if(seen.has(n)) return; seen.add(n); if(n!==root) out.push({n,d}); if(n!==root&&cs.has(n)) return; const r=R[n]; if(!r||I[n].kind==="raw") return; for(const i in r.ins) walk(i,d+1); };
  walk(root,0); return out; }
function renderMod(){
  if(!cur) return; const root=cur, rate=Math.max(0,+$("rate").value||0), cs=cuts(root), L=line();
  const sol=C.solve(root,rate,cs), one=C.solve(root,1,cs);
  // bus connections: each item coming off or going onto the bus needs a station, and a station carries CONN items a minute
  const selfFuel=root==="Coke Powder", selfFert=root==="Advanced Fertilizer";
  const CONN=120, connMax=num("connmax",8,1), fuel1=C.fuelPerMin(one,fe());
  const perUnit={}; for(const k in one.busIn) if(one.busIn[k]>1e-12) perUnit[k]=one.busIn[k];
  if(!selfFuel&&fuel1>1e-12) perUnit["Coke Powder"]=(perUnit["Coke Powder"]||0)+fuel1;
  if(!selfFert&&one.fert>1e-12) perUnit["Advanced Fertilizer"]=(perUnit["Advanced Fertilizer"]||0)+one.fert;
  const outUnit=Math.max(0,1-(selfFuel?fuel1:0)-(selfFert?one.fert:0));
  const stations=f=>f>1e-9?Math.ceil(f/CONN-1e-9):0;
  const connAt=r=>{ let c=stations(outUnit*r); for(const k in perUnit) c+=stations(perUnit[k]*r); return c; };
  $("mname").textContent=root;
  const it=I[root], st=status(root); const users=it.uses.filter(inTier);
  const ends=[...users, it.relic?"research":"", it.sell?"the shop":""].filter(Boolean);
  $("mmeta").innerHTML=`Tech tier ${it.tier}`+(it.sell?` · sells for ${it.sell.toLocaleString()}`:"")+(ends.length?` · goes to ${esc(listAnd(ends))}`:" · nothing at this tier uses it")+` · on the bus: <b class="${st.code==="no"?"":"cu"}">${SLABEL[st.code].toLowerCase()}</b>`;

  // --- fit ---
  const block=C.cleanRate(root,cs), step=C.rate(R[root],root).per, cp=cap();
  const fillAt=r=>{ const v=C.volume(one,r).v; return [v*C.LO/cp*100,v*C.HI/cp*100]; };
  const isClean=rate>0&&Math.abs(rate/block-Math.round(rate/block))<1e-6;
  // sizes people would actually build. A size counts as tidy when every machine count is whole,
  // or all whole except one machine that runs at exactly half (like 4.5 Athanors).
  const evenness=r=>{ let half=0, odd=0; for(const m of one.list){ const n=m.count*r; if(m.machine==="Nursery"||n<=1+1e-9) continue; const d=Math.abs(n-Math.round(n)); if(d<0.02) continue; if(Math.abs(d-0.5)<0.02) half++; else odd++; } return {half,odd}; };
  // every size on the grid of whole final machines and half clean blocks, each scored by how evenly its machines come out
  const grid=new Set(); { const lim=6000; let over=0;
    const stepA=step, stepB=block/2; let a=stepA, b=stepB, guard=0;
    while(guard++<lim){ const r=Math.min(a,b); if(Math.abs(a-r)<1e-9) a+=stepA; if(Math.abs(b-r)<1e-9) b+=stepB; grid.add(+r.toFixed(6)); const lo=fillAt(r)[0]; if(lo>100||connAt(r)>connMax){ if(!over) over=r; if(r>=over*1.5) break; } } }
  const cand=[...grid].sort((x,y)=>x-y).map(r=>{ const [lo,hi]=fillAt(r), ev=evenness(r); const conn=connAt(r), cOver=conn>connMax; return {r,lo,hi,conn,cOver,cls:cOver?"over":(hi<=100?"fit":(lo<=100?"tight":"over")),half:ev.half,odd:ev.odd}; });
  const near=(x,m)=>Math.abs(x/m-Math.round(x/m))<1e-6&&x/m>0.5; const round=x=>near(x,5);
  const pickMap=new Map(); const addRow=(c,label)=>{ if(c&&!pickMap.has(c.r)) pickMap.set(c.r,[c,label]); };
  const BELTS=[[30,"Half a belt"],[60,"One full belt"],[90,"A belt and a half"],[120,"Two full belts"]];
  for(const [v,label] of BELTS){ const c=cand.find(c=>Math.abs(c.r-v)<1e-6); if(c&&c.cls!=="over"&&!c.odd) addRow(c,label); }
  const fitC=cand.filter(c=>c.cls==="fit"), tightC=cand.filter(c=>c.cls==="tight"), overC=cand.filter(c=>c.cls==="over");
  // best = most machines coming out even (no uneven counts, then fewest halves), then a round output, then the bigger size
  const best=(a,smallest)=>{ if(!a.length) return null; return a.slice().sort((x,y)=>(x.odd-y.odd)||(round(y.r)-round(x.r))||(x.half-y.half)||(smallest?x.r-y.r:y.r-x.r))[0]; };
  { const b=best(fitC); addRow(b, b&&round(b.r)?"Biggest round size that fits":"Biggest that fits"); }
  addRow(best(tightC), "Tight squeeze");
  addRow(best(overC.filter(c=>c.r<=overC[0].r*1.3),true), "First size that won't fit");
  const pick=[...pickMap.values()].sort((a,b)=>a[0].r-b[0].r);
  const evTxt=c=>c.odd?plural(c.odd,"machine count")+" uneven":(c.half?"All whole, except "+(c.half===1?"one machine":c.half+" machines")+" at half":"All machine counts whole");
  let rows=""; for(const [c,what] of pick){ const [cc,t]=c.cOver?["over","Too big"]:verdict(c.lo,c.hi);
    rows+=`<tr class="${Math.abs(c.r-rate)<1e-6?"sel":""}"><td>${what}</td><td class="num">${fmt(c.r)}/min</td><td class="num">${Math.round(c.lo)}–${Math.round(c.hi)}%</td><td><span class="fitpill ${cc}">${t}</span>${c.cOver?` <small class="mut">needs ${c.conn} bus connections</small>`:""}</td><td class="num">${c.conn} of ${connMax}</td><td>${evTxt(c)}</td><td><button class="link" data-rate="${c.r}">Use this</button></td></tr>`; }
  if(!fitC.length&&!tightC.length) rows=`<tr><td colspan="7" class="empty">Even the smallest size is too big for this tile.</td></tr>`+rows;
  const evNow=evenness(rate);
  let mC=0,mT=0,bC=0,bT=0;
  for(let k=1;k<=800;k++){ const r=k*step, [lo,hi]=fillAt(r); if(connAt(r)>connMax) break; if(hi<=100) mC=r; if(lo<=100) mT=r; else break; }
  for(let n=1;n<=60;n++){ const [lo,hi]=fillAt(n*block); if(connAt(n*block)>connMax) break; if(hi<=100) bC=n*block; if(lo<=100) bT=n*block; else break; }
  const fin=one.list.find(m=>m.item===root)||one.list[0];
  const [flo,fhi]=fillAt(rate); const connNow=connAt(rate), connBad=connNow>connMax; const [fc,ft]=connBad?["over","Too big"]:verdict(flo,fhi);
  $("fit").innerHTML=`<div class="fitbox">
    <div class="fithead"><span class="fitpill ${fc}">${ft}</span> <b>${fmt(rate)}/min takes about ${Math.round(flo)}–${Math.round(fhi)}% of a ${dimTxt()} tile${connBad?`, but needs ${connNow} bus connections and a tile only has ${connMax}`:` and ${connNow} of its ${connMax} bus connections`}.</b>${rate>0&&evNow.odd?` <span class="fitsub">At this size ${plural(evNow.odd,"machine count")} ${evNow.odd>1?"don't":"doesn't"} come out even, so those machines sit partly idle (see Busy).</span>`:(rate>0&&evNow.half?` <span class="fitsub">Every machine count is whole except ${evNow.half>1?evNow.half+" that run":"one that runs"} at half.</span>`:"")}</div>
    <div class="maxline">
      <div><span class="lab">Clean block</span> <b>${fmt(block)}/min</b> <span class="fitsub">the smallest size where every machine count comes out whole</span></div>
      <div><span class="lab">Most that fits, clean blocks</span> ${bC?`<b>${fmt(bC)}/min</b> comfortably`:`<b>none</b> comfortably`}${bT>bC?` · <b>${fmt(bT)}/min</b> as a tight squeeze`:""}</div>
      <div><span class="lab">Most that fits, any size</span> ${mC?`<b>${fmt(mC)}/min</b> comfortably`:`<b>none</b> comfortably`}${mT>mC?` · <b>${fmt(mT)}/min</b> as a tight squeeze`:""} <span class="fitsub">in steps of one ${esc(fin.machine)}, ${fmt(step)}/min each</span></div>
    </div>
    <div class="tablebox inner"><table class="fitt"><thead><tr><th>Sizes worth building in this tile</th><th class="num">Output</th><th class="num">Fill</th><th>Verdict</th><th class="num">Bus connections</th><th>Machine counts</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="fitsub">Fill is the machines' own size (plus a stone furnace under each group of heated machines) times 2.4–2.8 to allow for belts, lifts and stands. That spread was measured on your coke and fertilizer modules. Knowledge altars, splitters and chests aren't counted.</p></div>`;

  // --- what comes in and out ---
  const fuel=C.fuelPerMin(sol,fe());
  let bus=""; const busItems=Object.entries(sol.busIn).filter(([,v])=>v>1e-9).sort((a,b)=>b[1]-a[1]);
  for(const [k,v] of busItems) bus+=rowKV(esc(k),fmt(v)+"/min","ingredient");
  if(fuel>1e-9&&!selfFuel) bus+=rowKV("Coke Powder",fmt(fuel)+"/min","fuel for the heated machines");
  if(sol.fert>1e-9&&!selfFert) bus+=rowKV("Advanced Fertilizer",fmt(sol.fert)+"/min","for the nurseries");
  const busTotal=busItems.reduce((a,[,v])=>a+v,0)+(selfFuel?0:fuel)+(selfFert?0:sol.fert);
  $("busin").innerHTML=(bus||`<div class="empty">Nothing. This module runs on coins alone.</div>`)+(bus?`<div class="row tot"><span>Total off the bus</span><span>${fmt(busTotal)}/min</span></div>`:"");
  let coins=""; for(const [k,v] of Object.entries(sol.coins).sort((a,b)=>b[1]*I[b[0]].buy-a[1]*I[a[0]].buy)) coins+=rowKV(esc(k),fmt(v)+"/min",fmt(v*I[k].buy)+" copper/min");
  $("coins").innerHTML=(coins||`<div class="empty">No coins needed.</div>`)+(coins?`<div class="row tot"><span>Total coins</span><span>${fmt(sol.copper)} copper/min</span></div>`:"");
  let outp=rowKV(esc(root)+" made",fmt(rate)+"/min");
  if(selfFuel&&fuel>1e-9){ outp+=rowKV("Burned as its own fuel","−"+fmt(fuel)+"/min"); outp+=`<div class="row tot"><span>Leaves the module</span><span>${fmt(rate-fuel)}/min</span></div>`; }
  else if(selfFert&&sol.fert>1e-9){ outp+=rowKV("Fed to its own nurseries","−"+fmt(sol.fert)+"/min"); outp+=`<div class="row tot"><span>Leaves the module</span><span>${fmt(rate-sol.fert)}/min</span></div>`; }
  else outp+=`<div class="row tot"><span>Leaves the module</span><span>${fmt(rate)}/min</span></div>`;
  for(const [k,v] of Object.entries(sol.spare)) outp+=rowKV("Spare "+esc(k),fmt(v)+"/min","byproduct");
  $("outp").innerHTML=outp;
  let cn=""; for(const k of Object.keys(perUnit).sort((a,b)=>perUnit[b]-perUnit[a])) cn+=rowKV(esc(k)+" in",stations(perUnit[k]*rate),fmt(perUnit[k]*rate)+"/min");
  cn+=rowKV(esc(root)+" out",stations(outUnit*rate),fmt(outUnit*rate)+"/min");
  cn+=`<div class="row tot"><span>Total</span><span class="${connBad?"bad":""}">${connNow} of ${connMax}</span></div>`;
  $("conn").innerHTML=cn;

  // --- ingredients ---
  $("ingr").innerHTML=chain(root,cs).map(({n,d})=>{ const x=I[n]; if(!x) return ""; const fromBus=cs.has(n);
    const amt=fromBus?(sol.busIn[n]||0):(x.kind==="raw"?(sol.coins[n]||0):(sol.flows[n]||0));
    let src, act="", mark="";
    if(x.liq) src=`<span class="src pipe">Piped here</span>`;
    else if(x.kind==="raw") src=`<span class="src coin">Bought with coins</span>`;
    else if(x.kind==="crop") src=`<span class="src here">Grown here</span>`;
    else { const s=status(n);
      if(fromBus){ src=`<span class="src bus">Off the bus</span>`; if(!C.UNIVERSAL.includes(n)) act=s.mine?`<button class="swap" data-item="${esc(n)}" data-to="">Undo my choice</button>`:`<button class="swap" data-item="${esc(n)}" data-to="off">Keep it off the bus</button>`; if(!s.mine&&L.forcedBy[n]&&L.forcedBy[n].includes(root)) mark=` <small class="mut">(won't fit otherwise)</small>`; }
      else { src=`<span class="src here">Made here</span>`; act=s.mine?`<button class="swap" data-item="${esc(n)}" data-to="">Undo my choice</button>`:`<button class="swap" data-item="${esc(n)}" data-to="bus">Put it on the bus</button>`; if(s.code==="maybe") mark=` <small class="mut">(a maybe)</small>`; }
      if(s.mine) mark=` <small class="mut">(your choice)</small>`; }
    return `<tr><td style="padding-left:${10+Math.min(d-1,6)*14}px">${esc(n)}</td><td class="num">${fmt(amt)}/min</td><td>${src}${mark}</td><td>${act}</td></tr>`; }).join("")||`<tr><td colspan="4" class="empty">No ingredients.</td></tr>`;

  // --- machines ---
  $("mrows").innerHTML=sol.list.map(m=>{ const n=m.count, b=Math.ceil(n-1e-9), busy=b?n/b*100:0;
    return `<tr><td>${esc(m.machine)}${m.heat?'<span class="heat">HEAT</span>':""}</td><td>${esc(m.out)}</td><td class="num">${fmt(m.each)}/min${m.capped?' <small class="mut">belt cap</small>':""}</td><td class="num">${fmt(n)}</td><td class="num">${b}</td><td class="num ${busy<99.5?"idle":""}">${b?Math.round(busy)+"%":"—"}</td></tr>`; }).join("");
  const tot=sol.list.reduce((a,m)=>a+Math.ceil(m.count-1e-9),0); const vv=C.volume(sol);
  $("mtot").textContent=plural(tot,"machine")+(vv.furn?" plus "+plural(vv.furn,"stone furnace")+" for heat":"");

  // --- byproducts ---
  const notes=[];
  for(const m of sol.list){ for(const o of m.out.split(" + ").slice(1)){
    if(sol.recycled[o]>1e-9){ const mk=sol.list.find(x=>x.item===o); notes.push(`<li><b>${esc(o)} comes back out of the ${esc(m.machine)}</b> (${fmt(sol.recycled[o])}/min is reused here). Merge it in with a <b>priority merger, recycled ${esc(o)} first</b>${mk?`, ahead of the ${esc(o)} from the ${esc(mk.machine)}`:""}. Otherwise fresh supply fills the line, the ${esc(m.machine)} can't get rid of its ${esc(o)}, and it stops.</li>`); }
    if(sol.spare[o]>1e-9) notes.push(`<li><b>${fmt(sol.spare[o])}/min of spare ${esc(o)} comes out of the ${esc(m.machine)}.</b> It needs somewhere to go, like knowledge altars on the overflow side of a priority splitter, or the ${esc(m.machine)} backs up and stops.</li>`);
  }}
  $("notes").innerHTML=notes.length?`<div class="box"><h3>Byproducts: the only things that can stall this module</h3><ul class="notes">${notes.join("")}</ul><p class="fitsub">Everything else is safe to over-build. A machine with nowhere to send its output just waits.</p></div>`:"";
}
$("rate").oninput=renderMod;
$("fit").addEventListener("click",e=>{ const x=e.target.closest("[data-rate]"); if(x){ $("rate").value=+(+x.dataset.rate).toPrecision(6); renderMod(); } });
$("ingr").addEventListener("click",e=>{ const b=e.target.closest(".swap"); if(b) decide(b.dataset.item,b.dataset.to||null); });

// ---------- tab 3: machine rates ----------
function renderRates(){
  const q=$("rq").value.trim().toLowerCase(); const seen=new Set(); const rows=[];
  for(const n of Object.keys(I).sort((a,b)=>I[a].tier-I[b].tier||a.localeCompare(b))){ const r=R[n]; if(!r||I[n].kind==="raw"||seen.has(r.id)||!inTier(n)) continue; seen.add(r.id);
    const main=Object.keys(r.outs)[0]; const x=C.rate(r,main); const crafts=x.per/r.outs[main];
    const ins=Object.entries(r.ins).map(([k,v])=>fmt(v*crafts)+" "+k).join(" + ")||(I[n].kind==="crop"?fmt(crafts*r.nut/720)+" Advanced Fertilizer":"—");
    const outs=Object.entries(r.outs).map(([k,v])=>fmt(v*crafts)+" "+k).join(" + ");
    const txt=(main+" "+r.machine+" "+ins).toLowerCase(); if(q&&!txt.includes(q)) continue;
    rows.push(`<tr><td class="name">${esc(main)}</td><td>${esc(r.machine)}</td><td>${esc(ins)}</td><td>${esc(outs)}</td><td class="num">${r.heat?fmt(r.heat):""}</td><td class="why">${x.capped?"Capped at one belt (60/min). The recipe alone would be faster.":""}</td><td class="num">${I[n].tier}</td></tr>`); }
  $("rrows").innerHTML=rows.join("")||`<tr><td colspan="7" class="empty">Nothing matches.</td></tr>`;
}
$("rq").oninput=renderRates;

// ---------- redraw ----------
function redrawAll(){ saveSettings(); line(); if(cur&&!inTier(cur)) cur=modNames()[0]||null; { const ks=Object.keys(choice).filter(k=>I[k]); $("choices").hidden=!ks.length;
    $("choicelist").innerHTML=ks.map(k=>`<span class="chip pick">${esc(k)}: ${choice[k]==="bus"?"on the bus":"kept off the bus"} <button class="x" data-item="${esc(k)}" aria-label="Undo ${esc(k)}">×</button></span>`).join(""); } renderItems(); renderList(); renderMod(); renderRates(); }
for(const id of ["tier","fe","connmax"]) $(id).oninput=redrawAll;
for(const d of ["mL","mW","mH"]){ const a=$(d), b=$(d+"2"); b.value=a.value; a.oninput=()=>{ b.value=a.value; redrawAll(); }; b.oninput=()=>{ a.value=b.value; redrawAll(); }; }
$("tier").onchange=redrawAll;
line();
cur=I["Jupiter"]&&inTier("Jupiter")?"Jupiter":modNames()[0];
$("rate").value=+startRate(cur).toPrecision(5);
redrawAll();
