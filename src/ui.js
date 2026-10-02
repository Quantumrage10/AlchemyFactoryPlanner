// Page logic. Expects DATA and makeCore() to be defined above it.
const C=makeCore(DATA), I=C.I, R=C.R;
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function fmt(x){ if(!isFinite(x)) return "—"; if(Math.abs(x)<1e-9) return "0"; const a=Math.abs(x); if(a>=1000) return Math.round(x).toLocaleString(); if(a>=100) return x.toFixed(0); if(a>=10) return (+x.toFixed(1)).toString(); return (+x.toFixed(2)).toString(); }
const plural=(n,w)=>n+" "+(n===1?w:(/y$/.test(w)?w.slice(0,-1)+"ies":(/s$/.test(w)?w:w+"s")));
const listAnd=a=>a.length<=1?a.join(""):a.length===2?a.join(" and "):a.slice(0,-1).join(", ")+" and "+a[a.length-1];
$("ver").textContent="game "+DATA.version;

// ---------- settings ----------
// a long table is never taller than the screen it is on, so its heading and its rows always fit on screen together
if(document.documentElement&&window.screen&&screen.availHeight) document.documentElement.style.setProperty("--tableh",Math.max(320,screen.availHeight-190)+"px");
const maxTier=Math.max(...Object.values(I).map(i=>i.tier));
for(let t=1;t<=maxTier;t++){ const o=document.createElement("option"); o.value=t; o.textContent=t; $("tier").appendChild(o); }
$("tier").value=maxTier;
// your settings are remembered in this browser
let FIRST_VISIT=false; try{ FIRST_VISIT=!localStorage.getItem("bsp_settings_v2"); }catch(e){}
const SET_IDS=["tier","fe","mL","mW","mH","connmax","lvlbelt","lvlspeed","lvlalch","lvlfert","lvlsell"];
// Set every setting explicitly: the saved value if there is one, otherwise the default.
// (Browsers refill form fields by position after a reload, which put old values in the wrong boxes.)
const SEL_IDS=["fuelsel","fertsel"], SEL_DEFAULT={fuelsel:"Coke Powder",fertsel:"Advanced Fertilizer"};
{ const fill=(id,names,txt)=>{ for(const n of names){ const o=document.createElement("option"); o.value=n; o.textContent=txt(n); $(id).appendChild(o); } };
  fill("fuelsel",C.fuelOptions(),n=>n+" ("+I[n].heat.toLocaleString()+" heat)");
  fill("fertsel",C.fertOptions(),n=>n+" (feeds "+I[n].nutr.toLocaleString()+")"); }
const SET_DEFAULT={tier:maxTier,fe:0,mL:14,mW:14,mH:15,connmax:8,lvlbelt:0,lvlspeed:0,lvlalch:0,lvlfert:0,lvlsell:0};
{ let sv={}; try{ sv=JSON.parse(localStorage.getItem("bsp_settings_v2")||"{}")||{}; }catch(e){ sv={}; }
  for(const id of SEL_IDS){ const ok=typeof sv[id]==="string"&&I[sv[id]]&&(id==="fuelsel"?I[sv[id]].heat>0:I[sv[id]].nutr>0); $(id).value=ok?sv[id]:SEL_DEFAULT[id]; }
  for(const id of SET_IDS){ const v=+sv[id]; const ok=sv[id]!=null&&sv[id]!==""&&isFinite(v)&&v>=0&&(id!=="tier"||(v>=1&&v<=maxTier)); $(id).value=ok?sv[id]:SET_DEFAULT[id]; } }
const saveSettings=()=>{ try{ const o={}; for(const id of SET_IDS.concat(SEL_IDS)) o[id]=$(id).value; localStorage.setItem("bsp_settings_v2",JSON.stringify(o)); }catch(e){} };
const num=(id,def,min)=>Math.max(min,+$(id).value||def);
const cap=()=>num("mL",14,1)*num("mW",14,1)*num("mH",15,1);
const dimTxt=()=>num("mL",14,1)+"×"+num("mW",14,1)+"×"+num("mH",15,1);
const tierMax=()=>+$("tier").value;
const fe=()=>Math.max(0,+$("fe").value||0);
const inTier=n=>I[n]&&I[n].tier<=tierMax();

// ---------- your plan: where every item goes, and the shared wagon types (kept in this browser only) ----------
// What we recommend is only the starting layout. plan.place holds what you have changed (item -> "off", "maybe",
// "own" or "tag:<id>"), plan.tags the shared wagon types, and plan.cleared means nothing is recommended at all.
const DEFAULT_TAGS=()=>[{id:"research",name:"research"},{id:"fuel",name:"fuel"},{id:"fert",name:"fertilizer"},{id:"shop",name:"shop"}];
const TAGNOTE={research:"Relics. Research and the shop take any of them.",fuel:"Anything that burns. A furnace takes whichever one turns up.",fert:"Anything that feeds a nursery. A nursery takes whichever one turns up.",
  shop:"Things that are only sold and used nowhere else. Don't run it as a ring: unload everything at the shop and send whatever is left to knowledge altars."};
let plan={place:{},tags:DEFAULT_TAGS(),cleared:false};
try{ const sv=JSON.parse(localStorage.getItem("bsp_plan_v1")||"null");
  if(sv&&typeof sv==="object"){ if(sv.place&&typeof sv.place==="object") plan.place=sv.place; if(Array.isArray(sv.tags)) plan.tags=sv.tags.filter(t=>t&&t.id&&t.name); plan.cleared=!!sv.cleared; }
  else { const old=JSON.parse(localStorage.getItem("bsp_choice")||"{}")||{}; for(const k in old) plan.place[k]=old[k]==="bus"?"own":"off"; } }catch(e){}
const savePlan=()=>{ try{ localStorage.setItem("bsp_plan_v1",JSON.stringify(plan)); }catch(e){} };
const tagById=id=>plan.tags.find(t=>t.id===id);
const valueOf=s=>s.code==="no"?"off":s.code==="maybe"?"maybe":s.code==="ded"?"own":"tag:"+s.wagon;
const recValue=n=>plan.cleared?"off":valueOf(rec(n));
// put an item somewhere; putting it back where it would be anyway just forgets the change
function setPlace(item,v){ if(v==null||v===recValue(item)) delete plan.place[item]; else plan.place[item]=v; savePlan(); redrawAll(); }
// the buttons in the module view: "bus" puts it where we would recommend it rides, "off" keeps it off, null undoes
function decide(item,to){ if(!to) return setPlace(item,null); if(to==="off") return setPlace(item,"off");
  const r=rec(item); if(r.code==="mix"||r.code==="ded") return setPlace(item,valueOf(r)); const w=wagonOf(item); setPlace(item,w&&tagById(w)?"tag:"+w:"own"); }

// ---------- the bus line for the current tier and tile size ----------
let LINE=null, lineKey="";
// upgrades change belt speed and machine speed everywhere
function applyUpgrades(){ const v=id=>+$(id).value||0; C.setSupplies($("fuelsel").value,$("fertsel").value); const u=C.setUpgrades(v("lvlbelt"),v("lvlspeed"),v("lvlalch"),v("lvlfert"),v("lvlsell"));
  const pct=x=>Math.round(x*100)+"%";
  $("upnote").textContent="Belts carry "+fmt(u.belt)+"/min. Machines run at "+pct(u.speed)+" speed. Extractors and alembics yield "+pct(u.alch)+". Fertilizer feeds "+pct(u.fert)+" as much. Shop prices are "+pct(u.sell)+".";
  $("connnote").textContent="each carries "+fmt(2*u.belt)+"/min (two belts)"; return u; }
// big prices in short form for the table: 30k, 1.12M, 178M
function short(x){ if(x<10000) return x.toLocaleString(); const U=[[1e9,"B"],[1e6,"M"],[1e3,"k"]]; for(let i=0;i<U.length;i++){ const [u,s]=U[i]; if(x>=u){ const v=+(x/u).toPrecision(3); if(v>=1000&&i>0) return +(x/U[i-1][0]).toPrecision(3)+U[i-1][1]; return v+s; } } return String(x); }
const price=n=>Math.round((I[n].sell||0)*C.sellMult()*10)/10;
function line(){ const k=tierMax()+"|"+cap()+"|"+C.belt()+"|"+C.speed()+"|"+C.yieldOf({machine:"Extractor"})+"|"+C.fertValue()+"|"+C.fuel()+"|"+C.fert(); if(k!==lineKey){ LINE=C.busLine(tierMax(),cap()); lineKey=k; } return LINE; }
// Which shared wagon type an item would ride: anything that burns the fuel wagon, anything that feeds nurseries
// the fertilizer wagon, relics the research wagon. null = none of them.
function wagonOf(n){ const it=I[n]; if(it.relic) return "research"; const f=it.heat>0, g=it.nutr>0&&it.fspeed>0;
  if(f&&g) return (n===C.fert()&&n!==C.fuel())?"fert":"fuel"; return f?"fuel":g?"fert":null; }
