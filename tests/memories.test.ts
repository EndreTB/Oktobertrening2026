import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPTION_MAX, IMAGE_MAX, THUMB_MAX, jpegUrl, toMemories, validMemory} from '../src/app/memories';

const thumb = 'data:image/jpeg;base64,AAEC';

test('Minne-dokumenter: ukjente personer og ugyldige data hoppes over, nyeste dag og deling først', () => {
  const docs = [
    {id: 'a', data: {person: 'lars', day: '2026-10-02', caption: 'Sopptur', thumb, width: 1600, height: 1200, createdAt: 100}},
    {id: 'b', data: {person: 'stine', day: '2026-10-05', caption: '', thumb, width: 900, height: 1600, createdAt: 50}},
    {id: 'c', data: {person: 'endre', day: '2026-10-05', caption: 'Senere samme dag', thumb, width: 1600, height: 900, createdAt: 200}},
    {id: 'd', data: {person: 'ola', day: '2026-10-03', caption: '', thumb, width: 10, height: 10}},
    {id: 'e', data: {person: 'Endre', day: '2026-10-03', caption: '', thumb, width: 10, height: 10}},
    {id: 'f', data: {person: 'cathrine', day: '2026-09-30', caption: '', thumb, width: 10, height: 10}},
    {id: 'g', data: {person: 'cathrine', day: '2026-10-03', caption: '', thumb: null, width: 10, height: 10}},
    {id: 'h', data: {person: 'cathrine', day: '2026-10-03', caption: '', thumb: 'javascript:alert(1)', width: 10, height: 10}},
    {id: 'i', data: {person: 'cathrine', day: '2026-10-03', caption: '', thumb, width: 1.5, height: 10}},
    {id: 'j', data: null},
    // Et nytt minne uten tidspunkt fra serveren ennå.
    {id: 'k', data: {person: 'cathrine', day: '2026-10-02', caption: 'Ny', thumb, width: 10, height: 10}},
  ];
  assert.deepEqual(toMemories(docs).map(m => [m.id, m.name, m.day, m.created]), [
    ['c', 'Endre', '2026-10-05', 200], ['b', 'Stine', '2026-10-05', 50], ['a', 'Lars', '2026-10-02', 100], ['k', 'Cathrine', '2026-10-02', 0],
  ]);
});

test('Nye minner: dato i oktober til og med i dag, tekstlengde og bildestørrelser', () => {
  const memory = {id: 'x', day: '2026-10-12', caption: 'Tur', image: new Uint8Array(1000), thumb: new Uint8Array(100), width: 1600, height: 1200};
  assert.equal(validMemory(memory, '2026-10-12'), true);
  assert.equal(validMemory(memory, '2026-10-11'), false);
  assert.equal(validMemory({...memory, day: '2026-09-30'}, '2026-10-12'), false);
  assert.equal(validMemory({...memory, caption: 'x'.repeat(CAPTION_MAX)}, '2026-10-12'), true);
  assert.equal(validMemory({...memory, caption: 'x'.repeat(CAPTION_MAX + 1)}, '2026-10-12'), false);
  assert.equal(validMemory({...memory, image: new Uint8Array(IMAGE_MAX + 1)}, '2026-10-12'), false);
  assert.equal(validMemory({...memory, thumb: new Uint8Array(THUMB_MAX + 1)}, '2026-10-12'), false);
  assert.equal(validMemory({...memory, image: new Uint8Array(0)}, '2026-10-12'), false);
  assert.equal(validMemory({...memory, width: 0}, '2026-10-12'), false);
});

test('JPEG-bytes blir data-URL, også store bilder', () => {
  assert.equal(jpegUrl(new Uint8Array([255, 216, 255])), 'data:image/jpeg;base64,/9j/');
  const big = new Uint8Array(IMAGE_MAX).map((_, i) => i % 256);
  assert.equal(jpegUrl(big), `data:image/jpeg;base64,${Buffer.from(big).toString('base64')}`);
});
