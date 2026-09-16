const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('../v2/core.js');
const data=C.prepare(JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../v2/catalog.json'),'utf8')));
const base={q:'',batch:'本科批B段',province:'',region:'',category:'',major:'',own:'',level:'',type:'',tag:'',fee:'',tier:'',line:false,subjectOnly:false,sort:'close'};
const profile={track:0,subjects:[],rank:69422};
test('full source data has stable, unique group identifiers and intact relationships',()=>{
 assert.equal(data.groups.length,12275);assert.equal(data.byKey.size,12275);assert.equal(data.schools.length,2308);
 data.groups.forEach((g,i)=>{assert.ok(data.schools[g[0]]);assert.ok(data.links[i].length);data.links[i].forEach(l=>assert.ok(data.dicts.major[l[0]]));});
});
test('known Sichuan 550 physics input is converted using 2026, then compared using 2025',()=>{
 const p=C.position(data,0,'score',550);assert.equal(p.rank,69422);assert.equal(p.equivalent.score,546);assert.equal(p.lo,68280);
});
test('invalid and uncovered scores never silently become a plausible rank',()=>{
 for(const v of ['',0,-1,550.5,999,'no'])assert.equal(C.position(data,0,'score',v).rank,null);
 assert.equal(C.position(data,0,'rank',99999999).rank,null);
 assert.equal(C.position(data,0,'rank',1).edge,true);
});
test('unknown requirements are not unrestricted and two subjects are required for matching',()=>{
 assert.equal(C.subjectStatus('', ['化学','生物']),'unknown');assert.equal(C.subjectStatus('化学和生物',['化学','地理']),'mismatch');
 assert.equal(C.subjectStatus('化学和生物',['化学','生物']),'ok');assert.equal(C.subjectStatus('不限',[]),'ok');assert.equal(C.subjectStatus('化学',[]),'unset');
});
test('compound filter never leaks another track, batch, province, or ownership',()=>{
 const ids=C.query(data,{...base,province:'四川',own:'公办',subjectOnly:true},{...profile,subjects:['化学','生物']});assert.ok(ids.length>0);
 for(const i of ids){const g=data.groups[i],s=data.schools[g[0]];assert.equal(g[1],0);assert.equal(g[2],'本科批B段');assert.equal(s.prov,'四川');assert.equal(s.own,'公办');assert.equal(C.subjectStatus(g[15],['化学','生物']),'ok');}
});
test('a major and category must occur in the same offering',()=>{
 const d={groups:[[0,0,'本科批B段','普通类','101',0,0,1,50,600]],schools:[{n:'测试',prov:'四川'}],links:[[[0,0,0],[1,1,1]]],search:['测试']};
 assert.equal(C.query(d,{...base,major:0,category:1},profile).length,0);assert.equal(C.query(d,{...base,major:0,category:0},profile).length,1);
});
test('missing historical lines have an explicit unknown band, never an admission prediction',()=>{
 assert.equal(C.tier(1000,-1),'none');assert.equal(C.tier(null,1000),'none');assert.equal(C.tier(1000,1000),'wen');
 const ids=C.query(data,{...base,tier:'none'},profile);assert.ok(ids.length);ids.forEach(i=>assert.ok(data.groups[i][8]<=0));
});
test('fee ceiling excludes missing or over-budget group maxima',()=>{
 const ids=C.query(data,{...base,fee:5000},profile);assert.ok(ids.length);ids.forEach(i=>assert.ok(data.groups[i][17]>0&&data.groups[i][17]<=5000));
});
test('major lookup and history track query both return linked, real offerings',()=>{
 const major=data.dicts.major.indexOf('汉语言文学');const ids=C.query(data,{...base,major},{...profile,track:1});assert.ok(ids.length);
 ids.forEach(i=>{assert.equal(data.groups[i][1],1);assert.ok(data.links[i].some(l=>l[0]===major));});
});
test('histogram selection uses inclusive lower and exclusive upper score bounds',()=>{
 const ids=C.query(data,{...base,scoreFrom:'540',scoreTo:'550'},profile);
 assert.ok(ids.length);ids.forEach(i=>assert.ok(data.groups[i][9]>=540&&data.groups[i][9]<550));
 const all=C.query(data,base,profile);
 assert.deepEqual(new Set(ids),new Set(all.filter(i=>data.groups[i][9]>=540&&data.groups[i][9]<550)));
});
