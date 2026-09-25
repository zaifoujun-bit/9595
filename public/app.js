const app = document.querySelector('#app');
const state = {
  volumes: [], volume: null, words: [], pending: [], learned: [], review: [],
  index: 0, reveal: 0, mode: 'study'
};

let installPrompt = null;
const installButton = document.querySelector('#installApp');

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if(!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.hidden = true;
  toast('词舟已安装到桌面');
});

const localReady = fetch('./content.json').then(async response => {
  if(!response.ok) throw Error('词库下载失败，请联网后刷新');
  return WordboatStore.LocalStore.create(await response.json());
});
async function api(path, options={}) {return (await localReady).request(path,options)}
if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'});
      const showUpdate=()=>{
        if(!registration.waiting||document.querySelector('#updateApp'))return;
        const button=document.createElement('button');button.id='updateApp';button.className='install-button';button.textContent='更新词舟';
        button.onclick=()=>{if(confirm('已准备好新版程序或词册。刷新将回到当前页面，已保存的进度会保留。继续吗？')){navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});registration.waiting.postMessage('ACTIVATE_UPDATE')}};
        document.querySelector('.top-actions').appendChild(button);
      };
      showUpdate();registration.addEventListener('updatefound',()=>{const installing=registration.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='installed')showUpdate()})});
    }catch(e){console.warn('离线缓存未就绪',e)}
  });
}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1900)}
function loading(){app.innerHTML='<div class="loading">正在整理词册…</div>'}
function route(path){location.hash=path==='volumes'?'':path}
function navActive(name){document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===name))}
function pct(done,total){return total?Math.round(done/total*100):0}

function bindRoutes(){document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>route(b.dataset.route))}
function bindVolumeLinks(){document.querySelectorAll('[data-volume]').forEach(b=>b.onclick=()=>route(`volume/${b.dataset.volume}`));document.querySelectorAll('[data-volume-route]').forEach(b=>{const [id,section]=b.dataset.volumeRoute.split(':');b.onclick=()=>route(`volume/${id}/${section}`)})}
function bindWordLinks(){document.querySelectorAll('[data-word]').forEach(b=>b.onclick=()=>showWord(+b.dataset.word))}
function bindRootLinks(){document.querySelectorAll('[data-root-id]').forEach(b=>b.onclick=()=>showRoot(+b.dataset.rootId))}

async function volumesPage(){
  navActive('volumes');loading();state.volumes=await api('/api/volumes');
  const total=state.volumes.reduce((n,v)=>n+v.total_words,0);
  app.innerHTML=`<div class="page-head"><div><div class="eyebrow dark">MY SYLLABUS VOLUMES</div><h1 class="page-title">选择一册开始学习</h1><p class="page-subtitle">每册 100 个考纲词。按自己的节奏学习，已学单词可以随时回看。</p></div></div>
    <div class="volume-summary"><span>已建 <b>${state.volumes.length}</b> 册</span><span>已录入 <b>${total}</b> 词</span><span>学习节奏不再绑定日期</span></div>
    <div class="volume-grid">${state.volumes.map(volumeCard).join('')}</div>`;
  bindVolumeLinks();
}
function volumeCard(v){const progress=pct(v.learned_words,v.total_words);return `<button class="volume-card" data-volume="${v.id}"><div class="volume-number">VOL. ${String(v.sequence_number).padStart(2,'0')}</div><h2>${esc(v.title)}</h2><p>${v.total_words} 个考纲词 · 已学 ${v.learned_words}</p><div class="volume-progress"><i style="width:${progress}%"></i></div><div class="volume-foot"><span>${progress}%</span><span>${v.due_words?`${v.due_words} 个到期复习`:'进入本册 →'}</span></div></button>`}

