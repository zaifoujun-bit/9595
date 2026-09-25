let sqlReady;
async function sqlEngine(){
  if(!sqlReady) sqlReady=initSqlJs({locateFile:name=>new URL(`vendor/${name}`,location.href).href}).catch(e=>{sqlReady=null;throw e});
  return sqlReady;
}
function downloadProgress(bytes,name,type){
  const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportDatabase(){
  const store=await localReady,backup=await store.backup(),SQL=await sqlEngine(),db=new SQL.Database();
  try{
    db.run(`CREATE TABLE ProgressMeta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE WordProgress(word_id INTEGER PRIMARY KEY,status TEXT,review_count INTEGER,last_review_at TEXT,next_review_at TEXT,interval_days INTEGER,ease_factor REAL);
      CREATE TABLE Reviews(id INTEGER PRIMARY KEY,word_id INTEGER,reviewed_at TEXT,rating INTEGER,previous_status TEXT,new_status TEXT,previous_interval INTEGER,new_interval INTEGER,next_review_at TEXT);`);
    db.run('INSERT INTO ProgressMeta VALUES (?,?),(?,?)',['schema_version','1','source_signature',backup.source_signature]);
    for(const p of backup.progress)db.run('INSERT INTO WordProgress VALUES (?,?,?,?,?,?,?)',[p.word_id,p.status,p.review_count,p.last_review_at,p.next_review_at,p.interval_days,p.ease_factor]);
    for(const r of backup.reviews)db.run('INSERT INTO Reviews VALUES (?,?,?,?,?,?,?,?,?)',[r.id,r.word_id,r.reviewed_at,r.rating,r.previous_status,r.new_status,r.previous_interval,r.new_interval,r.next_review_at]);
    downloadProgress(db.export(),`wordboat-progress-${WordboatStore.dateKey()}.db`,'application/x-sqlite3');
  }finally{db.close()}
}
async function readProgressFile(file){
  if(!file.size||file.size>20*1024*1024)throw Error('请选择不超过 20MB 的进度文件');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(new TextDecoder().decode(bytes.slice(0,16))!=='SQLite format 3\0')return JSON.parse(new TextDecoder().decode(bytes));
  const SQL=await sqlEngine(),db=new SQL.Database(bytes);
  try{
    const rows=sql=>{const statement=db.prepare(sql),result=[];try{while(statement.step())result.push(statement.getAsObject());return result}finally{statement.free()}};
    if(rows('PRAGMA integrity_check')[0]?.integrity_check!=='ok')throw Error('文件已损坏');
    const meta=Object.fromEntries(rows('SELECT key,value FROM ProgressMeta').map(r=>[r.key,r.value]));
    if(meta.schema_version!=='1')throw Error('进度版本不兼容');
    return {format:'wordboat-progress',version:1,source_signature:meta.source_signature,progress:rows('SELECT * FROM WordProgress'),reviews:rows('SELECT * FROM Reviews')};
  }finally{db.close()}
}
async function progressManager(){
  navActive('progress');loading();const p=await api('/api/progress');
  app.innerHTML=`<div class="page-head"><div><h1 class="page-title">我的学习进度</h1><p class="page-subtitle">保存在当前浏览器；无需账号。换设备时请导出、导入进度。</p></div></div>
    <div class="progress-stats"><div><span>已学习</span><b>${p.learned_words}</b><small>/ ${p.total_words} 词</small></div><div><span>累计作答</span><b>${p.review_count}</b><small>次记录</small></div><div><span>今天到期</span><b>${p.due_words}</b><small>个单词</small></div></div>
    <div class="manage-grid"><article class="manage-card"><h2>导出进度</h2><p>下载备份文件，可在电脑本地版、Termux 和网页版之间转移。</p><button class="primary" id="exportProgress">导出 .db 进度文件</button><button class="text-button" id="exportJson">导出 JSON 备份</button></article>
    <article class="manage-card"><h2>导入进度</h2><p>支持原来的 .db 文件和网页版 JSON 备份。导入将替换当前进度。</p><button class="secondary" id="importProgress">选择进度文件</button><input hidden type="file" id="progressFile" accept=".db,.json,application/json,application/x-sqlite3"></article>
    <article class="manage-card danger-card"><h2>清空进度</h2><p>只清空此浏览器中的学习记录，考纲词库和词册会保留。</p><button class="danger-button" id="clearProgress">清空当前进度</button></article></div>
    <div class="progress-note">请定期导出备份。清除网站数据、无痕模式或更换网站地址可能导致进度不可用。不同设备不会自动同步。网站发布新册不会清除你的进度。<br><button class="text-button" id="persistStorage">尽量保留本机数据</button></div>`;
  const action=(selector,fn)=>document.querySelector(selector).onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await fn()}catch(e){alert(e.message)}finally{button.disabled=false}};
  action('#exportProgress',exportDatabase);
  action('#exportJson',async()=>downloadProgress(JSON.stringify(await (await localReady).backup(),null,2),`wordboat-progress-${WordboatStore.dateKey()}.json`,'application/json'));
  const input=document.querySelector('#progressFile');document.querySelector('#importProgress').onclick=()=>input.click();
  input.onchange=async()=>{const file=input.files[0];if(!file)return;try{const data=await readProgressFile(file),store=await localReady;WordboatStore.validateBackup(data,store.content);if(!confirm('导入将替换本机当前进度，建议先导出备份。继续吗？'))return;await store.import(data);toast('进度已导入');await progressManager()}catch(e){alert(`导入失败：${e.message}`)}finally{input.value=''}};
  action('#clearProgress',async()=>{if(!confirm('清空此浏览器的所有学习记录？建议先导出备份。'))return;await (await localReady).clear();toast('已清空进度');await progressManager()});
  action('#persistStorage',async()=>{const granted=await navigator.storage?.persist?.();alert(granted?'浏览器已允许持久保存，仍建议定期备份。':'浏览器未授予持久存储，请继续定期导出备份。')});
}
