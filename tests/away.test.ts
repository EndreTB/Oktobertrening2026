import test from 'node:test';
import assert from 'node:assert/strict';
import { SEEN_KEY, readSeen, sinceSeen, snapshot, writeSeen } from '../src/app/away';

const memory = () => { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; };

test('husker hvor langt gjengen var, og hvem som har gått siden',()=>{
  const storage = memory();
  assert.equal(readSeen(storage), null);
  const before = snapshot([{name:'Endre',day:'2026-10-01',steps:8000},{name:'Stine',day:'2026-10-01',steps:5000}]);
  writeSeen(before, storage);
  const seen = readSeen(storage)!;
  assert.equal(seen.total, 13000);
  const now = snapshot([{name:'Endre',day:'2026-10-01',steps:8000},{name:'Stine',day:'2026-10-01',steps:5000},{name:'Stine',day:'2026-10-02',steps:12000},{name:'Lars',day:'2026-10-02',steps:3000}]);
  assert.equal(now.total, 28000);
  assert.deepEqual(sinceSeen(seen, now), [{name:'Stine',steps:12000},{name:'Lars',steps:3000}]);
});
test('ødelagt eller gammel lagring gir ingen avspilling',()=>{
  const storage = memory();
  storage.setItem(SEEN_KEY, '{ikke json');
  assert.equal(readSeen(storage), null);
  storage.setItem(SEEN_KEY, JSON.stringify({total: 5000}));
  assert.deepEqual(readSeen(storage), {total: 5000, people: {Endre: 0, Stine: 0, Lars: 0}});
});
