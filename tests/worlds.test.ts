import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS, worldAt, worldProgress, journeyLegs, clampSteps } from '../src/app/worlds';
import { createWorld, disposeWorld } from '../src/app/world-scene';

test('verdenene åpner på riktig skritt, også etter månedsmålet',()=>{
  for(const world of WORLDS){assert.equal(worldAt(world.start).id,world.id);assert.equal(worldProgress(world.start),0);}
  assert.equal(worldAt(179999).id,'mountain');
  assert.equal(worldAt(929999).id,'cosmos');
  assert.equal(worldAt(930000).id,'light');
  assert.equal(worldAt(2000000).id,'light');
  assert.equal(clampSteps(2000000),2000000);
});
test('portalovergang går til toppen av gammel verden og starter neste',()=>{
  const legs=journeyLegs(175000,190000);
  assert.deepEqual(legs.map(l=>l.world.id),['mountain','forest']);
  assert.equal(legs[0].to,1);assert.equal(legs[1].from,0);
  assert.equal(legs[1].endSteps,190000);
  assert.deepEqual(journeyLegs(175000,180000).map(l=>[l.world.id,l.to]),[['mountain',1],['forest',0]]);
});
test('930 000 åpner lysverdenen, og ekstra skritt blir aldri borte',()=>{
  const legs=journeyLegs(925000,950000);
  assert.deepEqual(legs.map(l=>l.world.id),['cosmos','light']);
  assert.equal(legs[1].endSteps,950000);
  assert.equal(worldProgress(950000),20000/180000);
  assert.equal(journeyLegs(925000,930000).at(-1)?.world.id,'light');
});
test('ny lyssti ved 1 110 000, også ved nøyaktig grense',()=>{
  const legs=journeyLegs(1100000,1120000);
  assert.equal(legs.length,2);assert.equal(legs[0].to,1);assert.equal(legs[1].from,0);
  assert.equal(legs[1].endSteps,1120000);
  assert.equal(worldProgress(1110000),0);
  assert.equal(journeyLegs(1100000,1110000).at(-1)?.to,0);
});
test('retting nedover og uendret antall skaper ingen falsk fremgang',()=>{
  const corrected=journeyLegs(950000,920000);
  assert.equal(corrected.length,1);assert.equal(corrected[0].world.id,'cosmos');
  assert.equal(corrected[0].from,corrected[0].to);
  const unchanged=journeyLegs(180000,180000);assert.equal(unchanged[0].from,unchanged[0].to);
});
test('lange sprang besøker alle mellomliggende verdener',()=>{
  const legs=journeyLegs(100000,1200000);
  assert.deepEqual(legs.map(l=>l.world.id),['mountain','forest','body','micro','cosmos','light','light']);
  for(const leg of legs){assert.ok(leg.from>=0&&leg.to<=1);assert.ok(Number.isFinite(leg.to));}
  assert.equal(legs.at(-1)?.endSteps,1200000);
});
test('alle 3D-verdener har en gyldig, sammenhengende sti',()=>{
  for(const world of WORLDS){
    const built=createWorld(world,'Endre',world.start);
    for(let i=0;i<=100;i++){
      const point=built.route.getPoint(i/100);
      assert.ok([point.x,point.y,point.z].every(Number.isFinite),world.id);
    }
    assert.equal(built.limbs.length,4);
    assert.ok(built.group.children.length>5);
    disposeWorld(built.group);
  }
});
test('neste etappe i lysverdenen får en ny sti',()=>{
  const first=createWorld(WORLDS[5],'Endre',930000);
  const next=createWorld(WORLDS[5],'Endre',1110000);
  assert.notDeepEqual(first.route.getPoint(.4).toArray(),next.route.getPoint(.4).toArray());
  disposeWorld(first.group);disposeWorld(next.group);
});
