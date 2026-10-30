// PDV Damião — guarda o app no aparelho para abrir sem internet
const CACHE='pdv-damiao-v2-caixa';
const APP=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./caixa-core.js','./caixa.js','./caixa.css'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('pdv-damiao-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  // Chamadas de integração e autenticação nunca vêm do cache
  if(u.origin!==location.origin||!u.pathname.startsWith('/pdv/')||u.search)return;
  // app: tenta a rede primeiro (pega atualizações), cai no cache sem internet
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