const SHAREWHY={fuel:" It rides the shared fuel wagon type with everything else that burns.",fert:" It rides the shared fertilizer wagon type with everything else that feeds nurseries."};
// What we recommend for an item. code: ded (own wagon type), mix (a shared wagon type; wagon says which), maybe, no
function rec(n){ const s=statusBase(n); if(s.code==="mix"&&!s.wagon) s.wagon="research";
  if(s.code==="ded"){ const w=wagonOf(n); if(w){ s.code="mix"; s.wagon=w; s.why+=SHAREWHY[w]||""; } }
  if(s.code==="mix"&&!tagById(s.wagon)){ s.code="ded"; delete s.wagon; } return s; }
// Where an item stands: what you set, or else the recommendation (or nothing, once recommendations are cleared)
function status(n){ const p=plan.place[n], L=line(), it=I[n];
  if(p==="off") return {code:"no",mine:true,why:"Your choice. Every module that needs it makes its own."+(L.bus.has(n)&&L.forcedBy[n]?" Check those modules still fit: the "+listAnd(L.forcedBy[n].slice(0,3))+" module didn't have room for it.":"")};
  if(p==="maybe") return {code:"maybe",mine:true,why:"Your choice. Marked as a maybe. Until you decide, every module that needs it makes its own."};
  if(p==="own") return {code:"ded",mine:true,why:"Your choice. It gets its own tagged wagons, and every module that needs it takes it off the bus."};
  if(p&&p.slice(0,4)==="tag:"&&tagById(p.slice(4))){ const t=tagById(p.slice(4)); return {code:"mix",wagon:t.id,mine:true,why:"Your choice. It rides the shared \""+t.name+"\" wagon type, and every module that needs it takes it off that wagon."}; }
  if(plan.cleared) return {code:"no",why:(it.kind==="made"&&!it.liq)?"Recommendations are cleared. It stays off the bus until you put it somewhere.":"Made or bought right where it's used."};
  return rec(n); }
function statusBase(n){
  const it=I[n], L=line(); const users=it.uses.filter(inTier); const made=it.kind==="made"&&!it.liq;
  const usesTxt=listAnd(users.slice(0,4))+(users.length>4?" and others":"");
  if(C.UNIVERSAL.includes(n)){ const isFuel=n===C.fuel(), isFert=n===C.fert();
    return {code:"ded",why:"Always. It's "+(isFuel&&isFert?"the fuel and the fertilizer":isFuel?"the fuel":"the fertilizer")+" you've picked for "+(isFuel&&isFert?"the whole base":isFuel?"every heated machine":"every nursery")+"."+(users.length?" "+usesTxt+" also use"+(users.length>1?"":"s")+" it as an ingredient.":"")}; }
  if(it.relic) return {code:"mix",why:"A relic. It only goes to the shop and to research, so it rides one shared \"research\" wagon type with the other relics."+(users.length?" "+usesTxt+" also take"+(users.length>1?"":"s")+" it off that wagon.":"")};
  if(L.bus.has(n)){ const fb=L.forcedBy[n]||[]; return {code:"ded",why:"The "+listAnd(fb.slice(0,3))+" module"+(fb.length>1?"s":"")+" can't fit making "+(fb.length>1?"their":"its")+" own "+n.toLowerCase()+" in one tile."}; }
  if(made&&!it.uses.length&&wagonOf(n)) return {code:"no",why:"Nothing uses it as an ingredient. It's "+(it.heat>0&&it.nutr>0?"a fuel and a fertilizer":it.heat>0?"a fuel":"a fertilizer")+(it.sell?", and it sells":"")+". It stays off the bus until you pick it on the setup page or put it on a wagon yourself."};
  if(made&&it.sell&&!it.uses.length) return {code:"mix",wagon:"shop",why:"Only sold, and nothing else uses it. It rides the shared shop wagon type. Unload everything at the shop and send what's left to knowledge altars, or set it to off the bus and make it next to the shop."};
  if(it.liq) return {code:"no",why:"Hard no. A liquid, piped inside whatever uses it."};
  if(it.kind==="raw") return {code:"no",why:"Hard no. Bought with coins inside whatever uses it."};
  if(it.kind==="crop") return {code:"no",why:"Hard no. Grown in nurseries inside whatever uses it."};
  if(C.onlyFeedsConversion(n)){ const into=it.uses[0]; return {code:"no",why:"No. It only ever gets turned into "+into+", so it's made inside the "+into.toLowerCase()+" module and the "+into.toLowerCase()+" is what moves."+(it.sell?" The shop's share gets made next to the shop.":"")}; }
  { const src=C.simpleFrom(n); if(src&&inTier(src)){ if(onBus(src)) return {code:"no",why:"No. It's a straight one-for-one conversion of "+src+" in a single "+R[n].machine+". "+src+" is what rides the bus, and you convert it right where it's needed"+(it.sell?", including next to the shop":"")+"."};
      return {code:"no",why:"No. It's a straight one-for-one conversion of "+src+" in a single "+R[n].machine+". Whatever module needs it grinds its own from the "+src.toLowerCase()+" it already has"+(it.sell?". The shop's share gets made next to the shop.":".")}; } }
  if(!it.dense) return {code:"no",why:"Hard no. Bulk ("+it.rtxt+"). Make it right where it's used."+(it.sell?" The shop's share gets made next to the shop.":"")};
  if(users.length) return {code:"maybe",why:"Packed down ("+it.rtxt+"), but "+(users.length<=2?"only ":"just ")+usesTxt+" use"+(users.length>1?"":"s")+" it"+(it.sell?", plus the shop":"")+". Bus it from its own module, or build it into the "+usesTxt+" module"+(users.length>1?"s":"")+(it.sell?" and make the shop's share next to the shop":"")+". Fits either way."};
  if(it.sell) return {code:"no",why:"Only sold. Make it next to the shop."};
  return {code:"no",why:"Nothing at this tier uses it."};
}
const onBus=n=>{ const c=status(n).code; return c==="ded"||c==="mix"; };
function cutsFor(root){ const s=new Set(); for(const n in I) if(n!==root&&inTier(n)&&I[n].kind==="made"&&!I[n].liq&&onBus(n)) s.add(n); return s; }
let cutCache={}, cutKey="";
function cuts(root){ const k=lineKey+"|"+JSON.stringify(plan); if(k!==cutKey){ cutCache={}; cutKey=k; } return cutCache[root]||(cutCache[root]=cutsFor(root)); }
const verdict=(lo,hi)=>hi<=100?["ok","Fits"]:(lo<=100?["edge","Tight squeeze"]:["over","Too big"]);
const SLABEL={ded:"Yes · own wagons",mix:"Yes · shared wagon",maybe:"Maybe",no:"No"};
const label=st=>st.code==="mix"?"Yes · "+((tagById(st.wagon)||{}).name||"shared")+" wagon":SLABEL[st.code];
const SORD={ded:0,mix:1,maybe:2,no:3};

// ---------- tab 1: what goes on the bus ----------
const flt={ded:true,mix:true,maybe:true,no:true,sold:false,fuel:false,fert:false,res:false,basic:true};
function tog(id,key){ const b=$(id); b.setAttribute("aria-pressed",flt[key]); b.onclick=()=>{ flt[key]=!flt[key]; b.setAttribute("aria-pressed",flt[key]); renderItems(); }; }
tog("f-ded","ded"); tog("f-mix","mix"); tog("f-maybe","maybe"); tog("f-no","no"); tog("f-sold","sold"); tog("f-fuel","fuel"); tog("f-fert","fert"); tog("f-res","res"); tog("f-basic","basic");
let sortK="bus", sortDir=1;
// the picker: where this item goes. Every made item can be off the bus, a maybe, on its own wagons, or on any shared wagon.
function picker(n,st){ const cur=valueOf(st);
  const opts=[["off","Off the bus"],["maybe","Maybe"],["own","Own wagons"]].concat(plan.tags.map(t=>["tag:"+t.id,t.name+" wagon"]));
  return `<select class="pick" data-item="${esc(n)}" aria-label="Where ${esc(n)} goes">`+opts.map(([v,l])=>`<option value="${esc(v)}"${v===cur?" selected":""}>${esc(l)}</option>`).join("")+"</select>"+(st.mine?`<button class="swap" data-item="${esc(n)}" data-to="">Undo my choice</button>`:""); }
