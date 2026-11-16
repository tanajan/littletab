import {describe,expect,it} from 'vitest';
import {LEGACY_NAMESPACE, STORAGE_NAMESPACE, migrateStorage} from './storage';

function memoryStorage(): Storage {
  const values = new Map<string,string>();
  return {get length(){return values.size;},key:index=>Array.from(values.keys())[index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},clear:()=>values.clear()};
}
describe('browser namespace migration',()=>{
  it('preserves room access, owner keys and tutorial preferences',()=>{
    const storage=memoryStorage();
    const values={'session':'{"token":"existing-access","room":{"code":"01234"}}','owner-01234':'existing-owner','hide-tutorial':'yes'};
    Object.entries(values).forEach(([key,value])=>storage.setItem(`${LEGACY_NAMESPACE}-${key}`,value));
    storage.setItem('unrelated','leave alone');
    migrateStorage(storage);
    Object.entries(values).forEach(([key,value])=>{expect(storage.getItem(`${STORAGE_NAMESPACE}-${key}`)).toBe(value);expect(storage.getItem(`${LEGACY_NAMESPACE}-${key}`)).toBeNull();});
    expect(storage.getItem('unrelated')).toBe('leave alone');
    migrateStorage(storage);
    expect(storage.length).toBe(4);
  });
  it('keeps newer data when both namespaces exist',()=>{
    const storage=memoryStorage();storage.setItem(`${LEGACY_NAMESPACE}-session`,'old');storage.setItem(`${STORAGE_NAMESPACE}-session`,'new');
    migrateStorage(storage);expect(storage.getItem(`${STORAGE_NAMESPACE}-session`)).toBe('new');
  });
  it('keeps the original data when copying fails',()=>{
    const storage=memoryStorage();storage.setItem(`${LEGACY_NAMESPACE}-session`,'access');storage.setItem=()=>{throw new Error('Storage full');};
    expect(()=>migrateStorage(storage)).toThrow('Storage full');
    expect(storage.getItem(`${LEGACY_NAMESPACE}-session`)).toBe('access');
  });
});
