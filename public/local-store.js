/* Personal data lives in IndexedDB; content updates never recreate this store. */
(function (global) {
  'use strict';
  const labels = {new:'新词',learning:'正在学习',review:'待复习',mastered:'已掌握'};
  const dateKey = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const empty = () => ({progress:[],reviews:[]});
  // Match Python's round-to-even, used by the original review scheduler.
  const round = n => n % 1 === 0.5 ? (Math.floor(n)%2 ? Math.ceil(n) : Math.floor(n)) : Math.round(n);
  function schedule(old, rating, now=new Date()) {
    if(!Number.isInteger(rating)||rating<0||rating>3) throw Error('无效的记忆评分');
    const count=old?.review_count||0, previous=old?.interval_days||0;
    let ease=old?.ease_factor||2.5, interval, status;
    if(rating===0){interval=1;status='learning';ease=Math.max(1.3,ease-0.2)}
    else if(rating===1){interval=Math.max(1,round(Math.max(1,previous)*1.2));status='learning';ease=Math.max(1.3,ease-0.15)}
    else if(rating===2){interval=count===0?1:count===1?3:Math.max(4,round(previous*ease));status=interval<30?'review':'mastered'}
    else{interval=count===0?4:Math.max(7,round(Math.max(1,previous)*(ease+0.35)));status=interval>=30||count>=3?'mastered':'review';ease=Math.min(3,ease+0.1)}
    const next=new Date(now);next.setDate(next.getDate()+interval);
    return {status,review_count:count+1,last_review_at:now.toISOString(),next_review_at:dateKey(next),interval_days:interval,ease_factor:ease};
  }
  function validateBackup(data, content) {
    if(data?.format!=='wordboat-progress'||data.version!==1||data.source_signature!==content.source_signature) throw Error('进度文件版本或考纲不匹配');
    if(!Array.isArray(data.progress)||!Array.isArray(data.reviews)) throw Error('进度文件格式错误');
    const validIds=new Set(content.words.map(w=>w.id)), seen=new Set(), counts=new Map();
    const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
    const timestamp=s=>typeof s==='string'&&s.length<=40&&!Number.isNaN(Date.parse(s));
    for(const p of data.progress){
      if(!validIds.has(p.word_id)) throw Error('进度包含当前尚未发布的单词，请更新词库后再导入');
      if(seen.has(p.word_id)||!['learning','review','mastered'].includes(p.status)||!Number.isSafeInteger(p.review_count)||p.review_count<1||!Number.isSafeInteger(p.interval_days)||p.interval_days<0||p.interval_days>365000||!Number.isFinite(p.ease_factor)||p.ease_factor<1.3||p.ease_factor>3||!timestamp(p.last_review_at)||!day(p.next_review_at)) throw Error('单词进度数据无效');
      seen.add(p.word_id);
    }
    const reviewIds=new Set();
    for(const r of data.reviews){
      if(!seen.has(r.word_id)||!Number.isSafeInteger(r.id)||r.id<1||reviewIds.has(r.id)||!Number.isInteger(r.rating)||r.rating<0||r.rating>3||!timestamp(r.reviewed_at)||!day(r.next_review_at)||!Object.hasOwn(labels,r.previous_status)||!['learning','review','mastered'].includes(r.new_status)||![r.previous_interval,r.new_interval].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=365000)) throw Error('复习记录无效');
      reviewIds.add(r.id);counts.set(r.word_id,(counts.get(r.word_id)||0)+1);
    }
    for(const p of data.progress) if(counts.get(p.word_id)!==p.review_count) throw Error('复习次数与记录不一致');
    return {progress:structuredClone(data.progress),reviews:structuredClone(data.reviews)};
  }
  function openDatabase(name) {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(name,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
      request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)};
      request.onerror=()=>reject(Error('浏览器无法保存进度，请使用普通浏览模式并允许网站存储'));
      request.onblocked=()=>reject(Error('请关闭其他词舟页面后重试'));
    });
  }
  class LocalStore {
    constructor(content,db){this.content=content;this.db=db;this.key=content.source_signature}
    static async create(content,name='wordboat-personal-v1'){return new LocalStore(content,await openDatabase(name))}
    transaction(write,change){
      return new Promise((resolve,reject)=>{
        const tx=this.db.transaction('snapshots',write?'readwrite':'readonly'),store=tx.objectStore('snapshots');
        let result,failure;
        const req=store.get(this.key);
        req.onsuccess=()=>{
          try{const snapshot=req.result||empty();result=change(snapshot);if(write)store.put(snapshot,this.key)}
          catch(e){failure=e;tx.abort()}
        };
        tx.oncomplete=()=>resolve(result);
        tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('进度保存失败，请检查存储空间'));
      });
    }
    snapshot(){return this.transaction(false,s=>s)}
    async backup(){const s=await this.snapshot();return {format:'wordboat-progress',version:1,source_signature:this.key,exported_at:new Date().toISOString(),...s}}
    async import(data){const clean=validateBackup(data,this.content);return this.transaction(true,s=>{Object.assign(s,clean);return {learned_words:s.progress.length,review_count:s.reviews.length}})}
    async clear(){return this.transaction(true,s=>{const result={cleared_words:s.progress.length,cleared_reviews:s.reviews.length};Object.assign(s,empty());return result})}
    decorate(word,s){const p=s.progress.find(x=>x.word_id===word.id);const result={...word,status:'new',review_count:0,last_review_at:null,next_review_at:null,interval_days:0,ease_factor:2.5,...p};result.status_label=labels[result.status];return result}
    async rate(id,rating){
      const word=this.content.words.find(w=>w.id===id);if(!word)throw Error('单词不存在');
      return this.transaction(true,s=>{
        const old=s.progress.find(p=>p.word_id===id),p={word_id:id,...schedule(old,rating)};
        s.progress=s.progress.filter(x=>x.word_id!==id);s.progress.push(p);
        s.reviews.push({id:s.reviews.reduce((n,r)=>Math.max(n,r.id),0)+1,word_id:id,reviewed_at:p.last_review_at,rating,previous_status:old?.status||'new',new_status:p.status,previous_interval:old?.interval_days||0,new_interval:p.interval_days,next_review_at:p.next_review_at});
        return this.decorate(word,s);
      });
    }
    async request(path,options={}){
      const url=new URL(path,'https://local.invalid'),parts=url.pathname.split('/').filter(Boolean),body=options.body?JSON.parse(options.body):{};
      if(options.method==='POST'){
        if(path==='/api/reviews')return this.rate(body.word_id,body.rating);
        if(path==='/api/progress/clear'&&body.confirm==='CLEAR')return this.clear();
        throw Error('不支持的操作');
      }
      const s=await this.snapshot(),words=this.content.words.map(w=>this.decorate(w,s)),today=dateKey();
      const due=items=>items.filter(w=>w.next_review_at&&w.next_review_at<=today).sort((a,b)=>a.next_review_at.localeCompare(b.next_review_at)||a.id-b.id);
      const volumes=this.content.volumes.map(v=>{const list=words.filter(w=>w.volume_id===v.id),learned=list.filter(w=>w.review_count>0).length;return {...v,total_words:list.length,learned_words:learned,remaining_words:list.length-learned,due_words:due(list).length,next_review_date:list.map(w=>w.next_review_at).filter(d=>d&&d>today).sort()[0]||null}});
      if(parts[1]==='volumes'){
        if(!parts[2])return volumes;
        const id=Number(parts[2]),v=volumes.find(v=>v.id===id);if(!v)throw Error('词册不存在');
        if(parts[3]==='words')return words.filter(w=>w.volume_id===id&&(!url.searchParams.has('pending')||w.review_count===0));
        if(parts[3]==='review')return due(words.filter(w=>w.volume_id===id));
        return v;
      }
      if(parts[1]==='words')return parts[2]?words.find(w=>w.id===Number(parts[2])):words;
      if(parts[1]==='roots'){
        const roots=this.content.roots.map(r=>({...r,words:words.filter(w=>w.roots.some(root=>root.id===r.id))})).map(r=>({...r,word_count:r.words.length}));
        return parts[2]?roots.find(r=>r.id===Number(parts[2])):roots;
      }
      if(parts[1]==='review')return due(words);
      if(parts[1]==='progress')return {total_words:words.length,learned_words:s.progress.length,review_count:s.reviews.length,due_words:due(words).length,last_activity:s.reviews.map(r=>r.reviewed_at).sort().at(-1)||null,progress_file:'此浏览器的本地存储'};
      throw Error('未知页面');
    }
  }
  global.WordboatStore={LocalStore,schedule,validateBackup,dateKey};
})(globalThis);