function itemRow(n){
  const it=I[n]; const made=it.kind==="made"&&!it.liq; const st=status(n); const users=it.uses.filter(inTier);
  return {n,it,st,users,made};
}
const KEY={item:r=>r.n,bus:r=>SORD[r.st.code]*1000+(r.st.code==="mix"?plan.tags.findIndex(t=>t.id===r.st.wagon)+1:0),why:r=>r.st.why,used:r=>r.users.join(", ")||"~",sell:r=>r.it.sell||0,tier:r=>r.it.tier};
$("sorthead").addEventListener("click",e=>{ const b=e.target.closest(".sortb"); if(!b) return; const k=b.dataset.k; if(sortK===k) sortDir=-sortDir; else{ sortK=k; sortDir=1; } renderItems(); });
function renderItems(){
  document.querySelectorAll(".sortb").forEach(x=>{ const on=x.dataset.k===sortK; x.dataset.dir=on?(sortDir>0?"asc":"desc"):""; });
  const q=$("q").value.trim().toLowerCase();
  let rows=Object.keys(I).filter(inTier).map(itemRow);
  rows=rows.filter(r=>flt[r.st.code]&&(!flt.sold||r.it.sell)&&(!flt.fuel||r.it.heat>0)&&(!flt.fert||(r.it.nutr>0&&r.it.fspeed>0))&&(!flt.res||r.it.relic)&&(!flt.basic||r.made)&&(!q||r.n.toLowerCase().includes(q)||r.users.some(u=>u.toLowerCase().includes(q))));
  rows.sort((a,b)=>{ const ka=KEY[sortK](a), kb=KEY[sortK](b); let c=typeof ka==="number"?ka-kb:String(ka).localeCompare(String(kb)); if(!c) c=a.it.tier-b.it.tier||a.n.localeCompare(b.n); return c*sortDir; });
  const cnt={ded:0,mix:0,maybe:0,no:0}; rows.forEach(r=>cnt[r.st.code]++);
  $("count").textContent=rows.length+" shown: "+cnt.ded+" own wagons, "+cnt.mix+" shared wagon, "+cnt.maybe+" maybe, "+cnt.no+" no";
  $("rows").innerHTML=rows.map(r=>{
    const name=r.made?`<button class="link" data-mod="${esc(r.n)}">${esc(r.n)}</button>`:`<span class="name">${esc(r.n)}</span>`;
    const used=[...r.users.map(u=>`<span class="chip">${esc(u)}</span>`), r.it.heat>0?`<span class="chip furnc">Furnaces</span>`:"", (r.it.nutr>0&&r.it.fspeed>0)?`<span class="chip nursc">Nurseries</span>`:"", r.it.relic?`<span class="chip resc">Research</span>`:"", r.it.sell?`<span class="chip shopc">Shop</span>`:""].join("")||"—";
    const act=r.made?picker(r.n,r.st):"";
    return `<tr><td class="nmc">${name}</td><td class="stc"><span class="st ${r.st.code}">${esc(label(r.st))}</span>${r.st.mine?'<div class="mine">your choice</div>':""}</td><td class="why">${esc(r.st.why)}</td><td class="act">${act}</td><td class="usedc"><div class="chips">${used}</div></td><td class="num"${r.it.sell?` title="${price(r.n).toLocaleString()}"`:""}>${r.it.sell?short(price(r.n)):""}</td><td class="num">${r.it.tier}</td></tr>`; }).join("")||`<tr><td colspan="7" class="empty">Nothing matches.</td></tr>`;
}
$("q").oninput=renderItems;
$("rows").addEventListener("click",e=>{ const s=e.target.closest(".swap"); if(s){ decide(s.dataset.item,s.dataset.to||null); return; } const b=e.target.closest("[data-mod]"); if(b) openMod(b.dataset.mod); });
$("rows").addEventListener("change",e=>{ const s=e.target.closest("select.pick"); if(s) setPlace(s.dataset.item,s.value); });
// ---------- the board: shared wagon types, and the two big buttons ----------
function resetPlan(){ plan={place:{},tags:DEFAULT_TAGS(),cleared:false}; savePlan(); redrawAll(); }
function clearPlan(){ plan.place={}; plan.tags=[]; plan.cleared=true; savePlan(); redrawAll(); }
function addTag(name){ name=String(name||"").trim(); if(!name) return null; const id="u"+Date.now().toString(36)+plan.tags.length; plan.tags.push({id,name}); savePlan(); redrawAll(); return id; }
function renameTag(id,name){ const t=tagById(id); name=String(name||"").trim(); if(t&&name){ t.name=name; savePlan(); } redrawAll(); }
function deleteTag(id){ plan.tags=plan.tags.filter(t=>t.id!==id); for(const k in plan.place) if(plan.place[k]==="tag:"+id) delete plan.place[k]; savePlan(); redrawAll(); }
$("resetrec").onclick=resetPlan; $("clearall").onclick=clearPlan;
$("addtag").onclick=()=>{ if(addTag($("newtag").value)) $("newtag").value=""; };
// adding to a shared wagon works like the module search: click the box and the list drops down, type to narrow it, click a name to add it
function fillAddList(inp){ const id=inp.dataset.tag, q=inp.value.trim().toLowerCase(), box=$("addlist-"+id); if(!box) return;
  const names=modNames().filter(n=>valueOf(status(n))!=="tag:"+id&&(!q||n.toLowerCase().includes(q)));
  box.innerHTML=names.map(n=>'<button data-item="'+esc(n)+'" data-tag="'+esc(id)+'"><span>'+esc(n)+'</span><small>T'+I[n].tier+'</small></button>').join("")||'<div class="empty" style="padding:10px">Nothing matches.</div>'; box.hidden=false; }
$("tags").addEventListener("focusin",e=>{ const i=e.target.closest("input.addto"); if(i) fillAddList(i); });
$("tags").addEventListener("input",e=>{ const i=e.target.closest("input.addto"); if(i) fillAddList(i); });
$("tags").addEventListener("focusout",e=>{ const i=e.target.closest("input.addto"); if(i) setTimeout(()=>{ const box=$("addlist-"+i.dataset.tag); if(box) box.hidden=true; },150); });
$("tags").addEventListener("mousedown",e=>{ const b=e.target.closest(".droplist button"); if(!b) return; e.preventDefault(); setPlace(b.dataset.item,"tag:"+b.dataset.tag); });
$("tags").addEventListener("click",e=>{ const d=e.target.closest(".deltag"); if(d){ deleteTag(d.dataset.tag); return; } const x=e.target.closest(".rm"); if(x) setPlace(x.dataset.item,"own"); });
$("tags").addEventListener("change",e=>{ const r=e.target.closest("input.tagname"); if(r) renameTag(r.dataset.tag,r.value); });
function renderBoard(){ const made=modNames(), st={}; for(const n of made) st[n]=status(n);
  const own=made.filter(n=>st[n].code==="ded").length, mem=t=>made.filter(n=>st[n].code==="mix"&&st[n].wagon===t.id);
  const shared=plan.tags.filter(t=>mem(t).length).length, changed=Object.keys(plan.place).filter(k=>I[k]).length;
  $("wcount").textContent="Wagon types on your bus: "+(own+shared)+" ("+own+" with their own wagons, "+shared+" shared)";
  $("planstate").textContent=(plan.cleared?"Recommendations are cleared. ":"")+(changed?plural(changed,"item")+" set by you.":(plan.cleared?"Nothing is on the bus yet.":"This is the recommended layout."));
  $("tags").innerHTML=plan.tags.map(t=>{ const m=mem(t), id=esc(t.id);
    return `<div class="tagbox"><div class="taghead"><input class="tagname" data-tag="${id}" value="${esc(t.name)}" aria-label="Name of this shared wagon" autocomplete="off"><span class="mut">wagon · ${plural(m.length,"item")}</span><button class="deltag" data-tag="${id}">Delete</button></div>`
      +(TAGNOTE[t.id]?`<div class="fitsub">${esc(TAGNOTE[t.id])}</div>`:"")
      +`<div class="chips">${m.map(n=>`<span class="chip pick">${esc(n)} <button class="x rm" data-item="${esc(n)}" aria-label="Take ${esc(n)} off this wagon">×</button></span>`).join("")}</div>`
      +`<div class="addrow"><input type="search" class="addto" id="add-${id}" data-tag="${id}" autocomplete="off" placeholder="Add an item" aria-label="Add an item to this wagon"><nav class="modlist droplist" id="addlist-${id}" aria-label="Items to add" hidden></nav></div></div>`; }).join(""); }

