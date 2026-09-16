/* Pure data/query functions, shared by the interface and the regression checks. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LuodianCore = api;
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';
  const G = {school:0,track:1,batch:2,type:3,code:4,compound:5,n:6,plan:7,r25:8,s25:9,r24:10,s24:11,r23:12,s23:13,source:14,req:15,feeMin:16,feeMax:17,newCount:18,conflict:19,admit25:20};
  const TRACK = ['PHYSICS','HISTORY'];
  const bands = {
    chong:{name:'冲一冲',short:'冲',description:'往年组线位次更靠前',color:'peach'},
    wen:{name:'稳一稳',short:'稳',description:'与你的位次接近',color:'blue'},
    bao:{name:'保一保',short:'保',description:'往年组线位次更靠后',color:'green'},
    risk:{name:'再努力',short:'远',description:'与往年组线差距较大',color:'purple'},
    far:{name:'更多选择',short:'余',description:'往年组线位次明显靠后',color:'muted'},
    none:{name:'待了解',short:'待',description:'暂无有效的位次对照',color:'muted'}
  };
  function tier(rank, line) {
    if (!(rank > 0) || !(line > 0)) return 'none';
    const r = line/rank;
    return r >= 1.67 ? 'far' : r >= 1.18 ? 'bao' : r >= .95 ? 'wen' : r >= .77 ? 'chong' : 'risk';
  }
  function scoreAtRank(dist, rank) {
    if (!dist || !Number.isInteger(rank) || rank < 1 || rank > dist.rows.at(-1)[2]) return null;
    const rows = dist.rows;
    let lo=0, hi=rows.length-1, found=0;
    while(lo<=hi) { const m=(lo+hi)>>1; if(rows[m][2]>=rank) { found=m;hi=m-1; } else lo=m+1; }
    return {score:rows[found][0], edge:found===0 && rank<rows[0][3]};
  }
  function position(data, track, mode, value) {
    const dist=data.dist['2026|'+TRACK[track]], previous=data.dist['2025|'+TRACK[track]];
    if (value === '' || value === null || value === undefined) return {rank:null,error:'输入分数或位次，看看你的可能。'};
    const n=Number(value);
    if (!Number.isInteger(n)||n<1) return {rank:null,error:'请输入有效的正整数。'};
    if (!dist?.rows?.length) return {rank:null,error:'该科类的一分一段表暂未提供。'};
    let rank, score, lo, hi, edge=false;
    if (mode==='rank') {
      const point=scoreAtRank(dist,n);
      if (!point) return {rank:null,error:`位次应在 1–${dist.rows.at(-1)[2].toLocaleString('zh-CN')} 之间。`};
      rank=n;score=point.score;edge=point.edge;
    } else {
      const row=dist.rows.find(r=>r[0]===n);
      if (!row) return {rank:null,error:`当前表记录 ${dist.rows.at(-1)[0]}–${dist.rows[0][0]} 分；未收录的分数请改用准确位次。`};
      score=n;rank=row[2];lo=row[3];hi=row[4];
    }
    return {rank,score,lo,hi,edge,equivalent:scoreAtRank(previous,rank),error:null};
  }
  function subjectStatus(raw, subjects) {
    if (!raw) return 'unknown';
    if (raw==='不限') return 'ok';
    if (subjects.length!==2) return 'unset';
    const need=raw.split('和').map(s=>s.trim());
    if(need.some(s=>!['化学','生物','政治','地理'].includes(s))) return 'unknown';
    return need.every(s=>subjects.includes(s))?'ok':'mismatch';
  }
  function prepare(data) {
    data.keys=[];data.byKey=new Map();data.schoolGroups=data.schools.map(()=>[]);
    data.groups.forEach((g,i)=>{
      const s=data.schools[g[0]];
      const key=[s.code,g[1],g[2],g[3],g[4]].join('|');
      if(data.byKey.has(key)) throw Error('专业组标识重复，请检查数据：'+key);
      data.keys.push(key);data.byKey.set(key,i);data.schoolGroups[g[0]].push(i);
    });
    data.search=data.groups.map((g,i)=>{
      const s=data.schools[g[0]];
      return [s.n,s.code,s.city,s.prov,s.typ,g[4],g[5],...data.links[i].map(l=>data.dicts.major[l[0]])].join(' ').toLowerCase();
    });
    return data;
  }
  function query(data, filters, profile) {
    const f=filters, p=profile, q=(f.q||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows=[];
    data.groups.forEach((g,i)=>{
      if(g[1]!==p.track) return;
      const s=data.schools[g[0]];
      if(f.batch && g[2]!==f.batch || f.province && s.prov!==f.province || f.region && s.reg!==f.region) return;
      if(f.own && s.own!==f.own || f.level && s.lvl!==f.level || f.type && s.typ!==f.type) return;
      if(f.tag && !(s.tag||[]).includes(f.tag)) return;
      if(f.fee && !(g[G.feeMax]>0 && g[G.feeMax]<=Number(f.fee))) return;
      if(f.line && !(g[G.r25]>0)) return;
      if(f.subjectOnly && subjectStatus(g[G.req],p.subjects)!=='ok') return;
      if(q.some(word=>!data.search[i].includes(word))) return;
      // The major/category intersection must match one offering, not different majors in one group.
      if ((f.major!=='' && f.major!==undefined || f.category!=='' && f.category!==undefined) &&
          !data.links[i].some(l=>(f.major===''||f.major===undefined||l[0]===Number(f.major)) && (f.category===''||f.category===undefined||l[1]===Number(f.category)))) return;
      if(f.tier && tier(p.rank,g[G.r25])!==f.tier) return;
      rows.push(i);
    });
    const distance=g=>p.rank&&g[G.r25]>0?Math.abs(Math.log(g[G.r25]/p.rank)):Infinity;
    rows.sort((a,b)=>{
      const x=data.groups[a],y=data.groups[b];
      if(f.sort==='score') return (y[G.s25]>0?y[G.s25]:-1)-(x[G.s25]>0?x[G.s25]:-1)||a-b;
      if(f.sort==='fee') return (x[G.feeMax]>0?x[G.feeMax]:Infinity)-(y[G.feeMax]>0?y[G.feeMax]:Infinity)||a-b;
      if(f.sort==='plan') return y[G.plan]-x[G.plan]||a-b;
      return distance(x)-distance(y)||a-b;
    });
    return rows;
  }
  return {G,TRACK,bands,tier,scoreAtRank,position,subjectStatus,prepare,query};
});