function volumeNav(v,active){return `<div class="volume-top"><button class="back-link" data-route="volumes">← 返回选册</button><div><div class="volume-number">VOL. ${String(v.sequence_number).padStart(2,'0')}</div><h1 class="page-title">${esc(v.title)}</h1></div></div><nav class="volume-nav"><button class="${active==='home'?'active':''}" data-volume-route="${v.id}:home">本册首页</button><button class="${active==='progress'?'active':''}" data-volume-route="${v.id}:progress">学习进度</button><button class="${active==='review'?'active':''}" data-volume-route="${v.id}:review">本册复习${v.due_words?` · ${v.due_words}`:''}</button><button class="${active==='words'?'active':''}" data-volume-route="${v.id}:words">本册词库</button></nav>`}
async function loadVolume(id){state.volume=await api(`/api/volumes/${id}`);return state.volume}
async function volumeHome(id){
  navActive('volumes');loading();const v=await loadVolume(id);const progress=pct(v.learned_words,v.total_words);
  app.innerHTML=`${volumeNav(v,'home')}<section class="volume-hero"><div><div class="eyebrow">CURRENT VOLUME</div><h2>${v.remaining_words?`继续完成这 ${v.remaining_words} 个词`:'这一册的新词已学完'}</h2><p>本册记录独立保存。查看和学习不受日期限制，复习仍按记忆情况到期。</p><button class="primary" data-volume-route="${v.id}:progress">查看学习进度 →</button></div><div class="ring" style="--p:${progress*3.6}deg"><span><b>${progress}%</b>已完成</span></div></section>
    <div class="action-grid volume-actions"><button class="action-card" data-volume-route="${v.id}:progress"><div class="action-icon">01 —</div><h3>学习进度</h3><p>已学 ${v.learned_words} · 剩余 ${v.remaining_words}，从这里继续学新词</p></button><button class="action-card" data-volume-route="${v.id}:review"><div class="action-icon">02 ↻</div><h3>本册复习</h3><p>${v.due_words?`现在有 ${v.due_words} 个词到期`:(v.next_review_date?`下一次到期：${v.next_review_date}`:'学习后自动安排')}</p></button><button class="action-card" data-volume-route="${v.id}:words"><div class="action-icon">03 ▤</div><h3>本册词库</h3><p>随时点开本册任意单词查看，不改变复习记录</p></button></div>`;
  bindRoutes();bindVolumeLinks();
}

function compactWord(w,label='查看'){return `<button class="learned-word" data-word="${w.id}"><strong>${esc(w.word)}</strong><span>${esc(w.chinese)}</span><i>${label} ›</i></button>`}
async function volumeProgress(id){
  navActive('volumes');loading();const v=await loadVolume(id);const words=await api(`/api/volumes/${id}/words`);const learned=words.filter(w=>w.review_count>0).reverse(),pending=words.filter(w=>w.review_count===0);
  app.innerHTML=`${volumeNav(v,'progress')}<section class="progress-hero"><div><div class="eyebrow dark">LEARNING PROGRESS</div><h2>${v.learned_words} / ${v.total_words}</h2><p>${v.remaining_words?`还有 ${v.remaining_words} 个新词等待学习。已学词可以随时点开回看。`:'本册新词已全部完成，接下来按计划复习。'}</p></div><div><div class="progress big"><i style="width:${pct(v.learned_words,v.total_words)}%"></i></div>${pending.length?`<button class="primary" data-volume-route="${v.id}:study">继续学习剩余 ${pending.length} 词 →</button>`:''}</div></section>
    <section class="section"><div class="section-head"><div><h2>已学习</h2><p>点击查看不会增加复习次数</p></div></div>${learned.length?`<div class="learned-grid standalone">${learned.map(w=>compactWord(w)).join('')}</div>`:'<div class="empty small"><b>还没有已学单词</b>点击上方按钮开始本册学习。</div>'}</section>
    <section class="section"><div class="section-head"><div><h2>尚未学习</h2><p>${pending.length} 个</p></div></div>${pending.length?`<div class="pending-cloud">${pending.map(w=>`<span>${esc(w.word)}</span>`).join('')}</div>`:'<div class="empty small"><b>全部完成</b>这一册没有未学习的新词了。</div>'}</section>`;
  bindRoutes();bindVolumeLinks();bindWordLinks();
}

