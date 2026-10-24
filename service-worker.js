"use strict";
const CACHE_NAME="farnaz-shell-v61";
const APP_BASE=new URL("./",self.location.href);
const SHELL=["./","./index.html","./styles.css","./spaces.css","./js/core.js","./js/chat-menu-v5.js","./js/spaces.js","./js/calls.js","./manifest.webmanifest","./farnaz-icon.svg?v=20261024-4"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL.map(path=>new URL(path,APP_BASE).href))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("farnaz-shell-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(APP_BASE.pathname))return;
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(new URL("./index.html",APP_BASE).href,copy));}
      return response;
    }).catch(async()=>await caches.match(req,{ignoreSearch:true})||await caches.match(new URL("./index.html",APP_BASE).href)));
    return;
  }
  const isCodeAsset=/\.(?:html|css|js)$/i.test(url.pathname)||url.search.length>0;
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(isCodeAsset){
      try{
        const response=await fetch(req);
        if(response.ok&&response.type==="basic")caches.open(CACHE_NAME).then(cache=>cache.put(req,response.clone()));
        return response;
      }catch(_){return cached||Response.error();}
    }
    if(cached)return cached;
    const response=await fetch(req);
    if(response.ok&&response.type==="basic")caches.open(CACHE_NAME).then(cache=>cache.put(req,response.clone()));
    return response;
  })());
});
self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?event.data.json():{};}catch(_){payload={body:event.data?.text()||""};}
  const title=String(payload.title||"فرناز | Farnaz");
  const options={
    body:String(payload.body||"پیام جدیدی دریافت کردی."),
    icon:"./farnaz-icon.svg?v=20261024-4",
    badge:"./farnaz-icon.svg?v=20261024-4",
    tag:String(payload.tag||"farnaz-push"),
    renotify:false,
    data:{url:payload.url||"./"}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"./",APP_BASE).href;
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
    for(const client of clients){if(client.url.startsWith(APP_BASE.origin+APP_BASE.pathname)){client.focus();client.navigate?.(target);return;}}
    return self.clients.openWindow(target);
  }));
});