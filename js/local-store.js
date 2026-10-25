"use strict";
(function(){
  const DB_NAME="farnaz-local-v1";
  const DB_VERSION=1;
  const STORE_MESSAGES="chatMessages";
  const STORE_DRAFTS="drafts";
  const STORE_TEMP="tempFiles";
  let opening=null;

  function openDB(){
    if(!("indexedDB" in window))return Promise.resolve(null);
    if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE_MESSAGES))db.createObjectStore(STORE_MESSAGES,{keyPath:"key"});
        if(!db.objectStoreNames.contains(STORE_DRAFTS))db.createObjectStore(STORE_DRAFTS,{keyPath:"key"});
        if(!db.objectStoreNames.contains(STORE_TEMP))db.createObjectStore(STORE_TEMP,{keyPath:"key"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>{opening=null;reject(request.error||new Error("Local storage unavailable"));};
      request.onblocked=()=>{opening=null;reject(new Error("Local storage upgrade is blocked"));};
    });
    return opening;
  }

  function keyFor(userId,contactId){return String(userId)+"::"+String(contactId);}
  async function read(storeName,key){
    const db=await openDB();if(!db)return null;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,"readonly"),request=tx.objectStore(storeName).get(key);
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error||new Error("Local read failed"));
    });
  }
  async function write(storeName,value){
    const db=await openDB();if(!db)return false;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,"readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error("Local write failed"));
      tx.onabort=()=>reject(tx.error||new Error("Local write aborted"));
    });
  }
  async function remove(storeName,key){
    const db=await openDB();if(!db)return false;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,"readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error("Local delete failed"));
      tx.onabort=()=>reject(tx.error||new Error("Local delete aborted"));
    });
  }

  async function getMessages(userId,contactId){
    if(!userId||!contactId)return [];
    const record=await read(STORE_MESSAGES,keyFor(userId,contactId));
    return Array.isArray(record?.messages)?record.messages:[];
  }
  async function saveMessages(userId,contactId,messages){
    if(!userId||!contactId||!Array.isArray(messages))return false;
    const uniqueMessages=new Map();
    for(const message of messages){if(message?.id)uniqueMessages.set(String(message.id),message);}
    const safeMessages=[...uniqueMessages.values()].slice(-50).map(m=>({
      id:m.id,sender_id:m.sender_id,receiver_id:m.receiver_id,
      body:typeof m.body==="string"?m.body:null,created_at:m.created_at,
      message_type:m.message_type||"text",attachment_path:m.attachment_path||null,
      attachment_name:m.attachment_name||null,attachment_mime:m.attachment_mime||null,
      reply_to_id:m.reply_to_id||null,edited_at:m.edited_at||null
    }));
    return write(STORE_MESSAGES,{key:keyFor(userId,contactId),userId:String(userId),contactId:String(contactId),messages:safeMessages,updatedAt:Date.now()});
  }
  async function getDraft(userId,contactId){
    if(!userId||!contactId)return "";
    const record=await read(STORE_DRAFTS,keyFor(userId,contactId));
    return typeof record?.body==="string"?record.body:"";
  }
  async function saveDraft(userId,contactId,body){
    if(!userId||!contactId)return false;
    const key=keyFor(userId,contactId),value=String(body||"");
    if(!value.trim())return remove(STORE_DRAFTS,key);
    return write(STORE_DRAFTS,{key,userId:String(userId),contactId:String(contactId),body:value,updatedAt:Date.now()});
  }
  async function clearDraft(userId,contactId){
    if(!userId||!contactId)return false;
    return remove(STORE_DRAFTS,keyFor(userId,contactId));
  }
  async function saveTemporaryFile(userId,fileId,blob,ttlMs){
    if(!userId||!fileId||!(blob instanceof Blob))return false;
    const expiresAt=Date.now()+Math.max(60000,Number(ttlMs)||86400000);
    return write(STORE_TEMP,{key:keyFor(userId,fileId),userId:String(userId),fileId:String(fileId),blob,expiresAt});
  }
  async function getTemporaryFile(userId,fileId){
    if(!userId||!fileId)return null;
    const record=await read(STORE_TEMP,keyFor(userId,fileId));
    if(!record)return null;
    if(record.expiresAt<=Date.now()){await remove(STORE_TEMP,record.key);return null;}
    return record.blob||null;
  }
  async function clearUser(userId){
    if(!userId)return false;
    const db=await openDB();if(!db)return false;
    const names=[STORE_MESSAGES,STORE_DRAFTS,STORE_TEMP];
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(names,"readwrite");
      for(const name of names){
        const request=tx.objectStore(name).openCursor();
        request.onsuccess=()=>{
          const cursor=request.result;
          if(!cursor)return;
          if(String(cursor.value?.userId)===String(userId))cursor.delete();
          cursor.continue();
        };
      }
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error("Local account cleanup failed"));
      tx.onabort=()=>reject(tx.error||new Error("Local account cleanup aborted"));
    });
  }
  async function requestPersistentStorage(){
    try{
      if(!navigator.storage?.persist)return false;
      return await navigator.storage.persist();
    }catch(_){return false;}
  }

  window.FarnazLocalStore=Object.freeze({
    getMessages,saveMessages,getDraft,saveDraft,clearDraft,
    saveTemporaryFile,getTemporaryFile,clearUser,requestPersistentStorage
  });
})();