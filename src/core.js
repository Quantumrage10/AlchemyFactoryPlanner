// Pure calculation core. No DOM. Used by the page and by the node regression test.
function makeCore(DATA){
  const I=DATA.items, R=DATA.recipes, M=DATA.machines;
  const LO=2.4, HI=2.8;
  // What the base burns and what its nurseries are fed. Either can be any item with a heat or a feed value.
  let FUEL='Coke Powder', FERT='Advanced Fertilizer';
  function setSupplies(fuel,fert){ if(I[fuel]&&I[fuel].heat>0) FUEL=fuel; if(I[fert]&&I[fert].nutr>0) FERT=fert; return {fuel:FUEL,fert:FERT}; }
  const fuel=()=>FUEL, fert=()=>FERT;
  const fuelOptions=()=>Object.keys(I).filter(n=>I[n].heat>0).sort((a,b)=>I[a].heat-I[b].heat);
  const fertOptions=()=>Object.keys(I).filter(n=>I[n].nutr>0&&I[n].fspeed>0).sort((a,b)=>I[a].nutr-I[b].nutr);
  // a nursery grows as fast as its fertilizer lets it
  const timeOf=r=>(r.machine==='Nursery'&&r.nut)?r.nut/I[FERT].fspeed:r.t;
  // Upgrades. Belt speed and machine speed follow the same steps the game uses:
  // belts +15/min per Logistics level up to 12, then +3; machines +25% per Factory Efficiency level up to 12, then +5%.
  let BELT=60, SPEED=1;
  // Steps per level, as the game's upgrade screen shows them:
  // Alchemy Skill +10% extractor and alembic output; Fertilizer Efficiency +10%; Fuel Efficiency +10%;
  // Sales Ability +25% shop price up to level 12, then +10%.
  let ALCH=1, FERTM=1, SELLM=1;
  const YIELD_MACHINES=['Extractor','Thermal Extractor','Alembic','Advanced Alembic'];
  const yieldOf=r=>YIELD_MACHINES.includes(r.machine)?ALCH:1;
  function setUpgrades(beltLvl,speedLvl,alchLvl,fertLvl,sellLvl){
    const lv=x=>Math.max(0,Math.floor(x||0)); const b=lv(beltLvl), f=lv(speedLvl), a=lv(alchLvl), ft=lv(fertLvl), sl=lv(sellLvl);
    BELT=60+Math.min(b,12)*15+Math.max(0,b-12)*3; SPEED=1+Math.min(f,12)*0.25+Math.max(0,f-12)*0.05;
    ALCH=1+a*0.10;
    FERTM=1+ft*0.10; SELLM=1+Math.min(sl,12)*0.25+Math.max(0,sl-12)*0.10;
    return {belt:BELT,speed:SPEED,alch:ALCH,fert:FERTM,sell:SELLM}; }
  const belt=()=>BELT, speed=()=>SPEED, sellMult=()=>SELLM, fertValue=()=>I[FERT].nutr*FERTM;
  const isLiq=n=>!!(I[n]&&I[n].liq);
  const kind=n=>I[n]?I[n].kind:'none';
  // items per minute of `item` from ONE machine. Every machine is capped at one belt of output.
  function rate(r,item){ let per=60/timeOf(r)*r.outs[item]*yieldOf(r)*SPEED, capped=false;
    if(!isLiq(item)){ let cap=BELT; if(r.shared) cap/=r.shared; if(per>cap+1e-9){ per=cap; capped=true; } }
    return {per,capped}; }
  // cuts: Set of item names taken off the bus instead of made in this module
  function solve(root,outRate,cuts){
    let byp={}, res=null;
    for(let it=0;it<80;it++){
      const mach={}, busIn={}, coins={}, flows={}, nb={}; let fert=0;
      const expand=(n,q,d)=>{ if(d>60) return;
        if(n!==root && cuts.has(n)){ busIn[n]=(busIn[n]||0)+q; return; }
        const r=R[n]; if(!r){ busIn[n]=(busIn[n]||0)+q; return; }
        flows[n]=(flows[n]||0)+q;
        if(kind(n)==='raw'){ coins[n]=(coins[n]||0)+q; return; }
        const share=(byp[n]||0)*(q/(flows[n]||q)); const net=Math.max(0,q-share);
        const y=yieldOf(r); const machines=net/rate(r,n).per, crafts=net/(r.outs[n]*y);
        mach[n]=(mach[n]||0)+machines;
        if(r.nut) fert+=crafts*r.nut/fertValue();
        for(const o in r.outs) if(o!==n) nb[o]=(nb[o]||0)+crafts*r.outs[o]*y;
        for(const i in r.ins) expand(i,crafts*r.ins[i],d+1);
      };
      expand(root,outRate,0);
      const nbyp={}; for(const o in nb) if(flows[o]) nbyp[o]=Math.min(nb[o],flows[o]);
      const spare={}; for(const o in nb){ const used=Math.min(nb[o],flows[o]||0); if(nb[o]-used>1e-9) spare[o]=nb[o]-used; }
      res={mach,busIn,coins,fert,spare,flows,recycled:nbyp};
      let diff=0; const keys=new Set([...Object.keys(nbyp),...Object.keys(byp)]); for(const k of keys) diff+=Math.abs((nbyp[k]||0)-(byp[k]||0));
      byp=nbyp; if(diff<1e-9) break;
    }
    let hps=0; const list=[];
    for(const n in res.mach){ const r=R[n], c=res.mach[n]; hps+=c*(r.heat||0)*SPEED;
      list.push({item:n, machine:r.machine, out:Object.keys(r.outs).join(' + '), each:rate(r,n).per, capped:rate(r,n).capped, count:c, heat:(r.heat||0)>0}); }
    list.sort((a,b)=>b.count-a.count);
    let copper=0; for(const n in res.coins) copper+=res.coins[n]*(I[n].buy||0);
    return {root,list,busIn:res.busIn,coins:res.coins,copper,fert:res.fert,spare:res.spare,flows:res.flows,recycled:res.recycled,hps};
  }
  function volume(sol,scale){ let v=0,furn=0,miss=false; const k=scale||1;
    for(const m of sol.list){ const n=Math.ceil(m.count*k-1e-9); if(!n) continue; const d=M[m.machine];
      if(!d||!d.v){ miss=true; v+=8*n; continue; } v+=d.v*n; if(d.slots) furn+=Math.ceil(n/Math.max(1,Math.floor(9/d.slots))); }
    v+=furn*27; return {v,furn,miss}; }
  function fuelPerMin(sol,fe){ return sol.hps*60/(I[FUEL].heat*(1+0.1*fe)); }
  // smallest output where every machine count is whole (nurseries and single machines may round up)
  function cleanRate(root,cuts){ const r=R[root]; const unit=rate(r,root).per; const s=solve(root,unit,cuts);
    for(let k=1;k<=300;k++){ if(s.list.every(m=>{ const n=m.count*k; if(m.machine==='Nursery'||n<=1+1e-9) return true; return Math.abs(n-Math.round(n))<0.02; })) return unit*k; }
    return unit; }
  // The bus line. An item goes on the bus only when a module that needs it cannot fit making it inside one tile.
  // When a module is too big, take off the bus whichever ingredient removes the most machinery per item moved; repeat.
  // always on the bus: the chosen fuel and fertilizer, unless the fuel is something bought straight with coins
  const universal=()=>[FUEL,FERT].filter((n,i,a)=>I[n].kind==='made'&&a.indexOf(n)===i);
  // A simple conversion: one unheated machine turning one ingredient into the same number of this item
  // (steel ingot -> steel gear, coke -> coke powder). convertedFrom() names the ingredient, or null.
  function convertedFrom(n){ const r=R[n]; if(!r||!I[n]||I[n].kind!=='made'||I[n].liq||r.heat) return null;
    const ins=Object.keys(r.ins).filter(k=>!isLiq(k)), outs=Object.keys(r.outs).filter(k=>!isLiq(k));
    if(Object.keys(r.ins).length!==1||ins.length!==1||outs.length!==1) return null; const i=ins[0];
    if(!I[i]||I[i].kind!=='made'||r.ins[i]!==r.outs[n]) return null; return i; }
  // Which of the pair should ride the bus? The ingredient, but only when it has some other use as well:
  // steel ingot also goes into clockwork birds, so ship the ingot and make gears on site. Coke only ever
  // becomes coke powder, so shipping coke gains nothing and the powder is what ships.
  // simpleFrom() names the ingredient to ship instead of n, or null to ship n itself.
  function simpleFrom(n){ const i=convertedFrom(n); if(!i) return null; return I[i].uses.some(u=>u!==n)?i:null; }
  // true when n exists only to be converted into one other item (coke, which only becomes coke powder)
  function onlyFeedsConversion(n){ const u=I[n]?I[n].uses:[]; return u.length===1&&convertedFrom(u[0])===n; }
  function busLine(maxTier,cap){
    const made=Object.keys(I).filter(n=>I[n].kind==='made'&&!I[n].liq&&I[n].tier<=maxTier).sort((a,b)=>I[a].tier-I[b].tier||a.localeCompare(b));
    const UNIVERSAL=universal(); const B=new Set(UNIVERSAL), forcedBy={};
    const fits=sol=>volume(sol).v*HI<=cap;
    const plan=x=>{ const one=rate(R[x],x).per; const cuts=new Set(B); cuts.delete(x); let sol=solve(x,one,cuts), guard=0;
      while(!fits(sol)&&guard++<15){ const v0=volume(sol).v; let best=null;
        for(const c in sol.flows){ if(c===x||I[c].kind!=='made'||I[c].liq||cuts.has(c)) continue;
          const t=new Set(cuts); t.add(c); const sc=solve(x,one,t); const flow=sc.busIn[c]||0; if(flow<=0) continue;
          const gain=(v0-volume(sc).v)/flow; if(!best||gain>best.gain) best={c,gain,sc}; }
        if(!best||best.gain<=0) break;
        let c=best.c, src; while(!UNIVERSAL.includes(c)&&(src=simpleFrom(c))&&src!==x) c=src;
        cuts.add(c); sol=(c===best.c)?best.sc:solve(x,one,cuts); B.add(c); (forcedBy[c]=forcedBy[c]||[]).push(x); } };
    for(let pass=0;pass<4;pass++){ const before=B.size; for(const x of made) plan(x); if(pass>0&&B.size===before) break; }
    for(const k in forcedBy) forcedBy[k]=[...new Set(forcedBy[k])];
    return {bus:B,forcedBy};
  }
  return {I,R,M,LO,HI,get UNIVERSAL(){ return universal(); },setSupplies,fuel,fert,fuelOptions,fertOptions,isLiq,kind,rate,solve,volume,fuelPerMin,cleanRate,busLine,simpleFrom,convertedFrom,onlyFeedsConversion,setUpgrades,belt,speed,sellMult,fertValue,yieldOf};
}
if(typeof module!=='undefined') module.exports={makeCore};