// ---------- tabs ----------
// Frozen headings, the standard way: the page is the only thing that scrolls, each table's heading row sticks to the
// top of the window while its table is on screen, and a search row above a table sticks just above the heading.
// The stylesheet does the sticking; all the script does is tell it how tall each search row is.
function fitTables(){ for(const k of ["items","rates"]){ const pane=$("pane-"+k), c=pane.querySelector?pane.querySelector(":scope>.controls"):null; if(c&&c.offsetParent) pane.style.setProperty("--toolh",c.offsetHeight+"px"); } }
if(window.addEventListener) window.addEventListener("resize",fitTables);
const TABS=["setup","items","mods","rates"];
function setTab(w){ for(const k of TABS){ $("tab-"+k).setAttribute("aria-selected",k===w); $("pane-"+k).hidden=k!==w; } $("ctx").hidden=w==="setup"; if(w==="mods") layoutTree(); fitTables(); }
$("ctxgo").onclick=()=>setTab("setup");
for(const k of TABS) $("tab-"+k).onclick=()=>setTab(k);

// ---------- tab 2: build a module ----------
let cur=null, lastRate=null;
const modNames=()=>Object.keys(I).filter(n=>I[n].kind==="made"&&!I[n].liq&&inTier(n)).sort((a,b)=>I[a].tier-I[b].tier||a.localeCompare(b));
// the module picker: one search box. Clicking it drops the full list down, typing narrows it, clicking a name opens it.
function renderList(){ const q=$("mq").value.trim().toLowerCase(); const names=modNames().filter(n=>!q||n.toLowerCase().includes(q));
  $("modlist").innerHTML=names.map(n=>'<button data-r="'+esc(n)+'" aria-current="'+(n===cur)+'"><span>'+esc(n)+(onBus(n)?' <i class="bustag">bus</i>':"")+'</span><small>T'+I[n].tier+'</small></button>').join("")||'<div class="empty" style="padding:10px">Nothing matches.</div>'; }
const showList=on=>{ $("modlist").hidden=!on; };
$("mq").onfocus=()=>{ renderList(); showList(true); };
$("mq").oninput=()=>{ renderList(); showList(true); };
$("mq").onblur=()=>setTimeout(()=>showList(false),150);
$("mq").onkeydown=e=>{ if(e.key==="Escape"){ showList(false); $("mq").blur(); } };
$("modlist").addEventListener("mousedown",e=>{ const b=e.target.closest("button"); if(!b) return; e.preventDefault(); $("mq").value=""; showList(false); $("mq").blur(); openMod(b.dataset.r); });
// Everything about how big a module can be: bus connections, tile fill, and the sizes worth building.
function sizing(root,cs){
  const one=C.solve(root,1,cs);
  // bus connections: each item coming off or going onto the bus needs a station, and a station carries CONN items a minute
  const FUELN=C.fuel(), FERTN=C.fert(), fuelRaw=I[FUELN].kind==="raw";
  const selfFuel=root===FUELN, selfFert=root===FERTN;
  const CONN=2*C.belt(), connMax=num("connmax",8,1), fuel1=C.fuelPerMin(one,fe());
  const perUnit={}; for(const k in one.busIn) if(one.busIn[k]>1e-12) perUnit[k]=one.busIn[k];
  if(!selfFuel&&!fuelRaw&&fuel1>1e-12) perUnit[FUELN]=(perUnit[FUELN]||0)+fuel1;
  if(!selfFert&&one.fert>1e-12) perUnit[FERTN]=(perUnit[FERTN]||0)+one.fert;
  const outUnit=Math.max(0,1-(selfFuel?fuel1:0)-(selfFert?one.fert:0));
  const stations=f=>f>1e-9?Math.ceil(f/CONN-1e-9):0;
  const connAt=r=>{ let c=stations(outUnit*r); for(const k in perUnit) c+=stations(perUnit[k]*r); return c; };
  const block=C.cleanRate(root,cs), step=C.rate(R[root],root).per, cp=cap();
  const fillAt=r=>{ const v=C.volume(one,r).v; return [v*C.LO/cp*100,v*C.HI/cp*100]; };
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
  const BELTS=[[0.5,"Half a belt"],[1,"One full belt"],[1.5,"A belt and a half"],[2,"Two full belts"]].map(([m,l])=>[m*C.belt(),l]);
  for(const [v,label] of BELTS){ const c=cand.find(c=>Math.abs(c.r-v)<1e-6); if(c&&c.cls!=="over"&&!c.odd) addRow(c,label); }
  const fitC=cand.filter(c=>c.cls==="fit"), tightC=cand.filter(c=>c.cls==="tight"), overC=cand.filter(c=>c.cls==="over");
  // best = most machines coming out even (no uneven counts, then fewest halves), then a round output, then the bigger size
  const best=(a,smallest)=>{ if(!a.length) return null; return a.slice().sort((x,y)=>(x.odd-y.odd)||(round(y.r)-round(x.r))||(x.half-y.half)||(smallest?x.r-y.r:y.r-x.r))[0]; };
  { const b=best(fitC); addRow(b, b&&round(b.r)?"Biggest round size that fits":"Biggest that fits"); }
  addRow(best(tightC), "Tight squeeze");
  addRow(best(overC.filter(c=>c.r<=overC[0].r*1.3),true), "First size that won't fit");
  const pick=[...pickMap.values()].sort((a,b)=>a[0].r-b[0].r);
  return {one,selfFuel,selfFert,FUELN,FERTN,fuelRaw,CONN,connMax,fuel1,perUnit,outUnit,stations,connAt,block,step,cp,fillAt,evenness,cand,pick,fitC,tightC,overC,round};
}
// Opens a module at the biggest size that fits its tile with every machine count whole;
// failing that the biggest that fits at all, then the smallest tight squeeze, then one machine.
function startRate(root){ const z=sizing(root,cuts(root)); const fit=z.pick.map(p=>p[0]).filter(c=>c.cls==="fit");
  const whole=fit.filter(c=>!c.odd&&!c.half); const lastOf=a=>a.length?a[a.length-1]:null;
  const c=lastOf(whole)||lastOf(fit)||z.tightC[0]; return c?c.r:z.step; }
function openMod(root){ cur=root; $("rate").value=+startRate(root).toPrecision(5); setTab("mods"); renderList(); renderMod(); window.scrollTo&&window.scrollTo(0,0); }
const rowKV=(k,v,sub)=>`<div class="row"><span>${k}${sub?` <small class="mut">${sub}</small>`:""}</span><span>${v}</span></div>`;
// Everything a module handles, as a graph. depth = steps from the finished item (the longest way round),
// into = what each thing goes into here, order = build order: each line of ingredients from its start to the item it feeds.
function chain(root,cs){ const depth={}, into={}, kids={};
  const open=n=>n===root||!cs.has(n);
  const visit=(n,d)=>{ if(d>40||(depth[n]!=null&&depth[n]>=d)) return; depth[n]=d; const r=R[n]; if(!open(n)||!r||I[n].kind==="raw"){ kids[n]=[]; return; }
    kids[n]=Object.keys(r.ins).filter(i=>I[i]); for(const i of kids[n]){ (into[i]=into[i]||[]); if(!into[i].includes(n)) into[i].push(n); visit(i,d+1); } };
  visit(root,0);
  const height={}; const h=n=>height[n]!=null?height[n]:(height[n]=0, height[n]=1+Math.max(-1,...(kids[n]||[]).map(h)));
  const order=[], seen=new Set(); const post=n=>{ if(seen.has(n)) return; seen.add(n); for(const k of (kids[n]||[]).slice().sort((a,b)=>h(b)-h(a))) post(k); order.push(n); };
  post(root);
  return {depth,into,order,pos:Object.fromEntries(order.map((n,i)=>[n,i]))}; }
