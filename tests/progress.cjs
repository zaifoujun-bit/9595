/* Run: node tests/progress.cjs (test-only fake-indexeddb under test-artifacts/package). */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
let indexedDB;
try{({indexedDB}=require('fake-indexeddb'))}catch{({indexedDB}=require('../test-artifacts/package/build/cjs/index.js'))}
globalThis.indexedDB=indexedDB;
require('../public/local-store.js');
const {LocalStore,schedule}=globalThis.WordboatStore;
const content=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/content.json'),'utf8'));
async function main(){
  const store=await LocalStore.create(content,'test-progress');
  assert.equal((await store.request('/api/progress')).learned_words,0);
  const id=content.words[0].id;
  const learned=await store.rate(id,2);
  assert.equal(learned.review_count,1);
  assert.equal((await store.request('/api/volumes/1')).learned_words,1);
  store.db.close();
  const reopened=await LocalStore.create(content,'test-progress');
  assert.equal((await reopened.request(`/api/words/${id}`)).review_count,1);
  // Read/write transactions serialize concurrent tabs, so no review is lost.
  const otherTab=await LocalStore.create(content,'test-progress');
  await Promise.all([reopened.rate(id,2),otherTab.rate(id,3)]);
  assert.equal((await reopened.request(`/api/words/${id}`)).review_count,3);
  const saved=await reopened.backup();
  await reopened.clear();
  assert.equal((await reopened.request('/api/progress')).review_count,0);
  await reopened.import(saved);
  assert.equal((await reopened.request('/api/progress')).review_count,3);
  for(const bad of [{...saved,source_signature:'wrong'},{...saved,reviews:[]},{...saved,progress:[{...saved.progress[0],word_id:999999}]}]){
    await assert.rejects(()=>reopened.import(bad));
    assert.equal((await reopened.request('/api/progress')).review_count,3);
  }
  const expanded=structuredClone(content);
  expanded.words.push({...expanded.words[0],id:999999,word:'test-new-word',volume_id:2});
  expanded.volumes.push({id:2,sequence_number:2,title:'test',word_count:1});
  const nextRelease=await LocalStore.create(expanded,'test-progress');
  assert.equal((await nextRelease.request('/api/progress')).learned_words,1);
  assert.equal((await nextRelease.request('/api/words/999999')).review_count,0);
  const friend=await LocalStore.create(content,'test-other-browser');
  assert.equal((await friend.request('/api/progress')).review_count,0);
  assert.equal(schedule(null,2,new Date(2026,8,25,23,59)).next_review_at,'2026-09-26');
  assert.equal(schedule(null,3,new Date(2026,8,25)).interval_days,4);

  // Exercise actual SQLite import/export functions against the original file.
  const initSqlJs=require('../public/vendor/sql-wasm.js');
  const SQL=await initSqlJs({wasmBinary:fs.readFileSync(path.join(__dirname,'../public/vendor/sql-wasm.wasm'))});
  let downloaded;
  const context=vm.createContext({initSqlJs:()=>Promise.resolve(SQL),location:{href:'https://example.com/'},URL,Blob,TextDecoder,Uint8Array,WordboatStore,localReady:Promise.resolve(friend),setTimeout});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/browser-progress.js'),'utf8'),context);
  context.downloadProgress=bytes=>{downloaded=bytes};
  const originalPath=path.join(__dirname,'../../progress.db');
  await friend.import(saved);
  await vm.runInContext('exportDatabase()',context);
  const legacy=fs.existsSync(originalPath)?fs.readFileSync(originalPath):Buffer.from(downloaded);
  context.testFile={size:legacy.length,arrayBuffer:async()=>legacy.buffer.slice(legacy.byteOffset,legacy.byteOffset+legacy.byteLength)};
  const decoded=await vm.runInContext('readProgressFile(testFile)',context);
  await friend.import(decoded);
  await vm.runInContext('exportDatabase()',context);
  const sqlite=new SQL.Database(downloaded);
  assert.equal(sqlite.exec('SELECT COUNT(*) FROM Reviews')[0].values[0][0],decoded.reviews.length);
  assert.equal(sqlite.exec('SELECT COUNT(*) FROM WordProgress')[0].values[0][0],decoded.progress.length);
  sqlite.close();
  console.log(JSON.stringify({persistence:'pass',concurrentWrites:'pass',backupRestore:'pass',invalidImportPreservesData:'pass',newVolumeKeepsProgress:'pass',independentBrowsers:'pass',localDateScheduler:'pass',legacySqliteRoundtrip:'pass',legacyReviews:decoded.reviews.length}));
  for(const s of [reopened,otherTab,nextRelease,friend])s.db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1});
