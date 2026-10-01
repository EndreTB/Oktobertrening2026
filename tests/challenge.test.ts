import test from 'node:test';
import assert from 'node:assert/strict';
import {stats,elapsedDays,validEntry,osloDate,personFromEmail,Entry} from '../src/app/challenge';
const row=(day:string,steps:number):Entry=>({name:'Endre',day,steps});
test('hele måneden teller, også dager uten registrering',()=>{
 const s=stats([row('2026-10-01',20000)],'Endre','2026-10-04');
 assert.equal(s.average,5000);assert.equal(s.total,20000);assert.equal(s.remaining,28);assert.equal(s.needed,Math.ceil(290000/28));
});
test('før start har man 31 dager igjen',()=>{const s=stats([],'Endre','2026-09-30');assert.equal(s.remaining,31);assert.equal(s.needed,10000);assert.equal(s.average,0);});
test('registrert i dag betyr at det nye dagsmålet gjelder fra i morgen',()=>{const s=stats([row('2026-10-01',15000)],'Endre','2026-10-01');assert.equal(s.remaining,30);assert.equal(s.needed,9834);});
test('siste dag, null skritt og etter oktober',()=>{
 assert.equal(stats([],'Endre','2026-10-31').remaining,1);
 assert.equal(stats([row('2026-10-31',0)],'Endre','2026-10-31').remaining,0);
 assert.equal(stats([],'Endre','2026-11-02').remaining,0);
 assert.equal(elapsedDays('2026-11-02'),31);
});
test('bare gyldige datoer og heltall kan registreres',()=>{
 for(const [day,steps] of [['2026-09-30',10],['2026-10-32',10],['2026-10-13',10],['2026-10-01',-1],['2026-10-01',1.5],['2026-10-01',100001]] as const) assert.equal(validEntry(day,steps,'2026-10-12'),false);
 assert.equal(validEntry('2026-10-12',0,'2026-10-12'),true);
 assert.equal(validEntry('2026-10-31',100000,'2026-11-12'),true);
});
test('månedsmålet, strek og distanse',()=>{
 const entries=Array.from({length:31},(_,i)=>row(`2026-10-${String(i+1).padStart(2,'0')}`,10000));
 const s=stats(entries,'Endre','2026-10-31');assert.equal(s.progress,100);assert.equal(s.streak,31);assert.equal(s.km,232.5);assert.equal(s.needed,0);
});
test('datoer bruker Oslo, uavhengig av enhetens tidssone',()=>{assert.equal(osloDate(new Date('2026-09-30T22:30:00Z')),'2026-10-01');});
test('en registrert dag under målet bryter dagens strek',()=>{
 assert.equal(stats([row('2026-10-01',12000),row('2026-10-02',8000)],'Endre','2026-10-02').streak,0);
 assert.equal(stats([row('2026-10-01',12000)],'Endre','2026-10-02').streak,1);
 assert.equal(stats([row('2026-10-30',12000)],'Endre','2026-11-01').streak,0);
});
test('e-posten avgjør hvem som er hvem',()=>{
 assert.equal(personFromEmail('endre115x@gmail.com'),'Endre');
 assert.equal(personFromEmail('Stine.Hansen@firma.no'),'Stine');
 assert.equal(personFromEmail('LARS@firma.no'),'Lars');
 assert.equal(personFromEmail('larsen@firma.no'),'Lars'); // delstreng: «larsen» regnes som Lars
 assert.equal(personFromEmail('kari@firma.no'),null);
 assert.equal(personFromEmail('post@endre.no'),null); // bare delen foran @ teller
 assert.equal(personFromEmail(''),null);
});