// Lines up the ingredient tree once the browser has sized the boxes. Each row keeps its own height; an item is then
// lined up with the middle line feeding it (or midway between the middle two), so that line runs straight through.
// Byproduct arrows, drawn once the boxes are in place: a dashed line from the box of the machine a byproduct comes
// out of to the box that uses it. It leaves the top or bottom of one box and enters the top or bottom of the other,
// running behind any box in between; when both are in the same row it loops underneath.
let byArrows=[], treeZoom=1, treeX=0, treeY=0, treeRoot=null, treeFresh=true, treeFocus=null;
const EYE='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
// "Show only this": the eye on a box cuts the tree down to that box and everything that goes into it. A byproduct that
// comes in from a part of the module that is no longer shown is kept, as a box of its own saying where it comes from.
// The whole tree is always built first, so the amounts and the byproduct sharing are exactly the same as in the full view.
function applyFocus(){ const bar=$("treefocus"), zw=$("ingr").firstElementChild; if(!treeFocus||!zw||!zw.querySelectorAll){ bar.hidden=true; return; }
  const all=Array.from(zw.querySelectorAll(".node")), nd=all.find(e=>e.dataset.id===String(treeFocus.id)&&e.dataset.n===treeFocus.n);
  if(!nd){ treeFocus=null; bar.hidden=true; return; }
  const F=nd.parentElement, inside=new Set(Array.from(F.querySelectorAll(".node")).map(e=>e.dataset.id)), keep=[], extra=[];
  for(const a of byArrows){ if(!inside.has(String(a.to))) continue; const pe=a.self?null:all.find(e=>e.dataset.n===a.from);
    if(a.self||(pe&&inside.has(pe.dataset.id))) keep.push(a); else extra.push(a); }
  const top=F.cloneNode(true); top.className="branch";
  zw.innerHTML=top.outerHTML+'<svg class="bylines" aria-hidden="true"></svg><svg class="bytext" aria-hidden="true"></svg>';
  const mk=c=>{ const d=document.createElement("div"); d.className=c; return d; };
  extra.forEach((a,i)=>{ const cons=Array.from(zw.querySelectorAll(".node")).find(e=>e.dataset.id===String(a.to)); if(!cons) return; const br=cons.parentElement;
    let ks=Array.from(br.children).find(c=>c.classList.contains("kids"));
    if(!ks){ ks=mk("kids"); const st=mk("stub"), tr=mk("tri"); br.insertBefore(tr,cons); br.insertBefore(st,tr); br.insertBefore(ks,st); br.classList.remove("tail"); }
    const leaf=mk("branch"); leaf.innerHTML='<div class="node pipe" data-id="x'+i+'" data-n="'+esc(a.item)+'"><div><b>'+esc(a.item)+'</b> <span class="amt">'+fmt(a.amt)+'/min</span></div><div><span class="src pipe">Byproduct</span> <small class="mut">comes out of the '+esc(R[a.from].machine)+' making '+esc(a.from)+', in a part of this module that isn\'t shown</small></div></div>';
    ks.appendChild(leaf); });
  byArrows=keep; $("treefocusname").textContent=treeFocus.n; bar.hidden=false; }
$("ingr").addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest(".eye"); if(!b) return; treeFocus={id:b.dataset.eye,n:b.dataset.n}; treeFresh=true; $("treetip").hidden=true; renderMod(); });
$("treefocusoff").onclick=()=>{ treeFocus=null; treeFresh=true; renderMod(); };
// The tree sits in a window you can move around in, like a map. Ctrl + scroll zooms in or out on the spot under the
// mouse, dragging slides it, and plain scrolling still scrolls the page. Opening another module starts it at full size.
const treeTf=()=>"translate("+treeX+"px,"+treeY+"px) scale("+treeZoom+")";
// The tree window works like a map or a diagram viewer. It is as tall as the tree until that would be taller than the
// window, then it stops growing and you move around inside it. The tree can never be dragged out of its window.
function placeTree(reset){ const flow=$("ingr"), zw=flow.firstElementChild; if(!zw) return; const W0=zw.offsetWidth, H0=zw.offsetHeight;
  if(reset){ treeZoom=1; treeX=Math.round((flow.clientWidth-W0)/2); treeY=0; }
  const z=treeZoom, cap=Math.max(240,Math.round((window.innerHeight||800)*0.85));
  flow.style.height=Math.min(Math.ceil(H0*z),cap)+"px";
  const cw=flow.clientWidth, ch=flow.clientHeight, w=W0*z, h=H0*z;
  const clamp=(v,size,room)=>size<=room?Math.min(room-size,Math.max(0,v)):Math.min(0,Math.max(room-size,v));
  treeX=Math.round(clamp(treeX,w,cw)); treeY=Math.round(clamp(treeY,h,ch));
  zw.style.transform=treeTf(); }
// Ctrl + scroll zooms on the spot under the mouse. If the window itself changes height, the page scrolls to keep that spot still.
$("ingr").addEventListener("wheel",e=>{ if(!e.ctrlKey) return; e.preventDefault(); const flow=$("ingr"); if(!flow.firstElementChild) return;
  const old=treeZoom, z=Math.min(2.5,Math.max(0.1,old*(e.deltaY<0?1.12:1/1.12))); if(z===old) return;
  const r=flow.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top, oy=treeY;
  treeX=mx-(mx-treeX)*z/old; treeY=my-(my-treeY)*z/old; treeZoom=z; placeTree(false);
  const drift=treeY+(my-oy)*z/old-my; if(Math.abs(drift)>0.5&&window.scrollBy) window.scrollBy(0,drift); },{passive:false});
// Dragging moves the tree in any direction. Once it can't move any further up or down, the drag scrolls the page instead.
{ let drag=false; const flow=$("ingr");
  flow.addEventListener("pointerdown",e=>{ if(e.button!==0||e.target.closest("button")) return; drag=true; flow.classList.add("drag"); flow.setPointerCapture&&flow.setPointerCapture(e.pointerId); });
  flow.addEventListener("pointermove",e=>{ if(!drag) return; treeX+=e.movementX; const want=treeY+e.movementY; treeY=want; placeTree(false);
    const left=want-treeY; if(Math.abs(left)>0.5&&window.scrollBy) window.scrollBy(0,-left); });
  const stop=()=>{ drag=false; flow.classList.remove("drag"); }; flow.addEventListener("pointerup",stop); flow.addEventListener("pointercancel",stop); }
$("treereset").onclick=()=>{ treeFresh=true; layoutTree(); };
// Lines you can point at. Hovering a line lights up the line and the boxes it joins: for a solid line, the item and
// everything that goes straight into it; for a dashed line, the machine the byproduct comes out of and the item it goes
// into. Clicking a line opens a small card listing just those things. Dragging still moves the tree.
{ const flow=$("ingr"), tip=$("treetip"); let cur="", down=null;
  const nodeOf=b=>Array.from(b.children).find(c=>c.classList.contains("node"));
  const kidsOf=b=>Array.from(b.children).find(c=>c.classList.contains("kids"));
  const clear=()=>{ for(const e of flow.querySelectorAll(".hl")) e.classList.remove("hl"); flow.classList.remove("online"); };
  // which line is under the mouse: {kind:"feed",branch} (branch = the item being fed), {kind:"by",i}, or null
  const hit=e=>{ const t=e.target; if(!t||!t.closest||!t.classList) return null;
    if(t.classList.contains("hit")) return {kind:"by",i:+t.dataset.i};
    if(t.classList.contains("stub")||t.classList.contains("tri")) return {kind:"feed",branch:t.parentElement};
    if(t.classList.contains("branch")&&t.parentElement.classList.contains("kids")){ const r=t.getBoundingClientRect(), nd=nodeOf(t), nr=nd?nd.getBoundingClientRect().right:r.left;
      const y=r.top+(parseFloat(t.style.getPropertyValue("--a"))||0)*treeZoom;
      if((Math.abs(e.clientY-y)<=7&&e.clientX>=nr-1)||e.clientX>=r.right-8*treeZoom) return {kind:"feed",branch:t.parentElement.parentElement}; }
    return null; };
  const keyOf=h=>!h?"":h.kind==="by"?"by"+h.i:"feed"+nodeOf(h.branch).dataset.id;
  const byEnds=a=>{ const nodes=Array.from(flow.querySelectorAll(".node")), te=nodes.find(e=>e.dataset.id===String(a.to)); return {te,pe:a.self?te:nodes.find(e=>e.dataset.n===a.from)}; };
  const mark=h=>{ clear(); if(!h) return; flow.classList.add("online");
    if(h.kind==="feed"){ h.branch.classList.add("hl"); return; }
    const a=byArrows[h.i]; if(!a) return; const {te,pe}=byEnds(a); if(te) te.classList.add("hl"); if(pe) pe.classList.add("hl");
    for(const e of flow.querySelectorAll('[data-i="'+h.i+'"]')) e.classList.add("hl"); };
  flow.addEventListener("mousemove",e=>{ if(flow.classList.contains("drag")&&down&&down.moved) return; const h=hit(e), k=keyOf(h); if(k!==cur){ cur=k; mark(h); } });
  flow.addEventListener("mouseleave",()=>{ cur=""; clear(); });
  // the card
  // a name in the card is a button: pressing it moves the tree to put that box in the middle of the window and lights it up
  const go=(name,nd)=>nd?'<button class="link goto" data-goto="'+esc(nd.dataset.id)+'">'+esc(name)+'</button>':'<b>'+esc(name)+'</b>';
  const focus=id=>{ const nd=Array.from(flow.querySelectorAll(".node")).find(e=>e.dataset.id===String(id)); if(!nd) return;
    const fr=flow.getBoundingClientRect(), r=nd.getBoundingClientRect();
    treeX+=fr.left+fr.width/2-(r.left+r.width/2); treeY+=fr.top+fr.height/2-(r.top+r.height/2); placeTree(false);
    if(nd.scrollIntoView) nd.scrollIntoView({block:"center",inline:"nearest",behavior:"smooth"});
    clear(); nd.classList.add("hl"); cur="focus"; };
  const li=(name,amt,note,nd)=>'<li>'+go(name,nd)+' <span class="amt">'+esc(amt)+'</span>'+(note?'<div class="mut">'+esc(note)+'</div>':"")+'</li>';
  const card=h=>{ if(h.kind==="by"){ const a=byArrows[h.i]; if(!a) return ""; const {te,pe}=byEnds(a), user=te?te.dataset.n:"";
      return '<h4>'+esc(a.item)+' <span class="amt">'+fmt(a.amt)+'/min</span></h4><p class="mut">A byproduct.</p>'
        +'<p>It comes out of the <b>'+esc(R[a.from].machine)+'</b> making '+go(a.from,pe)+'.</p>'
        +'<p>It goes into the <b>'+esc(R[user]?R[user].machine:"machine")+'</b> making '+go(user,te)+(a.self?', which is the same machine it came out of':'')+'.</p>'
        +'<p class="mut">Nothing is made or bought for this share of the '+esc(a.item)+'.</p>'; }
    const cons=nodeOf(h.branch), ks=kidsOf(h.branch); if(!cons) return "";
    let rows=""; if(ks) for(const b of ks.children){ const nd=nodeOf(b); if(nd) rows+=li(nd.dataset.n,(nd.querySelector(".amt")||{}).textContent||"",(nd.querySelector(".src")||{}).textContent||"",nd); }
    for(const a of byArrows) if(String(a.to)===cons.dataset.id) rows+=li(a.item,fmt(a.amt)+"/min","Byproduct of the "+R[a.from].machine+" making "+a.from+(a.self?" (this same machine)":"")+". Press the name to go to where it comes out.",byEnds(a).pe);
    return '<h4>What goes straight into '+go(cons.dataset.n,cons)+' <span class="amt">'+esc((cons.querySelector(".amt")||{}).textContent||"")+'</span></h4><ul>'+rows+'</ul>'; };
  const hide=()=>{ tip.hidden=true; };
  const show=(h,e)=>{ const html=card(h); if(!html){ hide(); return; } tip.innerHTML='<button class="x" id="tipx" aria-label="Close">&times;</button>'+html; tip.hidden=false;
    const host=tip.parentElement.getBoundingClientRect(), w=tip.offsetWidth||300;
    tip.style.left=Math.round(Math.max(8,Math.min(host.width-w-8,e.clientX-host.left+12)))+"px"; tip.style.top=Math.round(e.clientY-host.top+12)+"px"; };
  // a click is a press and release without moving; anything more is a drag
  flow.addEventListener("pointerdown",e=>{ down={x:e.clientX,y:e.clientY,h:hit(e),moved:false}; });
  flow.addEventListener("pointermove",e=>{ if(down&&Math.abs(e.clientX-down.x)+Math.abs(e.clientY-down.y)>5) down.moved=true; });
  flow.addEventListener("pointerup",e=>{ const d=down; down=null; if(!d||d.moved) return; if(d.h) show(d.h,e); else hide(); });
  tip.addEventListener("click",e=>{ if(!e.target.closest) return; if(e.target.closest("#tipx")){ hide(); return; } const g=e.target.closest(".goto"); if(g) focus(g.dataset.goto); });
  if(document.addEventListener) document.addEventListener("keydown",e=>{ if(e.key==="Escape") hide(); }); }