function rootChips(word){return word.roots?.length?`<div class="root-chips">${word.roots.map(r=>`<button class="root-chip" data-root-id="${r.id}">${esc(r.root)} · ${esc(r.meaning)}</button>`).join('')}</div>`:'<p class="page-subtitle">这个词暂未匹配到有助记价值的常见词根或词缀。</p>'}
function learnedPanel(){if(state.mode!=='study'||!state.learned.length)return '';return `<details class="learned-panel" open><summary><span>本册已学 <b>${state.learned.length}</b></span><small>可随时点开回看，不计入复习次数</small></summary><div class="learned-grid">${state.learned.map(w=>compactWord(w)).join('')}</div></details>`}
function renderStudy(){
  const list=state.mode==='review'?state.review:state.pending,v=state.volume;
  if(!list.length){const title=state.mode==='review'?'本册今天没有到期复习':'本册新词已学完';const note=state.mode==='review'?(v.next_review_date?`下一次到期是 ${v.next_review_date}。`:'完成学习后会自动安排。'):'学习记录已保存，可以在下方随时回看。';app.innerHTML=`${volumeNav(v,state.mode==='review'?'review':'progress')}<div class="study-wrap"><div class="empty"><b>${title}</b>${note}</div>${learnedPanel()}</div>`;bindRoutes();bindVolumeLinks();bindWordLinks();return}
  state.index=Math.min(state.index,list.length-1);const w=list[state.index],step=state.reveal;const current=state.mode==='study'?state.learned.length+1:state.index+1;const total=state.mode==='study'?v.total_words:list.length;
  app.innerHTML=`${volumeNav(v,state.mode==='review'?'review':'progress')}<div class="study-wrap"><div class="study-meta"><span>${state.mode==='study'?'本册学习':'本册到期复习'} · ${current} / ${total}</span><span>${esc(w.status_label)}</span></div><div class="progress"><i style="width:${current/total*100}%"></i></div><article class="flashcard"><div class="word-kicker">${esc(v.title)} · 考纲 p.${w.source_page}</div><h2 class="big-word">${esc(w.word)}</h2>${step>=1?`<section class="reveal-block"><div class="reveal-label">中文释义</div><p class="meaning">${esc(w.chinese)}</p></section>`:''}${step>=2?`<section class="reveal-block"><div class="reveal-label">词根与词缀</div>${rootChips(w)}</section>`:''}${step>=3?`<section class="reveal-block"><div class="reveal-label">考纲原文讲解</div><p class="detail">${esc(w.details)}</p></section>`:''}</article><div class="study-actions">${step<3?`<button class="primary" id="reveal">${['查看释义','查看词根','查看考纲讲解'][step]} →</button>`:`<div class="rating"><button data-rate="0">忘记<br><small>1 天</small></button><button data-rate="1">困难<br><small>短间隔</small></button><button data-rate="2">记得<br><small>正常</small></button><button data-rate="3">轻松<br><small>长间隔</small></button></div>`}</div>${learnedPanel()}</div>`;
  document.querySelector('#reveal')?.addEventListener('click',()=>{state.reveal++;renderStudy()});document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=()=>rateWord(w,+b.dataset.rate));bindRoutes();bindVolumeLinks();bindWordLinks();bindRootLinks();
}
async function volumeStudy(id){navActive('volumes');loading();state.mode='study';const v=await loadVolume(id);const all=await api(`/api/volumes/${id}/words`);state.words=all;state.learned=all.filter(w=>w.review_count>0).reverse();state.pending=all.filter(w=>w.review_count===0);state.index=0;state.reveal=0;renderStudy()}
async function volumeReview(id){navActive('volumes');loading();state.mode='review';await loadVolume(id);state.review=await api(`/api/volumes/${id}/review`);state.index=0;state.reveal=0;renderStudy()}
let ratingBusy=false;
async function rateWord(word,rating){if(ratingBusy)return;ratingBusy=true;document.querySelectorAll('[data-rate]').forEach(b=>b.disabled=true);try{const updated=await api('/api/reviews',{method:'POST',body:JSON.stringify({word_id:word.id,rating})});const list=state.mode==='review'?state.review:state.pending;const idx=list.findIndex(x=>x.id===word.id);if(idx>=0)list.splice(idx,1);if(state.mode==='study'){state.learned=state.learned.filter(x=>x.id!==updated.id);state.learned.unshift(updated);state.volume.learned_words++;state.volume.remaining_words--}toast(`已保存；下次复习：${updated.next_review_at}`);state.index=Math.min(state.index,Math.max(0,list.length-1));state.reveal=0;renderStudy()}catch(e){alert('保存失败：'+e.message)}finally{ratingBusy=false;document.querySelectorAll('[data-rate]').forEach(b=>b.disabled=false)}}

