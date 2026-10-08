import '@angular/compiler';
import test from 'node:test';
import assert from 'node:assert/strict';
import { StepsService } from '../src/app/steps.service';
import { Entry } from '../src/app/challenge';
import { SignedIn, StoreError } from '../src/app/backend';
import { fakeFirestore } from './fake-backend';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('scenen venter på innlogging, avklart person og første skrittdata', async () => {
  const store = new StepsService();
  const backend = fakeFirestore().backend('stine@firma.no');
  const auth = deferred<SignedIn | null>();
  const claim = deferred<boolean>();
  const claiming = deferred<void>();
  let next!: (entries: Entry[]) => void;
  backend.init = () => auth.promise;
  backend.claimSpot = () => { claiming.resolve(); return claim.promise; };
  backend.watch = callback => { next = callback; return () => {}; };
  backend.watchMemories = () => () => {};

  const starting = store.attach(backend);
  assert.equal(store.journeyReady(), false);
  auth.resolve({ email: 'stine@firma.no', name: 'Stine' });
  await claiming.promise;
  assert.equal(store.journeyReady(), false);
  claim.resolve(true);
  await starting;
  assert.equal(store.mode(), 'shared');
  assert.equal(store.name(), 'Stine');
  assert.equal(store.journeyReady(), false);

  next([{ name: 'Stine', day: '2026-10-01', steps: 87_000 }]);
  assert.equal(store.journeyReady(), true);
  assert.equal(store.entries()[0].steps, 87_000);
  next([{ name: 'Stine', day: '2026-10-01', steps: 88_000 }]);
  assert.equal(store.journeyReady(), true);

  // Ny tilkobling må vente på nye data, selv om forrige økt var klar.
  await store.attach(backend);
  assert.equal(store.journeyReady(), false);
  next([]);
  assert.equal(store.journeyReady(), true);
  await store.logout();
  assert.equal(store.mode(), 'login');
  assert.equal(store.journeyReady(), true);
  assert.deepEqual(store.entries(), []);
});

test('innlogging fra utlogget visning skjuler scenen mens plassen og data hentes', async () => {
  const store = new StepsService();
  const backend = fakeFirestore().backend(null);
  const claim = deferred<boolean>();
  const claiming = deferred<void>();
  let next!: (entries: Entry[]) => void;
  backend.login = async () => ({ email: 'endre@firma.no', name: 'Endre' });
  backend.claimSpot = () => { claiming.resolve(); return claim.promise; };
  backend.watch = callback => { next = callback; return () => {}; };
  backend.watchMemories = () => () => {};
  await store.attach(backend);
  assert.equal(store.journeyReady(), true);

  const login = store.login();
  await claiming.promise;
  assert.equal(store.mode(), 'loading');
  assert.equal(store.journeyReady(), false);
  claim.resolve(true);
  await login;
  assert.equal(store.journeyReady(), false);
  next([]);
  assert.equal(store.journeyReady(), true);
});

test('lesetilgang venter også på data, og lesefeil viser ikke feil fremdrift', async () => {
  const store = new StepsService();
  const backend = fakeFirestore().backend('gjest@firma.no');
  let next!: (entries: Entry[]) => void;
  let fail!: (error: StoreError) => void;
  backend.watch = (callback, onError) => { next = callback; fail = onError; return () => {}; };
  await store.attach(backend);
  assert.equal(store.mode(), 'readonly');
  assert.equal(store.journeyReady(), false);
  fail(new StoreError('request', 'offline'));
  assert.equal(store.journeyReady(), false);
  assert.ok(store.error());
  await store.refresh();
  assert.equal(store.journeyReady(), true);
  next([]);
  assert.equal(store.journeyReady(), true);
  fail(new StoreError('request', 'offline'));
  assert.equal(store.journeyReady(), true); // Behold kjent fremdrift ved senere nettverksfeil.
  store.disconnect();
});