function drawBy(){ const flow=$("ingr"), svg=flow.querySelector("svg.bylines"), txt=flow.querySelector("svg.bytext"); if(!svg||!txt) return;
  const zw=flow.firstElementChild, Z=treeZoom, fr=zw.getBoundingClientRect(), tr=zw.firstElementChild.getBoundingClientRect(), W=Math.ceil(tr.width/Z)+8, H=Math.ceil(tr.height/Z)+40;
  for(const s of [svg,txt]){ s.setAttribute("width",W); s.setAttribute("height",H); s.setAttribute("viewBox","0 0 "+W+" "+H); }
  const nodes=Array.from(flow.querySelectorAll(".node")); const box=e=>{ const r=e.getBoundingClientRect(); return {l:(r.left-fr.left)/Z,t:(r.top-fr.top)/Z,w:r.width/Z,h:r.height/Z}; };
  let lines='<defs><marker id="byhead" markerWidth="10" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L10 6L0 12Z" fill="currentColor"/></marker></defs>', labels="";
  const used={}, usedIn={}, hs=[], vs=[];
  // every stretch of line is checked against the ones already drawn and nudged aside until it has a lane to itself
  const freeY=(y,x1,x2,step)=>{ const lo=Math.min(x1,x2), hi=Math.max(x1,x2); for(let g=0;g<16&&hs.some(q=>Math.abs(q.y-y)<9&&q.lo<hi&&q.hi>lo);g++) y+=step; hs.push({y,lo,hi}); return y; };
  const freeX=(x,y1,y2,step)=>{ const lo=Math.min(y1,y2), hi=Math.max(y1,y2); for(let g=0;g<16&&vs.some(q=>Math.abs(q.x-x)<9&&q.lo<hi&&q.hi>lo);g++) x+=step; vs.push({x,lo,hi}); return x; };
  for(const a of byArrows){ const te=nodes.find(e=>e.dataset.id===String(a.to)), pe=a.self?te:nodes.find(e=>e.dataset.n===a.from); if(!pe||!te) continue; const p=box(pe), t=box(te);
    const kt=usedIn[a.to]=(usedIn[a.to]||0)+1, k=used[a.from]=(used[a.from]||0)+1, ol=Math.max(p.l,t.l), or=Math.min(p.l+p.w,t.l+t.w); let d, lx, ly;
    const above=t.t+t.h<=p.t-14, below=t.t>=p.t+p.h+14, pcx=Math.round(p.l+p.w/2+10*(k-1)), tcx=Math.round(t.l+t.w/2-10*(kt-1));
    if(pe!==te&&(above||below)&&or-ol>=30){
      // one box sits over the other: straight up or straight down, label halfway along
      const y0=Math.round(above?p.t:p.t+p.h), y1=Math.round(above?t.t+t.h+1:t.t-1), x=freeX(Math.round((ol+or)/2),y0,y1,10);
      d="M"+x+" "+y0+"V"+y1; lx=x; ly=Math.round((y0+y1)/2)+4; }
    else if(pe!==te&&(above||below)){
      // a row above or below: out of the bottom (or top), across in the gap beside the box that uses it, into its top (or bottom)
      const y0=Math.round(above?p.t:p.t+p.h), y1=Math.round(above?t.t+t.h+1:t.t-1);
      const lane=freeY(Math.round(above?t.t+t.h+18:t.t-18),pcx,tcx,above?10:-10), px=freeX(pcx,y0,lane,10), tx=freeX(tcx,lane,y1,-10);
      d="M"+px+" "+y0+"V"+lane+"H"+tx+"V"+y1; lx=Math.round((px+tx)/2); ly=lane+4; }
    else {
      // the same row: the line goes over the top, clear of every box it passes
      let over=Math.min(p.t,t.t); { const xl=Math.min(p.l,t.l), xr=Math.max(p.l+p.w,t.l+t.w), yb=Math.max(p.t+p.h,t.t+t.h);
        for(const e of nodes){ const bb=box(e); if(bb.l<xr&&bb.l+bb.w>xl&&bb.t<yb&&bb.t+bb.h>over-30) over=Math.min(over,bb.t); } }
      if(pe!==te){
        // two different boxes: up out of the top, across, down into the top
        const lane=freeY(Math.round(over-18),pcx,tcx,-10), px=freeX(pcx,lane,p.t,10), tx=freeX(tcx,lane,t.t,-10);
        d="M"+px+" "+Math.round(p.t)+"V"+lane+"H"+tx+"V"+Math.round(t.t-1); lx=Math.round((px+tx)/2); ly=lane+4; }
      else {
        // a box feeding itself: out of its right side, over its top, and into its own front, above the main line
        const x0=Math.round(p.l+p.w), x1=Math.round(p.l)-1, side=Math.round(p.t+p.h*0.3);
        const lane=freeY(Math.round(p.t-12),x1-14,x0+10,-10), xa=freeX(x0+10,lane,side,7), xb=Math.max(3,freeX(x1-13,lane,side,-7));
        d="M"+x0+" "+side+"H"+xa+"V"+lane+"H"+xb+"V"+side+"H"+x1; lx=Math.round((xa+xb)/2); ly=lane+4; } }
    const bi=byArrows.indexOf(a);
    lines+='<path class="vis" data-i="'+bi+'" d="'+d+'" marker-end="url(#byhead)"/><path class="hit" data-i="'+bi+'" d="'+d+'"/>';
    labels+='<text data-i="'+bi+'" x="'+lx+'" y="'+ly+'" text-anchor="middle">'+esc(a.item)+' '+fmt(a.amt)+'/min</text>'; }
  svg.innerHTML=lines; txt.innerHTML=labels; }