function wordRow(w){return `<button class="word-row" data-word="${w.id}"><div><h3>${esc(w.word)}</h3><p>${esc(w.chinese)}</p></div><span class="badge ${w.status}">${esc(w.status_label)}</span></button>`}
function searchableWordList(words){return `<div class="toolbar"><input class="search" id="search" placeholder="搜索单词或中文释义"><select class="filter" id="filter"><option value="">全部状态</option><option value="new">新词</option><option value="learning">正在学习</option><option value="review">待复习</option><option value="mastered">已掌握</option></select></div><div class="word-list" id="wordList">${words.map(wordRow).join('')}</div>`}
function enableWordSearch(words){const redraw=()=>{const q=document.querySelector('#search').value.toLowerCase(),s=document.querySelector('#filter').value;document.querySelector('#wordList').innerHTML=words.filter(w=>(!q||w.word.toLowerCase().includes(q)||w.chinese.includes(q))&&(!s||w.status===s)).map(wordRow).join('')||'<div class="empty"><b>没有匹配结果</b>换一个关键词试试。</div>';bindWordLinks()};document.querySelector('#search').oninput=redraw;document.querySelector('#filter').onchange=redraw;bindWordLinks()}
async function volumeWords(id){navActive('volumes');loading();const v=await loadVolume(id),words=await api(`/api/volumes/${id}/words`);app.innerHTML=`${volumeNav(v,'words')}<div class="page-head"><div><h2 class="page-title">本册词库</h2><p class="page-subtitle">${words.length} 个词，点击任意单词查看完整卡片</p></div></div>${searchableWordList(words)}`;bindRoutes();bindVolumeLinks();enableWordSearch(words)}
async function library(){navActive('library');loading();const words=await api('/api/words');app.innerHTML=`<div class="page-head"><div><h1 class="page-title">总词库</h1><p class="page-subtitle">所有已分册的 ${words.length} 个考纲词</p></div></div>${searchableWordList(words)}`;enableWordSearch(words)}

async function roots(){navActive('roots');loading();const items=await api('/api/roots');app.innerHTML=`<div class="page-head"><div><h1 class="page-title">词根库</h1><p class="page-subtitle">点击词根查看说明和全部关联单词</p></div></div><div class="root-grid">${items.map(r=>`<button class="root-card root-card-button" data-root-id="${r.id}"><div class="kind">${esc(r.kind)}</div><h3>${esc(r.root)}</h3><strong>${esc(r.meaning)}</strong><p>${esc(r.explanation)}</p><span>${r.word_count} 个关联词 →</span></button>`).join('')}</div>`;bindRootLinks()}
function closeModals(){document.querySelectorAll('.modal').forEach(x=>x.remove())}
async function showWord(id){const w=await api(`/api/words/${id}`);closeModals();const wrap=document.createElement('div');wrap.className='modal';wrap.innerHTML=`<div class="modal-card"><button class="modal-close" aria-label="关闭">×</button><div class="source">考纲第 ${w.source_page} 页 · ${esc(w.status_label)}</div><h2>${esc(w.word)}</h2><p class="meaning">${esc(w.chinese)}</p><div class="reveal-label">词根与词缀</div>${rootChips(w)}<section class="reveal-block"><div class="reveal-label">考纲原文讲解</div><p class="detail">${esc(w.details)}</p></section>${w.last_review_at?`<p class="source">已复习 ${w.review_count} 次 · 下次 ${w.next_review_at}</p>`:''}</div>`;document.body.appendChild(wrap);wireModal(wrap);bindRootLinks()}
async function showRoot(id){const r=await api(`/api/roots/${id}`);closeModals();const wrap=document.createElement('div');wrap.className='modal';wrap.innerHTML=`<div class="modal-card root-modal"><button class="modal-close" aria-label="关闭">×</button><div class="source">${esc(r.kind).toUpperCase()} · 词根词缀卡片</div><h2>${esc(r.root)}</h2><p class="meaning">${esc(r.meaning)}</p><p class="root-explanation">${esc(r.explanation)}</p><div class="reveal-label">关联单词 · ${r.words.length}</div><div class="root-modal-words">${r.words.map(w=>compactWord(w,'单词卡')).join('')}</div></div>`;document.body.appendChild(wrap);wireModal(wrap);bindWordLinks()}
function wireModal(wrap){const close=()=>wrap.remove();wrap.onclick=e=>{if(e.target===wrap)close()};wrap.querySelector('.modal-close').onclick=close}

async function render(){
  const parts=(location.hash.slice(1)||'volumes').split('/');
  try{
    if(parts[0]==='volume'){
      const id=Number(parts[1]),section=parts[2]||'home';
      const handlers={home:volumeHome,progress:volumeProgress,study:volumeStudy,review:volumeReview,words:volumeWords};
      return await (handlers[section]||volumeHome)(id);
    }
    if(parts[0]==='library')return await library();
    if(parts[0]==='roots')return await roots();
    if(parts[0]==='progress')return await progressManager();
    return await volumesPage();
  }catch(e){app.innerHTML=`<div class="empty"><b>暂时无法打开</b>${esc(e.message)}</div>`}
}
window.addEventListener('hashchange',render);bindRoutes();render();
