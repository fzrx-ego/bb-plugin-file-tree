/** Share read-only work across panels; changing visible paths must not overlap full Git scans. */
export function cachedRead<T>(ttlMs:number,limit=64) {
 const cache=new Map<string,{at:number;pending:boolean;promise:Promise<T>}>();
 return (key:string,read:()=>Promise<T>):Promise<T> => {
  const old=cache.get(key);
  if(old && (old.pending || Date.now()-old.at<ttlMs))return old.promise;
  const item={at:Date.now(),pending:true,promise:Promise.resolve().then(read)};
  cache.set(key,item);
  if(cache.size>limit)cache.delete(cache.keys().next().value!);
  void item.promise.then(()=>{item.pending=false;item.at=Date.now();},()=>{if(cache.get(key)===item)cache.delete(key);});
  return item.promise;
 };
}