function layoutTree(){ const zw=$("ingr").firstElementChild, top=zw&&zw.firstElementChild; if(!top||!top.getBoundingClientRect||$("pane-mods").hidden) return;
  if(treeFresh){ treeZoom=1; treeX=0; treeY=0; zw.style.transform="none"; } const Z=treeZoom;
  for(const e of $("ingr").querySelectorAll(".node,.stub,.tri,.kids")){ e.style.marginTop=""; e.style.marginLeft=""; }
  { const nodes=Array.from($("ingr").querySelectorAll(".node"));
    // A box fed only by a byproduct slides right to sit directly under or over the machine that byproduct comes out of,
    // taking the rest of its run of boxes with it, wherever its row has the room. The arrow is then a straight line.
    for(const a of byArrows){ if(a.self) continue; const pe=nodes.find(e=>e.dataset.n===a.from), te=nodes.find(e=>e.dataset.id===String(a.to)); if(!pe||!te) continue;
      let br=te.parentElement; if(!br.classList.contains("tail")) continue;
      while(br.parentElement&&br.parentElement.classList.contains("kids")&&br.parentElement.children.length===1&&br.parentElement.parentElement.classList.contains("branch")) br=br.parentElement.parentElement;
      let used=0; for(const c of br.children) used+=c.getBoundingClientRect().width;
      const dx=(pe.getBoundingClientRect().left-te.getBoundingClientRect().left)/Z, room=(br.getBoundingClientRect().width-used)/Z-22;
      if(dx>0&&room>0) br.firstElementChild.style.marginLeft=Math.round(Math.min(dx,room))+"px"; } }
  const kid=(b,c)=>Array.from(b.children).filter(e=>e.classList.contains(c));
  const fix=b=>{ const node=kid(b,"node")[0], ks=kid(b,"kids")[0], bt=()=>b.getBoundingClientRect().top;
    if(!ks){ const r=node.getBoundingClientRect(); return Math.round((r.top+r.height/2-bt())/Z); }
    const ys=Array.from(ks.children).map(c=>{ const a=fix(c); c.style.setProperty("--a",a+"px"); return (c.getBoundingClientRect().top-bt())/Z+a; });
    const k=ys.length; let mid=Math.round(k%2?ys[(k-1)/2]:(ys[k/2-1]+ys[k/2])/2); const pad=parseFloat(getComputedStyle(b).paddingTop)||0;
    const need=node.getBoundingClientRect().height/2/Z+pad-mid; if(need>0){ ks.style.marginTop=Math.ceil(need)+"px"; mid+=Math.ceil(need); }
    for(const e of [node,...kid(b,"stub"),...kid(b,"tri")]) e.style.marginTop=Math.round(mid-pad-e.getBoundingClientRect().height/2/Z)+"px";
    return mid; };
  fix(top); drawBy(); placeTree(treeFresh); treeFresh=false; }
