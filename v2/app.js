'use strict';
(() => {
  const C=window.LuodianCore, G=C.G, $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=v=>Number.isFinite(v)&&v>=0?v.toLocaleString('zh-CN'):'—';
  const valid=v=>v>0?nf(v):'—';
  const safeURL=v=>{try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
  const trackName=t=>t===1?'历史类':'物理类';
  const icon={heart:'<svg class="heart" viewBox="0 0 24 24"><path d="M20.7 5.8a5.2 5.2 0 0 0-7.4 0L12 7.1l-1.3-1.3a5.2 5.2 0 0 0-7.4 7.4L12 22l8.7-8.8a5.2 5.2 0 0 0 0-7.4Z" transform="translate(0 -2) scale(1 .95)"/></svg>',compare:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="7" height="14" rx="2"/><rect x="14" y="5" width="7" height="14" rx="2"/></svg>'};
  const defaults=()=>({q:'',batch:'本科批B段',province:'',region:'',category:'',major:'',own:'',level:'',type:'',tag:'',fee:'',tier:'',line:false,subjectOnly:false,sort:'close'});
  const state={route:'explore',view:'groups',pageSize:24,limit:24,profile:{track:0,mode:'score',value:550,subjects:[],demo:true},filters:defaults(),saved:[],compare:[],stage:false};
  let D, pos={}, matched=[], allMatched=[], viewRows=[], detailPromise=null, detailData=null, detailToken=0, openedDetail=null, toastTimer, refreshTimer, searchTimer;
  let subjectDraft=[], previousFocus=null, lastStorageWarning=0;
  const storage={read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}},write(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{if(Date.now()-lastStorageWarning>5000){toast('浏览器未允许本地保存；请导出清单留存。');lastStorageWarning=Date.now();}return false;}}};
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
  function persistProfile(){storage.write('luodian.v2.profile',state.profile);}
  function badge(i){const g=D.groups[i],t=g[1]===state.profile.track?C.tier(pos.rank,g[G.r25]):'none',b=C.bands[t];return `<span class="tier-badge ${b.color}">${b.name}</span>`;}
  function fee(g){if(!(g[G.feeMin]>0))return '学费待补充';return `${nf(g[G.feeMin])}${g[G.feeMax]>g[G.feeMin]?'–'+nf(g[G.feeMax]):''} 元/年`;}
  function majorNames(i,limit=4){return [...new Set(D.links[i].map(l=>D.dicts.major[l[0]]))].slice(0,limit).join(' · ');}
  function groupLabel(g){return `专业组 ${g[G.code]}`;}
  function seal(s){return esc(s.n.replace(/^(中国|中华|北京|上海|四川|重庆|广东|江苏|浙江|山东|河南|河北|湖南|湖北|辽宁|山西|陕西|广西|贵州|云南|福建|安徽)/,'' ).slice(0,1)||s.n[0]);}
  function subjectText(g){const status=C.subjectStatus(g[G.req],state.profile.subjects);return `<span class="${status==='ok'?'match-ok':status==='mismatch'?'match-warn':''}">${esc(g[G.req]||'选科未提供')}${status==='ok'&&state.profile.subjects.length===2?' · 匹配':status==='mismatch'?' · 不匹配':''}</span>`;}
  function actions(i){const saved=state.saved.includes(D.keys[i]),compared=state.compare.includes(i);return `<div class="mini-actions"><button class="mini-action" data-compare="${i}" aria-label="对比${esc(D.schools[D.groups[i][0]].n)}${esc(groupLabel(D.groups[i]))}" aria-pressed="${compared}">${icon.compare}</button><button class="mini-action" data-save="${i}" aria-label="${saved?'取消收藏':'收藏'}${esc(D.schools[D.groups[i][0]].n)}${esc(groupLabel(D.groups[i]))}" aria-pressed="${saved}">${icon.heart}</button></div>`;}
  function groupCard(i,n=0){const g=D.groups[i],s=D.schools[g[0]];return `<article class="result-card" style="--i:${Math.min(n,5)}"><div class="card-top"><div class="school-seal" aria-hidden="true">${seal(s)}</div><div class="card-title"><button class="school-name" data-school="${g[0]}">${esc(s.n)}</button><div class="card-location">${esc(s.prov)} · ${esc(s.city)}<span> / ${esc(s.own)}</span></div></div>${badge(i)}</div><div class="card-group"><strong>${esc(groupLabel(g))}</strong><span>·</span><span>${trackName(g[1])} · ${esc(g[G.req]||'选科未提供')}</span></div><p class="card-majors">${esc(majorNames(i))}${D.links[i].length>4?' 等':''}</p><div class="card-metrics"><div><span>2025 组线</span><strong>${valid(g[G.s25])}<small>${g[G.s25]>0?'分':''}</small></strong></div><div><span>2025 最低位次</span><strong class="rank-num">${valid(g[G.r25])}</strong></div><div><span>2026 计划</span><strong>${valid(g[G.plan])}<small>${g[G.plan]>0?'人':''}</small></strong></div></div><div class="card-meta"><span>${esc(fee(g))}</span>${subjectText(g)}</div><div class="card-actions"><button class="detail-link" data-group="${i}">了解这个组 <span aria-hidden="true">↗</span></button>${actions(i)}</div></article>`;}
  function schoolCard(row,n){const s=D.schools[row.school],lines=row.groups.map(i=>D.groups[i][G.s25]).filter(v=>v>0),lo=lines.length?Math.min(...lines):null,hi=lines.length?Math.max(...lines):null,majors=new Set(row.groups.flatMap(i=>D.links[i].map(l=>l[0])));return `<article class="result-card school-card" style="--i:${Math.min(n,5)}"><div class="card-top"><div class="school-seal">${seal(s)}</div><div class="card-title"><button class="school-name" data-school="${row.school}">${esc(s.n)}</button><div class="card-location">${esc(s.prov)} · ${esc(s.city)} / ${esc(s.own)}</div></div></div><div class="tag-row">${(s.tag||[]).filter(t=>['985','211','双一流','保研资格','双高计划','省重点'].includes(t)).slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}<span class="tag">${esc(s.typ)}</span></div><p class="card-school-summary">当前条件下有 <b>${row.groups.length}</b> 个专业组，<b>${majors.size}</b> 个专业名称。<br>${esc([...majors].slice(0,3).map(m=>D.dicts.major[m]).join(' · '))}</p><div class="card-metrics"><div><span>筛选范围内 · 2025 组线区间</span><strong>${lo===null?'—':nf(lo)+(lo!==hi?'–'+nf(hi):'')}<small>${lo?'分':''}</small></strong></div><div><span>符合条件的组</span><strong>${row.groups.length}<small>个</small></strong></div></div><div class="card-actions"><button class="detail-link" data-school="${row.school}">认识这所学校 <span>↗</span></button><span class="tag">${esc(s.lvl)}</span></div></article>`;}
  function majorCard(row,n){const names=[...row.schools].slice(0,3).map(si=>D.schools[si].n);return `<article class="result-card major-card" style="--i:${Math.min(n,5)}"><div class="card-top"><div class="school-seal">${esc(D.dicts.major[row.major][0])}</div><div class="card-title"><button class="school-name" data-major="${row.major}">${esc(D.dicts.major[row.major])}</button><div class="card-location">${esc([...row.categories].map(c=>D.dicts.cat[c]).join(' / '))}</div></div></div><p class="card-school-summary">${esc(names.join('、'))}${row.schools.size>3?' 等院校在当前范围内招生。':'。'}</p><div class="card-metrics"><div><span>符合条件的院校记录</span><strong>${row.schools.size}<small>所</small></strong></div><div><span>包含该专业的组</span><strong>${row.groups.size}<small>个</small></strong></div></div><div class="card-actions"><button class="detail-link" data-major="${row.major}">去看哪些学校可以选 <span>↗</span></button></div></article>`;}
  function options(items,value,blank='全部'){return `<option value="">${blank}</option>`+items.map(x=>{const v=Array.isArray(x)?x[0]:x,label=Array.isArray(x)?x[1]:x;return `<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(label)}</option>`;}).join('');}
  function setupControls(){
    const provinces=[...new Set(D.schools.map(s=>s.prov))].sort((a,b)=>(a==='四川'?-1:b==='四川'?1:a.localeCompare(b,'zh-CN')));
    $('#quick-province').innerHTML=options(provinces,state.filters.province,'全国');
    $('#quick-batch').innerHTML=options([...new Set(D.groups.filter(g=>g[1]===state.profile.track).map(g=>g[2]))],state.filters.batch,'全部批次');
    $('#quick-category').innerHTML=options(D.dicts.cat.map((n,i)=>[i,n]),state.filters.category,'全部门类');
    $('#data-count').textContent=`${nf(D.schools.length)} 条院校记录 · ${nf(D.groups.length)} 个专业组`;
    $('#data-version').textContent=`本次数据生成时间：${new Date(D.generated).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）；源数据版本 ${D.sourceVersion}。`;
    $('#search').value=state.filters.q;$('#sort').value=state.filters.sort;
  }
  function syncProfile(){
    $$('[data-track]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.track)===state.profile.track)));
    const mode=state.profile.mode;
    $('.position-panel').classList.toggle('rank-mode',mode==='rank');
    $('#position-value').value=state.profile.value;
    $('#value-label').textContent=mode==='rank'?'我的位次':'我的分数';$('#value-unit').textContent=mode==='rank'?'名':'分';
    $('[data-action="mode"]').textContent=mode==='rank'?'改用分数输入 ↗':'改用位次输入 ↗';
    $('#demo-label').textContent=state.profile.demo?'先用示例分数试试看':'你的定位 · 随时可以调整';
    $('#subject-label').textContent=state.profile.subjects.length?state.profile.subjects.join(' + '):'再选科目 · 未设置';
    $('#position-note').classList.toggle('error',!!pos.error&&state.profile.value!=='');
    $('#rank-value').textContent=pos.rank?nf(pos.rank):'—';
    $('#rank-title').textContent=mode==='rank'?'2026 年输入位次':'2026 年对应位次';
    $('#position-note').textContent=pos.error||`2026 ${trackName(state.profile.track)}${pos.lo?` · 同分位次 ${nf(pos.lo)}–${nf(pos.hi)}`:''}${pos.equivalent?` · 2025 同位次约 ${pos.equivalent.edge?'≥':''}${pos.equivalent.score} 分`:' · 2025 表暂无对应位次'}`;
    const dist=D.dist['2026|'+C.TRACK[state.profile.track]],min=dist.rows.at(-1)[0],max=dist.rows[0][0];
    $('#score-range').min=min;$('#score-range').max=max;$('#score-range').value=pos.score??Math.min(max,Math.max(min,Number(state.profile.value)||550));
    $('#score-range').disabled=mode==='rank';$('#range-min').textContent=min+' 分';$('#range-max').textContent=max+' 分';
    $('[data-action="minus"]').setAttribute('aria-label',mode==='rank'?'位次减少一名':'分数减少一分');
    $('[data-action="plus"]').setAttribute('aria-label',mode==='rank'?'位次增加一名':'分数增加一分');
  }
  function renderFilterChips(){
    const f=state.filters, labels={province:['地区',f.province],region:['大区',f.region],batch:f.batch!=='本科批B段'?['批次',f.batch||'全部']:null,category:f.category!==''?['门类',D.dicts.cat[Number(f.category)]]:null,major:f.major!==''?['专业',D.dicts.major[Number(f.major)]]:null,own:['性质',f.own],level:['层次',f.level],type:['类型',f.type],tag:['标签',f.tag],fee:['学费',f.fee?'组内最高 ≤ '+nf(Number(f.fee))+' 元':''],tier:f.tier?['对照',C.bands[f.tier].name]:null,line:f.line?['仅看','有2025组线']:null,subjectOnly:f.subjectOnly?['选科','仅看匹配']:null};
    const entries=Object.entries(labels).filter(([,v])=>v&&v[1]);
    $('#active-filters').innerHTML=entries.map(([k,v])=>`<button data-clear-filter="${k}" aria-label="移除${esc(v[0]+v[1])}筛选">${esc(v[0])} · ${esc(v[1])}<span>×</span></button>`).join('')+(entries.length?'<button class="clear" data-action="filter-reset-inline">重置筛选</button>':'');
    $('#filter-count').hidden=!entries.length;$('#filter-count').textContent=entries.length;
    $('#quick-province').value=f.province;$('#quick-batch').value=f.batch;$('#quick-category').value=f.category;
    $$('[data-tier]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tier===f.tier)));
    $('[data-action="search-clear"]').hidden=!f.q;
  }
  function renderLandscape(){
    const seen=new Set(), chosen=[];
    for(const t of ['bao','wen','chong']){const i=allMatched.find(i=>C.tier(pos.rank,D.groups[i][G.r25])===t&&!seen.has(D.groups[i][0]));if(i!==undefined){chosen.push({i,t});seen.add(D.groups[i][0]);}}
    if(!chosen.length)for(const i of allMatched.slice(0,12)){if(!seen.has(D.groups[i][0])){chosen.push({i,t:'none'});seen.add(D.groups[i][0]);}if(chosen.length===3)break;}
    $('#land-nodes').innerHTML=chosen.map(({i,t})=>{const g=D.groups[i],s=D.schools[g[0]];return `<button class="land-node" data-group="${i}" aria-label="了解${esc(s.n)}${esc(groupLabel(g))}"><span class="node-dot">${C.bands[t].short}</span><span><strong>${esc(s.n)}</strong><small>${g[G.s25]>0?'2025 组线 '+g[G.s25]+' 分':'往年线待了解'} · ${esc(s.prov)}</small></span></button>`;}).join('');
  }
  function aggregate(){
    if(state.view==='groups')return matched;
    if(state.view==='schools'){const map=new Map();matched.forEach(i=>{const s=D.groups[i][0];if(!map.has(s))map.set(s,{school:s,groups:[]});map.get(s).groups.push(i);});return [...map.values()];}
    const map=new Map(),q=state.filters.q.trim().toLowerCase(),hasMajorQuery=q&&D.dicts.major.some(m=>m.toLowerCase().includes(q));
    matched.forEach(i=>D.links[i].forEach(([m,c])=>{
      if(state.filters.major!==''&&m!==Number(state.filters.major)||state.filters.category!==''&&c!==Number(state.filters.category)||hasMajorQuery&&!D.dicts.major[m].toLowerCase().includes(q))return;
      if(!map.has(m))map.set(m,{major:m,schools:new Set(),groups:new Set(),categories:new Set()});
      const row=map.get(m);row.groups.add(i);row.schools.add(D.groups[i][0]);row.categories.add(c);
    }));
    return [...map.values()].sort((a,b)=>b.schools.size-a.schools.size||a.major-b.major);
  }
  function renderResults(append=false){
    const shown=viewRows.slice(0,state.limit),unit=state.view==='groups'?'个专业组':state.view==='schools'?'条院校记录':'个专业名称';
    $('#results-count').innerHTML=`找到 <strong>${nf(viewRows.length)}</strong> ${unit}<span> · ${trackName(state.profile.track)}${state.filters.batch?' / '+esc(state.filters.batch):' / 全部批次'}</span>`;
    const renderer=state.view==='groups'?groupCard:state.view==='schools'?schoolCard:majorCard;
    if(!viewRows.length){$('#results').innerHTML=`<div class="empty-state"><div class="empty-mark">○</div><h3>给可能，多一点空间。</h3><p>暂时没有同时符合这些条件的数据。试试移除一个筛选条件，或换一个专业关键词。</p><button class="button primary" data-action="empty-reset">放宽条件，重新看看 ↗</button></div>`;}
    else if(append){$('#results').insertAdjacentHTML('beforeend',shown.slice(state.limit-state.pageSize).map((row,n)=>renderer(row,n)).join(''));}
    else $('#results').innerHTML=shown.map((row,n)=>renderer(row,n)).join('');
    $('#results').setAttribute('aria-busy','false');$('[data-action="more"]').hidden=state.limit>=viewRows.length;
    $('#shown-count').textContent=viewRows.length?`已呈现 ${nf(shown.length)} / ${nf(viewRows.length)} ${unit}`:'';
    $$('#results .result-card').forEach((el,i)=>{if(i>5)el.style.animation='none';});
  }
  function refresh({reset=true,land=true}={}){
    if(!D)return;pos=C.position(D,state.profile.track,state.profile.mode,state.profile.value);syncProfile();
    const p={...state.profile,rank:pos.rank};allMatched=C.query(D,{...state.filters,tier:''},p);matched=state.filters.tier?allMatched.filter(i=>C.tier(pos.rank,D.groups[i][G.r25])===state.filters.tier):allMatched;
    for(const t of ['chong','wen','bao'])$('#count-'+t).textContent=pos.rank?nf(allMatched.filter(i=>C.tier(pos.rank,D.groups[i][G.r25])===t).length):'—';
    if(reset)state.limit=state.pageSize;viewRows=aggregate();renderFilterChips();renderResults();if(land)renderLandscape();updateURL();
  }
  function scheduleProfile(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refresh();persistProfile();},90);}
  function updateURL(){if(!D)return;const p=new URLSearchParams();p.set('track',state.profile.track);if(state.profile.value!=='')p.set(state.profile.mode,state.profile.value);if(state.profile.demo)p.set('demo','1');if(state.profile.subjects.length)p.set('subjects',state.profile.subjects.join(','));for(const k of ['q','province','region','category','major','own','level','type','tag','fee','tier'])if(state.filters[k]!=='')p.set(k,state.filters[k]);if(state.filters.batch!=='本科批B段')p.set('batch',state.filters.batch);if(state.filters.subjectOnly)p.set('subjectOnly','1');if(state.filters.line)p.set('line','1');if(state.filters.sort!=='close')p.set('sort',state.filters.sort);if(state.view!=='groups')p.set('view',state.view);if(state.stage)p.set('stage','1');if(document.body.classList.contains('noanim'))p.set('noanim','1');try{history.replaceState(null,'','?'+p+'#'+state.route);}catch{}}
  function navigate(route){state.route=route==='saved'?'saved':'explore';$('#explore-page').hidden=state.route!=='explore';$('#saved-page').hidden=state.route!=='saved';$$('[data-route]').forEach(b=>{const on=b.dataset.route===state.route;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(state.route==='saved')renderSaved();updateURL();window.scrollTo({top:0,behavior:'smooth'});}
  function chooseView(view){state.view=['groups','schools','majors'].includes(view)?view:'groups';$$('[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view===state.view)));refresh({land:false});}
  function chooseMajor(m){state.filters.major=Number(m);state.view='groups';$$('[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view==='groups')));refresh({land:false});$('#explorer').scrollIntoView({behavior:'smooth'});}
  function saveToggle(i){const key=D.keys[i],index=state.saved.indexOf(key);if(index>=0){state.saved.splice(index,1);toast('已从心愿单移除');}else{state.saved.push(key);toast('已收进心愿单，慢慢比较。');}storage.write('luodian.v2.saved',state.saved);syncSavedButtons();if(state.route==='saved')renderSaved();}
  function syncSavedButtons(){$('#saved-count').textContent=state.saved.length;$$('[data-save]').forEach(b=>{const i=Number(b.dataset.save),on=state.saved.includes(D.keys[i]);b.setAttribute('aria-pressed',String(on));if(b.classList.contains('button'))b.innerHTML=icon.heart+(on?'已在心愿单':'加入心愿单');else b.setAttribute('aria-label',(on?'取消收藏':'收藏')+D.schools[D.groups[i][0]].n+groupLabel(D.groups[i]));});}
  function compareToggle(i){const at=state.compare.indexOf(i);if(at>=0)state.compare.splice(at,1);else if(state.compare.length<3)state.compare.push(i);else{toast('一次对比最多 3 个专业组，先移除一个再试试。');return;}syncCompare();}
  function syncCompare(){$('#compare-tray').hidden=!state.compare.length;$('#compare-summary').textContent=`已选 ${state.compare.length} / 3 个专业组`;$$('[data-compare]').forEach(b=>b.setAttribute('aria-pressed',String(state.compare.includes(Number(b.dataset.compare)))));}
  function renderSaved(){
    $('#saved-total').textContent=state.saved.length;
    if(!state.saved.length){$('#saved-results').innerHTML='<div class="empty-state"><div class="empty-mark">♡</div><h3>心动的学校，值得留个位置。</h3><p>探索时点一下卡片上的爱心，把感兴趣的专业组收在这里。</p><button class="button primary" data-route="explore">去发现我的可能 ↗</button></div>';return;}
    $('#saved-results').innerHTML=state.saved.map((key,n)=>{const i=D.byKey.get(key);if(i===undefined)return '';const g=D.groups[i],s=D.schools[g[0]];return `<article class="saved-row"><span class="saved-number">${String(n+1).padStart(2,'0')}</span><div class="saved-info"><h3><button class="school-name" data-group="${i}">${esc(s.n)} · ${esc(groupLabel(g))}</button></h3><p>${trackName(g[1])} · ${esc(g[G.batch])} · ${esc(g[G.req]||'选科待补充')} · 2025 组线 ${valid(g[G.s25])} 分</p><button class="text-button" data-group="${i}">${esc(majorNames(i,3))} ↗</button></div><div class="saved-actions"><button data-move="${n}" data-dir="-1" aria-label="上移第${n+1}项" ${n===0?'disabled':''}>↑</button><button data-move="${n}" data-dir="1" aria-label="下移第${n+1}项" ${n===state.saved.length-1?'disabled':''}>↓</button><button data-compare="${i}" aria-label="对比${esc(s.n)}${esc(groupLabel(g))}" aria-pressed="${state.compare.includes(i)}">⊞</button><button data-save="${i}" aria-label="移除${esc(s.n)}${esc(groupLabel(g))}" aria-pressed="true">×</button></div></article>`;}).join('');
  }
  function exportSaved(){if(!state.saved.length){toast('先收藏几个心动的专业组，再导出吧。');return;}const lines=['落点 · 我的心愿单',new Date().toLocaleDateString('zh-CN'),`定位：${trackName(state.profile.track)} ${state.profile.value}${state.profile.mode==='rank'?'名':'分'}${state.profile.demo?'（示例）':''}`,`再选科目：${state.profile.subjects.join('、')||'未设置'}`,'这是探索清单，正式填报请按科类、批次分别核对当年规则。',''];state.saved.forEach((key,n)=>{const i=D.byKey.get(key),g=D.groups[i],s=D.schools[g[0]];lines.push(`${n+1}. ${s.n}（院校代码 ${s.code}）· ${groupLabel(g)}`,`   ${trackName(g[1])} / ${g[G.batch]} / ${g[G.type]} / 选科：${g[G.req]||'未提供'}`,`   2025 组线 ${valid(g[G.s25])} 分 / 位次 ${valid(g[G.r25])} / 2026 计划 ${valid(g[G.plan])} 人`,`   ${majorNames(i,100)}`,`   招生考试报学费：${fee(g)}`,`   招生章程：${safeURL(s.charter)||'未提供'}`,'');});lines.push('数据生成时间：'+D.generated,'官方填报请以当年招生计划、招生章程和四川省教育考试院公布信息为准。');const url=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='落点_我的心愿单.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('心愿单已导出');}
  function openDialog(id){previousFocus=document.activeElement;$$('dialog[open]').forEach(d=>d.close());const el=$('#'+id);el.showModal();el.scrollTop=0;el.querySelector('[data-close]')?.focus({preventScroll:true});}
  function closeDialog(el){detailToken++;el.close();previousFocus?.focus?.({preventScroll:true});}
  function openFilters(){
    const f=state.filters,arr=(key)=>[...new Set(D.schools.map(s=>s[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    const fields=[['province','想去的省份',arr('prov'),'全国'],['region','地理大区',arr('reg'),'全部大区'],['batch','招生批次',[...new Set(D.groups.filter(g=>g[1]===state.profile.track).map(g=>g[2]))],'全部批次'],['category','学科门类',D.dicts.cat.map((n,i)=>[i,n]),'全部门类'],['own','办学性质',arr('own'),'全部性质'],['level','办学层次',arr('lvl'),'全部层次'],['type','院校类型',arr('typ'),'全部类型'],['tag','院校特色',Object.keys(D.tags),'全部标签'],['fee','组内最高年学费',[[5000,'不超过 5,000 元'],[8000,'不超过 8,000 元'],[15000,'不超过 15,000 元'],[30000,'不超过 30,000 元']],'不限（含未知）'],['tier','与往年位次的对照',Object.entries(C.bands).map(([k,b])=>[k,b.name]),'全部对照']];
    $('#filter-fields').innerHTML=fields.map(([k,label,items,blank])=>`<div class="field"><label for="filter-${k}">${label}</label><select id="filter-${k}" name="${k}">${options(items,f[k],blank)}</select></div>`).join('')+`<label class="check-row"><input type="checkbox" name="line" ${f.line?'checked':''}>只看有 2025 专业组线的记录</label><label class="check-row"><input type="checkbox" name="subjectOnly" ${f.subjectOnly?'checked':''} ${state.profile.subjects.length!==2?'disabled':''}>仅看选科匹配${state.profile.subjects.length!==2?'（请先设置两门再选科目）':''}</label><p class="fine-print" style="grid-column:1/-1">学费上限按组内最高填报学费筛选，未知值不视为免费。特殊批次的报考资格、身体条件及章程要求需另外核对。</p>`;
    openDialog('filter-dialog');
  }
  function renderSubjects(){
    $('#subject-options').innerHTML=['化学','生物','政治','地理'].map(s=>`<button data-subject="${s}" aria-pressed="${subjectDraft.includes(s)}">${s}${subjectDraft.includes(s)?' ✓':''}</button>`).join('');
    $('#subject-only').disabled=subjectDraft.length!==2;if(subjectDraft.length!==2)$('#subject-only').checked=false;
  }
  function openSubjects(){subjectDraft=[...state.profile.subjects];$('#subject-only').checked=state.filters.subjectOnly;renderSubjects();openDialog('subject-dialog');}
  function resetFilters(){state.filters=defaults();$('#search').value='';$('#sort').value='close';refresh();}
  function preset(name){state.filters=defaults();state.view='groups';if(name==='sichuan')state.filters.province='四川';if(name==='public'){state.filters.own='公办';state.filters.level='本科';}if(name==='teacher'){state.filters.type='师范';}if(name==='tech'){state.filters.category=0;}if(name==='vocational'){state.filters.batch='高职(专科)批';state.filters.tag='双高计划';}$('#search').value='';$('#sort').value='close';$$('[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view==='groups')));refresh();$('#explorer').scrollIntoView({behavior:'smooth'});}
  function positionComparison(i){
    const g=D.groups[i];
    if(g[1]!==state.profile.track)return `<div class="note-box">这是${trackName(g[1])}专业组，与你当前的${trackName(state.profile.track)}定位不同；不进行跨科类分差与位次比较。</div>`;
    if(!pos.rank)return '<div class="note-box">设置有效的分数或位次后，这里会显示你与往年组线的同位次分数对照。</div>';
    if(!(g[G.r25]>0))return '<div class="note-box">暂无有效的 2025 专业组线，不能据此判断录取位置，也不直接认定为今年新增。可以继续查看组内专业和同校其他组。</div>';
    const eq=pos.equivalent, gap=eq&&!eq.edge&&g[G.s25]>0?eq.score-g[G.s25]:null;
    const b=C.bands[C.tier(pos.rank,g[G.r25])],ahead=pos.rank<=g[G.r25];
    return `<div class="position-compare"><div class="comparison-numbers"><div><small>你的 2025 同位次等效分</small><strong>${eq?(eq.edge?'≥':'')+eq.score:'—'}</strong><small>当前位次 ${nf(pos.rank)}</small></div><div class="gap"><small>同口径分差</small><strong>${gap===null?'—':(gap>0?'+':'')+gap}</strong><span class="tier-badge ${b.color}">${b.name}</span></div><div><small>该组 2025 调档线</small><strong>${valid(g[G.s25])}</strong><small>最低位次 ${valid(g[G.r25])}</small></div></div><div class="comparison-scale" aria-hidden="true"><i class="comparison-pin" style="left:${ahead?27:73}%"></i><i class="comparison-pin theirs" style="left:${ahead?73:27}%"></i><span>位次靠前</span><span>位次靠后</span></div><p>${ahead?'你的当前位次靠前':'你的当前位次靠后'} ${nf(Math.abs(pos.rank-g[G.r25]))} 名。${b.description}，是位置对照，不是录取概率。色带仅表达相对位置。${eq?.edge?'等效分在表格边界外，不给出精确分差。':''}</p></div>`;
  }
  function historyTable(g){return `<table class="history-table"><thead><tr><th>数据年份</th><th>组线 / 分</th><th>最低位次</th><th>比较口径</th></tr></thead><tbody><tr><td>2025</td><td>${valid(g[G.s25])}</td><td>${valid(g[G.r25])}</td><td>新高考 · ${trackName(g[1])}</td></tr><tr class="old"><td>2024</td><td>${valid(g[G.s24])}</td><td>${valid(g[G.r24])}</td><td>旧文理 · 仅作参考</td></tr><tr class="old"><td>2023</td><td>${valid(g[G.s23])}</td><td>${valid(g[G.r23])}</td><td>旧文理 · 仅作参考</td></tr></tbody></table>`;}
  function loadTextData(name){return fetch('../data/'+name+'.js?v='+D.hashes[name].slice(0,12),{cache:'force-cache'}).then(async r=>{if(!r.ok)throw Error('数据请求失败，请检查网络后重试。');const bytes=await r.arrayBuffer();if(window.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',bytes),hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');if(hex!==D.hashes[name])throw Error('数据已更新，目录与专业明细版本不一致，请刷新页面后重试。');}const text=new TextDecoder().decode(bytes),marker='LD.'+name+'=',at=text.indexOf(marker);if(at<0)throw Error('数据文件格式不正确。');return JSON.parse(text.slice(at+marker.length).replace(/;\s*$/,''));});}
  async function loadDetails(){
    if(detailData)return detailData;
    if(!detailPromise)detailPromise=Promise.all([loadTextData('meta'),loadTextData('offerings')]).then(([meta,rows])=>{if(rows.length!==D.counts.offerings||meta.gen!==D.generated)throw Error('检索目录需要更新，请刷新后重试。');const byGroup=Array.from({length:D.groups.length},()=>[]);rows.forEach(o=>{if(!byGroup[o[0]])throw Error('专业组关联不完整。');byGroup[o[0]].push(o);});detailData={meta,rows,byGroup};return detailData;}).catch(e=>{detailPromise=null;throw e;});
    return detailPromise;
  }
  const dict=(meta,key,index)=>index>=0&&meta.dicts[key]?.[index]!==undefined?meta.dicts[key][index]:'';
  function professionalRows(i,data){return data.byGroup[i].map(o=>{
    const m=data.meta,notes=dict(m,'note',o[3]),tfee=dict(m,'tfee',o[7]),url=safeURL(dict(m,'url',o[20])),publisher=dict(m,'fpub',o[28]),kind=dict(m,'fkind',o[29]);
    const fields=[['招生考试报 · 专业年学费',tfee?tfee+' 元':'未提供'],['2026 专业计划',o[6]>0?o[6]+' 人':'未提供'],['软科专业评级（源表）',dict(m,'sr',o[22])||'未提供'],['软科专业排名（源表）',o[23]>0?nf(o[23]):'未提供'],['学科评估（源表关联字段）',dict(m,'de',o[24])||'未提供'],['硕士点（源表）',dict(m,'mp',o[26])||'未提供'],['博士点（源表）',dict(m,'dp',o[27])||'未提供']];
    return `<details class="major-detail"><summary><strong>${esc(dict(m,'major',o[2]))}<span class="tag">${esc(o[1])}</span></strong><small>${o[9]>0?'2025 '+o[9]+' 分':'2025 暂无线'}<br>${o[10]>0?'位次 '+nf(o[10]):''}</small></summary><div class="major-data">${fields.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>${notes?`<p>专业备注：${esc(notes)}</p>`:''}<table class="history-table"><thead><tr><th>年份</th><th>专业最低分</th><th>最低位次</th></tr></thead><tbody><tr><td>2025 · 新高考</td><td>${valid(o[9])}</td><td>${valid(o[10])}</td></tr><tr class="old"><td>2024 · 旧文理参考</td><td>${valid(o[11])}</td><td>${valid(o[12])}</td></tr><tr class="old"><td>2023 · 旧文理参考</td><td>${valid(o[13])}</td><td>${valid(o[14])}</td></tr></tbody></table>${o[16]&&o[16]!=='UNVERIFIED'?`<p><b>另外收录的院校收费材料</b><br>${esc(kind||'类型未注明')}${publisher?' · '+esc(publisher):''}<br>收费区间 ${valid(o[17])}–${valid(o[18])} 元。该材料是院校级或其他省份口径，不能替代上方四川专业填报值。</p>${dict(m,'fee',o[19])?`<details><summary>查看收费材料原文摘录</summary><p>${esc(dict(m,'fee',o[19]))}</p></details>`:''}${url?`<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener">打开收费材料来源 ↗</a>`:''}`:'<p>暂未提供可关联的院校收费材料。</p>'}<p class="fine-print">专业录取线与专业组调档线不同；所列评价字段年份以原始资料为准，缺失不代表没有。</p></details>`;
  }).join('');}
  async function fillProfessional(i,token){
    try{const data=await loadDetails();if(token!==detailToken||!$('#detail-dialog').open)return;$('#professional-content').innerHTML=professionalRows(i,data)||'<div class="note-box">本组暂无专业明细。</div>';}
    catch(e){if(token!==detailToken||!$('#detail-dialog').open)return;$('#professional-content').innerHTML=`<div class="note-box warn">${esc(e.message)}<br><button class="button" data-retry-details="${i}">重新加载专业明细</button></div>`;}
  }
  function openGroup(i){
    if(!D.groups[i])return;openedDetail={type:'group',i};const g=D.groups[i],s=D.schools[g[0]],saved=state.saved.includes(D.keys[i]),url=safeURL(s.charter),status=C.subjectStatus(g[G.req],state.profile.subjects);
    const change=g[G.plan]>0&&g[G.admit25]>0?`2026 计划 ${g[G.plan]} 人；2025 实际录取 ${g[G.admit25]} 人。${g[G.admit25]>=10?'计划与去年录取人数相差 '+Math.round((g[G.plan]/g[G.admit25]-1)*100)+'%。':'去年录取基数较小，不显示百分比。'}该比较不自动代表同口径扩招。`:'';
    $('#detail-kicker').textContent='认识一个专业组';
    $('#detail-content').innerHTML=`<div class="detail-head"><div class="tag-row">${(s.tag||[]).slice(0,5).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><h2 id="detail-title">${esc(s.n)}</h2><div class="detail-sub"><span>${esc(s.prov)} · ${esc(s.city)} · ${esc(s.own)}</span><span>院校代码 ${esc(s.code)}</span></div><div class="detail-sub"><b>${esc(groupLabel(g))}</b><span>${trackName(g[1])} · ${esc(g[G.batch])} · ${esc(g[G.type])}</span></div><div class="detail-actions"><button class="button primary" data-save="${i}" aria-pressed="${saved}">${icon.heart}${saved?'已在心愿单':'加入心愿单'}</button><button class="button" data-compare="${i}" aria-pressed="${state.compare.includes(i)}">${icon.compare}加入对比</button>${url?`<a class="button" href="${esc(url)}" target="_blank" rel="noopener">招生章程 ↗</a>`:''}</div></div><section class="detail-section"><h3>你与这个组的距离 ${badge(i)}</h3>${positionComparison(i)}</section><section class="detail-section"><h3>先看清这些条件</h3><div class="detail-stats"><div class="detail-stat"><span>再选科目要求</span><strong style="font-size:19px">${esc(g[G.req]||'未提供')}</strong><small>${status==='ok'?'符合已知选科要求':status==='mismatch'?'与你的选科不匹配':status==='unset'?'设置两门再选科目后核验':'要求未提供，请核对章程'}</small></div><div class="detail-stat"><span>2026 招生计划</span><strong>${valid(g[G.plan])}</strong><small>人 · 本专业组合计</small></div><div class="detail-stat"><span>招生考试报学费</span><strong style="font-size:17px">${g[G.feeMin]>0?nf(g[G.feeMin])+(g[G.feeMax]>g[G.feeMin]?'–'+nf(g[G.feeMax]):''):'—'}</strong><small>元 / 年 · 组内专业区间</small></div></div>${g[G.type]!=='普通类'||g[G.batch]!=='本科批B段'&&g[G.batch]!=='高职(专科)批'?'<p class="note-box warn" style="margin-top:14px">这个组涉及特殊类型或批次，分数和选科匹配不等于具备报考资格。请另外核对资格、体检和投档要求。</p>':''}${change?`<p class="fine-print">${esc(change)}</p>`:''}</section><section class="detail-section"><h3>本组历年调档线 <span>${g[G.r25]>0?(g[G.source]===0?'源表标记：官方值':'源表推导值'):'暂无2025线'}</span></h3>${historyTable(g)}<p class="fine-print">2024 及以前为旧文理口径，不参与本页冲稳保分档。组内专业和招生计划可能跨年调整。</p></section><section class="detail-section"><h3>组内专业 <span>${D.links[i].length} 个专业名称组合</span></h3><p class="note-box">进组之后才分专业。热门专业的录取要求可能高于组线，展开每个专业查看它自己的分数、学费与评价字段。</p><div id="professional-content" style="margin-top:14px"><div class="loading-inline">正在读取专业明细；首次打开需要多一点时间…</div></div></section><section class="detail-section"><button class="button" data-school="${g[0]}">看看这所学校的其他专业组 ↗</button></section>`;
    openDialog('detail-dialog');const token=++detailToken;fillProfessional(i,token);
  }
  function openSchool(si){
    const s=D.schools[si];if(!s)return;detailToken++;openedDetail={type:'school',i:si};const gs=D.schoolGroups[si].filter(i=>D.groups[i][1]===state.profile.track),lines=gs.map(i=>D.groups[i][G.s25]).filter(n=>n>0),url=safeURL(s.charter);
    $('#detail-kicker').textContent='认识一所学校';
    $('#detail-content').innerHTML=`<div class="detail-head"><span class="school-seal">${seal(s)}</span><h2 id="detail-title">${esc(s.n)}</h2><div class="detail-sub">${esc(s.prov)} · ${esc(s.city)} · ${esc(s.own)} · ${esc(s.typ)} · ${esc(s.lvl)}</div><div class="tag-row">${(s.tag||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="detail-actions">${url?`<a class="button primary" href="${esc(url)}" target="_blank" rel="noopener">查看招生章程 ↗</a>`:''}<button class="button" data-action="help">了解标签含义 ↗</button></div></div><section class="detail-section"><h3>在四川的招生轮廓 <span>${trackName(state.profile.track)} · 本页展示全部批次</span></h3><div class="detail-stats"><div class="detail-stat"><span>专业组数量</span><strong>${gs.length}</strong><small>当前科类，全部批次</small></div><div class="detail-stat"><span>2025 组线范围</span><strong style="font-size:20px">${lines.length?Math.min(...lines)+'–'+Math.max(...lines):'—'}</strong><small>分 · 不等于一条院校线</small></div><div class="detail-stat"><span>院校代码</span><strong>${esc(s.code)}</strong><small>${esc(s.lvl)}招生记录</small></div></div><p class="fine-print">专业组线分别对应不同批次、类型及专业组合，不能把最低一条线视为整所学校所有专业的门槛。</p></section><section class="detail-section"><h3>专业组，一组一组看</h3><div class="detail-groups">${gs.length?gs.map(i=>{const g=D.groups[i];return `<button class="detail-group-row" data-group="${i}"><span>${esc(groupLabel(g))} · ${esc(g[G.req]||'选科待补充')}<small>${esc(g[G.batch])}<br>${esc(majorNames(i,3))}</small></span><span>${badge(i)}<small>2025 ${valid(g[G.s25])} 分 ↗</small></span></button>`;}).join(''):'<p>本校在当前科类暂无收录记录。可以切换科类后再看看。</p>'}</div></section><section class="detail-section"><h3>标签的含义</h3>${(s.tag||[]).filter(t=>D.tags[t]).map(t=>`<details><summary>${esc(t)} · ${esc(D.tags[t].title)}</summary><p>${esc(D.tags[t].desc)}</p><p>${esc(D.tags[t].caution)}</p>${safeURL(D.tags[t].source)?`<a class="source-link" href="${esc(safeURL(D.tags[t].source))}" target="_blank" rel="noopener">查看标签来源 ↗</a>`:''}</details>`).join('')||'<p>暂无可展开的标签说明。</p>'}</section>`;
    openDialog('detail-dialog');
  }
  function openComparison(){
    if(state.compare.length<2){toast('再选择一个专业组，就可以并排对比。');return;}
    const ids=state.compare;
    const rows=[['科类 / 批次',i=>`${trackName(D.groups[i][1])}<small>${esc(D.groups[i][2])} / ${esc(D.groups[i][3])}</small>`],['选科要求',i=>subjectText(D.groups[i])],['2025 组线',i=>`<strong>${valid(D.groups[i][G.s25])}</strong> 分`],['2025 最低位次',i=>valid(D.groups[i][G.r25])],['与你的对照',i=>badge(i)],['2026 招生计划',i=>valid(D.groups[i][G.plan])+' 人'],['招生考试报学费',i=>esc(fee(D.groups[i]))],['组内专业',i=>esc(majorNames(i,12))+(D.links[i].length>12?' 等':'')],['继续了解',i=>`<button class="button" data-group="${i}">查看完整详情 ↗</button>`]];
    $('#compare-content').innerHTML=`<p class="fine-print" style="margin-bottom:17px">按同一套字段比较；科类不同的组不做分差判断。往年组线不代表专业录取线，缺失数据不作推断。</p><div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>对比维度</th>${ids.map(i=>{const g=D.groups[i],s=D.schools[g[0]];return `<th>${esc(s.n)}<small>${esc(groupLabel(g))} · ${esc(s.prov)} · ${esc(s.own)}</small></th>`;}).join('')}</tr></thead><tbody>${rows.map(([label,render])=>`<tr><th>${label}</th>${ids.map(i=>`<td>${render(i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    openDialog('compare-dialog');
  }
  function setStage(on){state.stage=on;document.body.classList.toggle('stage',on);$('#stage-dock').hidden=!on;$$('[data-action="stage"]').forEach(b=>b.setAttribute('aria-pressed',String(on)));storage.write('luodian.v2.stage',on);updateURL();if(on)toast('课堂演示已开启：更大的文字和触摸区域。');}
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('此浏览器暂不支持全屏；可继续使用放大的演示界面。');}catch{toast('浏览器未允许全屏，演示界面仍可正常使用。');}}
  function bind(){
    document.addEventListener('click',e=>{
      const b=e.target.closest('button,a');if(!b)return;
      if(b.matches('[data-close]')){closeDialog(b.closest('dialog'));return;}
      if(b.dataset.route){navigate(b.dataset.route);return;}
      if(b.dataset.track!==undefined){state.profile.track=Number(b.dataset.track);state.profile.demo=false;setupControls();refresh();persistProfile();return;}
      if(b.dataset.view){chooseView(b.dataset.view);return;}
      if(b.dataset.group!==undefined){openGroup(Number(b.dataset.group));return;}
      if(b.dataset.school!==undefined){openSchool(Number(b.dataset.school));return;}
      if(b.dataset.major!==undefined){chooseMajor(Number(b.dataset.major));return;}
      if(b.dataset.save!==undefined){saveToggle(Number(b.dataset.save));return;}
      if(b.dataset.compare!==undefined){compareToggle(Number(b.dataset.compare));return;}
      if(b.dataset.tier!==undefined){state.filters.tier=b.dataset.tier;refresh({land:false});return;}
      if(b.dataset.tierShortcut){state.filters.tier=b.dataset.tierShortcut;refresh({land:false});$('#explorer').scrollIntoView({behavior:'smooth'});return;}
      if(b.dataset.preset){preset(b.dataset.preset);return;}
      if(b.dataset.clearFilter){const k=b.dataset.clearFilter;state.filters[k]=defaults()[k];refresh();return;}
      if(b.dataset.subject){const s=b.dataset.subject,at=subjectDraft.indexOf(s);if(at>=0)subjectDraft.splice(at,1);else if(subjectDraft.length<2)subjectDraft.push(s);else{toast('再选科目选两门即可。');return;}renderSubjects();return;}
      if(b.dataset.move!==undefined){const n=Number(b.dataset.move),next=n+Number(b.dataset.dir);if(next>=0&&next<state.saved.length){[state.saved[n],state.saved[next]]=[state.saved[next],state.saved[n]];storage.write('luodian.v2.saved',state.saved);renderSaved();}return;}
      if(b.dataset.retryDetails!==undefined){$('#professional-content').innerHTML='<div class="loading-inline">正在重试读取专业明细…</div>';fillProfessional(Number(b.dataset.retryDetails),++detailToken);return;}
      switch(b.dataset.action){
        case 'help':openDialog('help-dialog');break;
        case 'stage':setStage(!state.stage);break;
        case 'fullscreen':fullscreen();break;
        case 'stage-position':navigate('explore');$('.position-panel').scrollIntoView({behavior:'smooth',block:'center'});$('#position-value').focus({preventScroll:true});break;
        case 'filters':openFilters();break;
        case 'subjects':openSubjects();break;
        case 'subject-clear':subjectDraft=[];renderSubjects();break;
        case 'subject-apply':if(subjectDraft.length===1){toast('请选择两门再选科目，或清除选科。');break;}state.profile.subjects=[...subjectDraft];state.filters.subjectOnly=subjectDraft.length===2&&$('#subject-only').checked;closeDialog($('#subject-dialog'));refresh();persistProfile();break;
        case 'mode':state.profile.mode=state.profile.mode==='score'?'rank':'score';state.profile.value=state.profile.mode==='rank'?(pos.rank??''):(pos.score??'');state.profile.demo=false;refresh();persistProfile();$('#position-value').focus();break;
        case 'minus':case 'plus':state.profile.value=Math.max(1,(Number(state.profile.value)||0)+(b.dataset.action==='plus'?1:-1));state.profile.demo=false;refresh();persistProfile();break;
        case 'search-clear':state.filters.q='';$('#search').value='';refresh();$('#search').focus();break;
        case 'filter-reset':resetFilters();openFilters();break;
        case 'filter-reset-inline':resetFilters();break;
        case 'empty-reset':resetFilters();break;
        case 'more':state.limit+=state.pageSize;renderResults(true);syncCompare();break;
        case 'compare-clear':state.compare=[];syncCompare();break;
        case 'compare-open':openComparison();break;
        case 'export':exportSaved();break;
      }
    });
    $('#position-value').addEventListener('input',e=>{state.profile.value=e.target.value;state.profile.demo=false;scheduleProfile();});
    $('#position-value').addEventListener('change',()=>{clearTimeout(refreshTimer);refresh();persistProfile();});
    $('#score-range').addEventListener('input',e=>{state.profile.value=Number(e.target.value);state.profile.demo=false;$('#position-value').value=e.target.value;scheduleProfile();});
    $('#score-range').addEventListener('change',()=>{clearTimeout(refreshTimer);refresh();persistProfile();});
    $('#search').addEventListener('input',e=>{clearTimeout(searchTimer);state.filters.q=e.target.value;searchTimer=setTimeout(()=>refresh(),160);});
    for(const [id,key] of [['quick-province','province'],['quick-batch','batch'],['quick-category','category'],['sort','sort']])$('#'+id).addEventListener('change',e=>{state.filters[key]=e.target.value;refresh();});
    $('#filter-form').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target);for(const k of ['province','region','batch','category','own','level','type','tag','fee','tier'])state.filters[k]=String(fd.get(k)||'');state.filters.line=fd.has('line');state.filters.subjectOnly=state.profile.subjects.length===2&&fd.has('subjectOnly');closeDialog($('#filter-dialog'));refresh();});
    $$('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d);}});d.addEventListener('cancel',()=>{detailToken++;});});
    document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)&&!$('dialog[open]')){e.preventDefault();if(state.route!=='explore')navigate('explore');$('#search').focus();$('#search').scrollIntoView({behavior:'smooth',block:'center'});}});
    window.addEventListener('hashchange',()=>navigate(location.hash==='#saved'?'saved':'explore'));
    window.addEventListener('storage',e=>{if(e.key==='luodian.v2.saved'){state.saved=normalizeSaved(storage.read('luodian.v2.saved',[]));syncSavedButtons();if(state.route==='saved')renderSaved();}});
  }
  function normalizeSaved(values){return Array.isArray(values)?[...new Set(values)].filter(k=>typeof k==='string'&&D.byKey.has(k)):[];}
  function restore(){
    const stored=storage.read('luodian.v2.profile',null);
    if(stored&&[0,1].includes(stored.track)&&['score','rank'].includes(stored.mode)){state.profile={track:stored.track,mode:stored.mode,value:['string','number'].includes(typeof stored.value)?stored.value:'',subjects:Array.isArray(stored.subjects)?[...new Set(stored.subjects)].filter(s=>['化学','生物','政治','地理'].includes(s)).slice(0,2):[],demo:stored.demo===true};}
    state.saved=normalizeSaved(storage.read('luodian.v2.saved',[]));
    const p=new URLSearchParams(location.search);if(p.has('track')&&['0','1'].includes(p.get('track')))state.profile.track=Number(p.get('track'));
    for(const mode of ['score','rank'])if(p.has(mode)){state.profile.mode=mode;state.profile.value=p.get(mode);state.profile.demo=p.get('demo')==='1';}
    if(p.has('subjects'))state.profile.subjects=[...new Set(p.get('subjects').split(','))].filter(s=>['化学','生物','政治','地理'].includes(s)).slice(0,2);
    for(const k of ['q','province','region','category','major','own','level','type','tag','fee','batch'])if(p.has(k))state.filters[k]=p.get(k);
    for(const [key,dictKey] of [['major','major'],['category','cat']])if(state.filters[key]!==''&&(!/^\d+$/.test(state.filters[key])||!D.dicts[dictKey][Number(state.filters[key])]))state.filters[key]='';
    if(C.bands[p.get('tier')])state.filters.tier=p.get('tier');if(['close','score','fee','plan'].includes(p.get('sort')))state.filters.sort=p.get('sort');
    state.filters.subjectOnly=p.get('subjectOnly')==='1'&&state.profile.subjects.length===2;state.filters.line=p.get('line')==='1';
    state.view=['groups','schools','majors'].includes(p.get('view'))?p.get('view'):'groups';state.route=location.hash==='#saved'?'saved':'explore';
    state.stage=p.has('stage')?p.get('stage')==='1':storage.read('luodian.v2.stage',false)===true;if(p.get('noanim')==='1')document.body.classList.add('noanim');
  }
  async function init(){
    const direct=new URLSearchParams(location.search);
    try{
      const response=await fetch('./catalog.json',{cache:'no-cache'});if(!response.ok)throw Error('检索目录未能加载（'+response.status+'）');
      D=C.prepare(await response.json());restore();setupControls();bind();refresh();syncSavedButtons();$$('[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view===state.view)));if(state.stage)setStage(true);if(state.route==='saved')navigate('saved');
      if(direct.has('group')){const key=direct.get('group'),i=D.byKey.get(key)??(/^\d+$/.test(key)?Number(key):undefined);if(i!==undefined&&D.groups[i])openGroup(i);}
      console.info('[LUODIAN_V2_READY]',D.groups.length,D.schools.length);
    }catch(e){console.error(e);$('#results').setAttribute('aria-busy','false');$('#results').innerHTML=`<div class="empty-state"><h3>数据正在路上。</h3><p>${esc(e.message)}。请检查网络后刷新；也可以先打开第一代。</p><a class="button primary" href="./">重新加载 ↗</a> <a class="button" href="../">打开第一代</a></div>`;$('#results-count').textContent='暂时无法加载';$('#position-note').textContent='数据尚未就绪';$('#land-nodes').innerHTML='';$('#data-count').textContent='数据加载未完成';}
  }
  init();
})();
