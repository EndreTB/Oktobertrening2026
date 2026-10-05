import '@angular/compiler';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PEOPLE, osloDate, overrideToday} from '../src/app/challenge';

test('devbaren: datasett, falsk dato og skriveregel som i firestore.rules', async t => {
  const saved = new Map<string,string>();
  Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v), removeItem: (k: string) => saved.delete(k)}, configurable: true, writable: true});
  t.mock.timers.enable({apis: ['setTimeout']});
  const {spreadSteps, DevBackend, devState} = await import('../src/app/dev/dev-tools');

  const entries = spreadSteps(465_000, 15);
  assert.equal(entries.length, 15 * PEOPLE.length);
  assert.ok(Math.abs(entries.reduce((s, e) => s + e.steps, 0) - 465_000) < 50);
  assert.ok(entries.every(e => e.day <= '2026-10-15' && e.steps <= 100_000));

  overrideToday('2026-10-15');
  assert.equal(osloDate(), '2026-10-15');
  assert.equal(osloDate(new Date('2026-09-30T22:30:00Z')), '2026-10-01');

  const backend = new DevBackend();
  devState.set({role: 'Stine', today: '2026-10-15', entries: [], failure: 'none'});
  const seen: number[] = [];
  backend.watch(e => seen.push(e.length), () => {});
  const save = (person: 'Endre'|'Stine', day: string) => { const p = backend.saveDay(person, day, 9000); t.mock.timers.tick(600); return p; };
  await save('Stine', '2026-10-15');
  await assert.rejects(save('Endre', '2026-10-15'), {kind: 'denied'});
  assert.deepEqual(seen, [0, 1]);
  // Registreringer etter den falske datoen skjules.
  overrideToday('2026-10-14'); backend.notify();
  assert.deepEqual(seen, [0, 1, 0]);
  overrideToday(null);
});
