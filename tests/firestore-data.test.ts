import test from 'node:test';
import assert from 'node:assert/strict';
import {toEntries} from '../src/app/backend';

test('Firestore-dokumenter: ukjente personer, ugyldige data og fremtidige dager hoppes over', () => {
  const docs = [
    {id: 'lars', data: {days: {'2026-10-02': 7000, '2026-10-01': 5000, '2026-10-03': 'mye'}}},
    {id: 'cathrine', data: {days: {'2026-10-01': 11000, '2026-10-02': 0}}},
    {id: 'stine', data: {days: 'ikke et kart'}},
    {id: 'ola', data: {days: {'2026-10-01': 1}}},
    {id: 'endre', data: {days: {'2026-10-20': 9000, '2026-10-05': 200000, '2026-09-30': 100, '2026-10-02': 0}}},
    {id: 'Endre', data: {days: {'2026-10-01': 1}}},
  ];
  assert.deepEqual(toEntries(docs, '2026-10-12'), [
    {name: 'Lars', day: '2026-10-01', steps: 5000},
    {name: 'Cathrine', day: '2026-10-01', steps: 11000},
    {name: 'Endre', day: '2026-10-02', steps: 0},
    {name: 'Lars', day: '2026-10-02', steps: 7000},
    {name: 'Cathrine', day: '2026-10-02', steps: 0},
  ]);
  assert.deepEqual(toEntries([], '2026-10-12'), []);
});
