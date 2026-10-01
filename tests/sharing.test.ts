import '@angular/compiler';
import test from 'node:test';
import assert from 'node:assert/strict';
import {StepsService} from '../src/app/steps.service';
import {fakeFirestore} from './fake-backend';

const config = {firebase: {apiKey: 'test-key', authDomain: 'test.firebaseapp.com', projectId: 'test', appId: '1:2:web:3'}};

test('Firebase: innlogging, hvem som er hvem, live deling, lesetilgang og feil', async t => {
  t.mock.timers.enable({apis: ['Date'], now: new Date('2026-10-12T12:00:00Z')});
  const saved = new Map<string,string>();
  const fake = fakeFirestore();
  const originals = new Map<string,PropertyDescriptor|undefined>();
  const replace = (key: string, value: unknown) => {originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});};
  replace('localStorage', {getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v)});
  replace('document', {baseURI: 'http://localhost:3000/', hidden: false});
  replace('location', {origin: 'http://localhost:3000', pathname: '/', search: '', hash: ''});
  replace('window', {addEventListener: () => {}});
  let served: unknown = config;
  replace('fetch', async () => Response.json(served));
  const service = (email: string|null) => { const s = new StepsService(); s.createBackend = async () => fake.backend(email); return s; };
  try {
    const anon = service(null); await anon.initialize();
    assert.equal(anon.mode(), 'login'); assert.equal(await anon.save('2026-10-12', 1000), false);

    const endre = service('Endre.Berg@gmail.com'), stine = service('stine@firma.no'), kari = service('kari@firma.no');
    await endre.initialize(); await stine.initialize(); await kari.initialize();
    assert.equal(endre.mode(), 'shared'); assert.equal(endre.name(), 'Endre'); assert.equal(endre.email(), 'Endre.Berg@gmail.com');
    assert.equal(stine.name(), 'Stine');
    assert.equal(kari.mode(), 'readonly'); assert.equal(kari.name(), null);

    // Navnet kan ikke byttes når e-posten bestemmer hvem du er.
    endre.chooseName('Lars'); assert.equal(endre.name(), 'Endre');

    // Live: de andre ser lagringen uten å laste på nytt.
    assert.equal(await endre.save('2026-10-12', 12000), true);
    assert.deepEqual(stine.entries(), [{name: 'Endre', day: '2026-10-12', steps: 12000}]);
    assert.equal(await stine.save('2026-10-12', 9000), true);
    assert.equal(kari.entries().length, 2);
    assert.equal(await kari.save('2026-10-12', 5000), false);
    assert.equal(await endre.save('2026-10-11', 8000), true);
    assert.equal(await endre.save('2026-10-12', 13000), true);
    assert.deepEqual(fake.docs.get('endre'), {days: {'2026-10-11': 8000, '2026-10-12': 13000}});
    assert.deepEqual(stine.entries().map(e => [e.name, e.day, e.steps]), [['Endre','2026-10-11',8000],['Endre','2026-10-12',13000],['Stine','2026-10-12',9000]]);

    fake.state.offline = true; assert.equal(await endre.save('2026-10-12', 14000), false);
    assert.equal(endre.entries().find(e => e.name === 'Endre' && e.day === '2026-10-12')?.steps, 13000); assert.match(endre.error(), /ikke lagret/);
    await endre.refresh(); assert.match(endre.error(), /kontakt med Firebase/);
    fake.state.offline = false; await endre.refresh(); assert.equal(endre.error(), '');

    assert.equal(await endre.save('2026-10-13', 12000), false);
    assert.equal(await endre.save('2026-10-12', -10), false);

    await endre.logout();
    assert.equal(endre.mode(), 'login'); assert.equal(endre.name(), null); assert.deepEqual(endre.entries(), []);
    assert.equal(await endre.save('2026-10-12', 1000), false);

    // Uten Firebase-oppsett er siden en lokal forhåndsvisning.
    served = {firebase: {apiKey: '', projectId: 'test', appId: ''}};
    const local = service(null); await local.initialize(); assert.equal(local.mode(), 'local');
    local.chooseName('Lars'); assert.equal(await local.save('2026-10-12', 7000), true);
    assert.deepEqual(JSON.parse(saved.get('oktober-2026-local')!), [{name: 'Lars', day: '2026-10-12', steps: 7000}]);
  } finally {
    for (const [key, descriptor] of originals) {if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);}
    t.mock.timers.reset();
  }
});