if(window.addEventListener) window.addEventListener("resize",layoutTree);
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(layoutTree);
function renderMod(){
  if(!cur) return; const root=cur, rate=Math.max(0,+$("rate").value||0), cs=cuts(root), L=line();
  const sol=C.solve(root,rate,cs);
  const {one,selfFuel,selfFert,FUELN,FERTN,fuelRaw,CONN,connMax,fuel1,perUnit,outUnit,stations,connAt,block,step,cp,fillAt,evenness,cand,pick,fitC,tightC,overC,round}=sizing(root,cs);
  // the arrows on the output box step by 1 from one upwards and by 0.01 below one
  $("rate").step=rate<1?0.01:1; lastRate=rate;
  $("mname").textContent=root;
  const it=I[root], st=status(root); const users=it.uses.filter(inTier);
  const ends=[...users, it.relic?"research":"", it.sell?"the shop":""].filter(Boolean);
  $("mmeta").innerHTML=`Tech tier ${it.tier}`+(it.sell?` · sells for ${price(root).toLocaleString()}`:"")+(ends.length?` · goes to ${esc(listAnd(ends))}`:" · nothing at this tier uses it")+` · on the bus: <b class="${st.code==="no"?"":"cu"}">${esc(label(st).toLowerCase())}</b>`;

  // --- fit ---
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
  if(fuel>1e-9&&!selfFuel&&!fuelRaw) bus+=rowKV(esc(FUELN),fmt(fuel)+"/min","fuel for the heated machines");
  if(sol.fert>1e-9&&!selfFert) bus+=rowKV(esc(FERTN),fmt(sol.fert)+"/min","for the nurseries");
  const busTotal=busItems.reduce((a,[,v])=>a+v,0)+((selfFuel||fuelRaw)?0:fuel)+(selfFert?0:sol.fert);
  $("busin").innerHTML=(bus||`<div class="empty">Nothing. This module runs on coins alone.</div>`)+(bus?`<div class="row tot"><span>Total off the bus</span><span>${fmt(busTotal)}/min</span></div>`:"");
  let coins=""; for(const [k,v] of Object.entries(sol.coins).sort((a,b)=>b[1]*I[b[0]].buy-a[1]*I[a[0]].buy)) coins+=rowKV(esc(k),fmt(v)+"/min",fmt(v*I[k].buy)+" copper/min");
  const fuelCopper=(fuelRaw&&fuel>1e-9)?fuel*I[FUELN].buy:0;
  if(fuelCopper>0) coins+=rowKV(esc(FUELN)+" (fuel)",fmt(fuel)+"/min",fmt(fuelCopper)+" copper/min");
  $("coins").innerHTML=(coins||`<div class="empty">No coins needed.</div>`)+(coins?`<div class="row tot"><span>Total coins</span><span>${fmt(sol.copper+fuelCopper)} copper/min</span></div>`:"");
  $("fuelnote").textContent="Fuel is "+FUELN+" at "+I[FUELN].heat.toLocaleString()+" heat each, plus 10% per Fuel Efficiency level. Nurseries are fed "+FERTN+".";
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
  const G=chain(root,cs), maxD=Math.max(...G.order.map(n=>G.depth[n]));
  const nodeHtml=(n,amt,isRoot,id,eye)=>{ const x=I[n]; if(!x) return ""; const fromBus=!isRoot&&cs.has(n);
    let src, act="", mark="", cls="made";
    if(isRoot){ src='<span class="src here">Made here</span>'; mark=' <small class="mut">the finished item</small>'; cls="root"; }
    else if(x.liq){ src='<span class="src pipe">Piped here</span>'; cls="pipe"; }
    else if(x.kind==="raw"){ src='<span class="src coin">Bought with coins</span>'; cls="coin"; }
    else if(x.kind==="crop"){ src='<span class="src here">Grown here</span>'; cls="crop"; }
    else { const s=status(n); const btn=(to,txt)=>'<button class="swap" data-item="'+esc(n)+'" data-to="'+to+'">'+txt+'</button>';
      if(fromBus){ src='<span class="src bus">Off the bus</span>'; cls="bus"; act=s.mine?btn("","Undo my choice"):btn("off","Keep it off the bus"); if(!s.mine&&L.forcedBy[n]&&L.forcedBy[n].includes(root)) mark=' <small class="mut">(won\'t fit otherwise)</small>'; }
      else { src='<span class="src here">Made here</span>'; act=s.mine?btn("","Undo my choice"):btn("bus","Put it on the bus"); if(s.code==="maybe") mark=' <small class="mut">(a maybe)</small>'; }
      if(s.mine) mark=' <small class="mut">(your choice)</small>'; }
    return '<div class="node '+cls+'" data-id="'+id+'" data-n="'+esc(n)+'"><div><b>'+esc(n)+'</b> <span class="amt">'+fmt(amt)+'/min</span></div><div>'+src+mark+'</div>'+act+(eye?'<button class="eye" data-eye="'+id+'" data-n="'+esc(n)+'" title="Show only what goes into '+esc(n)+'" aria-label="Show only what goes into '+esc(n)+'">'+EYE+'</button>':"")+'</div>'; };
  // a tree, read left to right: every item sits to the right of what goes into it, joined by lines, and the
  // finished item is at the far right. Something used in several places shows up in each, with the amount that place needs.
  byArrows=[]; let nid=0;
  // A byproduct goes back into the machine it came out of before anything else (the steel Athanor's spare iron ingots feed
  // the steel Athanor). Only what is left after that is shared out to other things that use the same item.
  // back: of every one of the item a machine takes in, how much it gives straight back (the steel Athanor returns 3 of
  // every 4 iron ingots). rest: what is left of the byproduct, across the whole module, for anything else that uses it.
  const pools={}; const poolOf=(n,from)=>pools[n]||(pools[n]=(()=>{ const pr=R[from], y=C.yieldOf(pr);
    const back=pr.ins[n]?Math.min(1,pr.outs[n]*y/pr.ins[n]):0, taken=(sol.flows[from]||0)/(pr.outs[from]*y)*(pr.ins[n]||0)*back;
    return {back,rest:Math.max(0,sol.recycled[n]-Math.min(sol.recycled[n],taken))}; })());
  const tree=(n,q,d,parent,pn)=>{ const isRoot=d===0, r=R[n], cut=!isRoot&&cs.has(n), id=++nid;
    let by=null; if(!isRoot&&!cut&&sol.recycled[n]>1e-9&&sol.flows[n]>1e-9){ const from=Object.keys(sol.flows).find(p=>p!==n&&R[p]&&R[p].outs[n]!=null&&I[p].kind!=="raw");
      if(from){ const pool=poolOf(n,from), self=pn===from, take=self?q*pool.back:Math.min(q,pool.rest); if(!self) pool.rest-=take;
        // the arrow always points at the thing that uses the byproduct; the item's own box shows only what still has to be made
        if(take>1e-6){ by={amt:take,from,full:take>=q-1e-6}; byArrows.push({from,item:n,amt:take,to:parent,self:pn===from}); if(by.full){ nid--; return ""; } } } }
    const leaf=d>40||!r||I[n].kind==="raw"||cut||(by&&by.full), mq=by?q-by.amt:q;
    let kids="", tail=false; if(!leaf){ const crafts=mq/(r.outs[n]*C.yieldOf(r)); const ks=Object.keys(r.ins).filter(i=>I[i]).sort((x,y)=>(G.pos[x]??0)-(G.pos[y]??0));
      const inner=ks.map(i=>tree(i,crafts*r.ins[i],d+1,id,n)).join("");
      tail=!inner&&ks.length>0;
      if(inner) kids='<div class="kids">'+inner+'</div><div class="stub" aria-hidden="true"></div><div class="tri" aria-hidden="true"></div>'; }
    return '<div class="branch'+(tail?' tail':'')+'">'+kids+nodeHtml(n,mq,isRoot,id,!!kids&&!isRoot)+'</div>'; };
  if(root!==treeRoot){ treeRoot=root; treeFresh=true; treeFocus=null; $("treetip").hidden=true; }
  $("ingr").innerHTML='<div class="zw" style="transform:'+treeTf()+'">'+tree(root,rate,0,0)+'<svg class="bylines" aria-hidden="true"></svg><svg class="bytext" aria-hidden="true"></svg></div>'; applyFocus(); layoutTree();

  // --- machines ---
  $("mrows").innerHTML=sol.list.filter(m=>m.count>1e-9).sort((a,b)=>(G.pos[a.item]??999)-(G.pos[b.item]??999)).map(m=>{ const n=m.count, b=Math.ceil(n-1e-9), busy=b?n/b*100:0;
    return `<tr><td>${esc(m.machine)}${m.heat?'<span class="heat">HEAT</span>':""}</td><td>${esc(m.out)}</td><td class="num">${fmt(m.each)}/min${m.capped?' <small class="mut">belt cap</small>':""}</td><td class="num">${fmt(n)}</td><td class="num">${b}</td><td class="num ${busy<99.5?"idle":""}">${b?Math.round(busy)+"%":"—"}</td></tr>`; }).join("");
  const tot=sol.list.reduce((a,m)=>a+Math.ceil(m.count-1e-9),0); const vv=C.volume(sol);
  $("mtot").textContent=plural(tot,"machine")+(vv.furn?" plus "+plural(vv.furn,"stone furnace")+" for heat":"");

  // --- byproducts ---
  const notes=[];
  for(const m of sol.list){ for(const o of m.out.split(" + ").slice(1)){
    if(sol.recycled[o]>1e-9){ const mk=sol.list.find(x=>x.item===o&&x.count>1e-9);
      if(mk) notes.push('<li><b>'+esc(o)+' comes back out of the '+esc(m.machine)+'</b> ('+fmt(sol.recycled[o])+'/min is reused here). Merge it in with a <b>priority merger, recycled '+esc(o)+' first</b>, ahead of the '+esc(o)+' from the '+esc(mk.machine)+'. Otherwise fresh supply fills the line, the '+esc(m.machine)+' can\'t get rid of its '+esc(o)+', and it stops.</li>');
      else notes.push('<li><b>'+esc(o)+' comes out of the '+esc(m.machine)+'</b> ('+fmt(sol.recycled[o])+'/min is used here). Nothing else in this module makes '+esc(o)+', so there is nothing to merge it with: send it straight to the machines that need it.</li>'); }
    if(sol.spare[o]>1e-9) notes.push(`<li><b>${fmt(sol.spare[o])}/min of spare ${esc(o)} comes out of the ${esc(m.machine)}.</b> It needs somewhere to go, like knowledge altars on the overflow side of a priority splitter, or the ${esc(m.machine)} backs up and stops.</li>`);
  }}
  $("notes").innerHTML=notes.length?`<div class="box"><h3>Byproducts: the only things that can stall this module</h3><ul class="notes">${notes.join("")}</ul><p class="fitsub">Everything else is safe to over-build. A machine with nowhere to send its output just waits.</p></div>`:"";
}
// stepping down from exactly 1 lands on 0.99, not 0 (typing a 0 yourself is left alone)
$("rate").oninput=e=>{ if(lastRate===1&&+$("rate").value===0&&$("rate").value!==""&&!(e&&e.inputType)) $("rate").value=0.99; renderMod(); };
$("fit").addEventListener("click",e=>{ const x=e.target.closest("[data-rate]"); if(x){ $("rate").value=+(+x.dataset.rate).toPrecision(6); renderMod(); } });
$("ingr").addEventListener("click",e=>{ const b=e.target.closest(".swap"); if(b) decide(b.dataset.item,b.dataset.to||null); });

// ---------- tab 3: machine rates ----------
function renderRates(){
  const q=$("rq").value.trim().toLowerCase(); const seen=new Set(); const rows=[];
  for(const n of Object.keys(I).sort((a,b)=>I[a].tier-I[b].tier||a.localeCompare(b))){ const r=R[n]; if(!r||I[n].kind==="raw"||seen.has(r.id)||!inTier(n)) continue; seen.add(r.id);
    const main=Object.keys(r.outs)[0]; const x=C.rate(r,main); const y=C.yieldOf(r); const crafts=x.per/(r.outs[main]*y);
    const ins=Object.entries(r.ins).map(([k,v])=>fmt(v*crafts)+" "+k).join(" + ")||(I[n].kind==="crop"?fmt(crafts*r.nut/C.fertValue())+" "+C.fert():"—");
    const outs=Object.entries(r.outs).map(([k,v])=>fmt(v*y*crafts)+" "+k).join(" + ");
    const txt=(main+" "+r.machine+" "+ins).toLowerCase(); if(q&&!txt.includes(q)) continue;
    rows.push(`<tr><td class="name">${esc(main)}</td><td>${esc(r.machine)}</td><td>${esc(ins)}</td><td>${esc(outs)}</td><td class="num">${r.heat?fmt(r.heat):""}</td><td class="why">${x.capped?"Capped at one belt ("+fmt(C.belt())+"/min). The recipe alone would be faster.":""}</td><td class="num">${I[n].tier}</td></tr>`); }
  $("rrows").innerHTML=rows.join("")||`<tr><td colspan="7" class="empty">Nothing matches.</td></tr>`;
}
$("rq").oninput=renderRates;

// ---------- redraw ----------
function redrawAll(){ saveSettings(); applyUpgrades(); line(); if(cur&&!inTier(cur)) cur=modNames()[0]||null; $("ctxtxt").textContent="Your setup: items up to tier "+tierMax()+" · "+dimTxt()+" tiles with "+num("connmax",8,1)+" bus connections · burning "+C.fuel()+" · feeding "+C.fert()+" · belts carry "+fmt(C.belt())+"/min.";
  renderBoard(); renderItems(); renderList(); renderMod(); renderRates(); fitTables(); }
for(const id of ["tier","fe","connmax","lvlbelt","lvlspeed","lvlalch","lvlfert","lvlsell"]) $(id).oninput=redrawAll;
for(const id of SEL_IDS) $(id).onchange=redrawAll;
for(const d of ["mL","mW","mH"]) $(d).oninput=redrawAll;
$("tier").onchange=redrawAll;
applyUpgrades(); line();
cur=I["Jupiter"]&&inTier("Jupiter")?"Jupiter":modNames()[0];
$("rate").value=+startRate(cur).toPrecision(5);
redrawAll();
if(FIRST_VISIT) setTab("setup");
