import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS, worldAt, worldProgress, journeyLegs, clampSteps } from '../src/app/worlds';
import { createWorld, disposeWorld } from '../src/app/world-scene';
import * as THREE from 'three';

test('verdenene åpner på riktig skritt, også etter månedsmålet',()=>{
  for(const world of WORLDS){assert.equal(worldAt(world.start).id,world.id);assert.equal(worldProgress(world.start),0);}
  assert.equal(worldAt(239999).id,'mountain');
  assert.equal(worldAt(1239999).id,'cosmos');
  assert.equal(worldAt(1240000).id,'light');
  assert.equal(worldAt(2000000).id,'light');
  assert.equal(clampSteps(2000000),2000000);
});
test('portalovergang går til toppen av gammel verden og starter neste',()=>{
  const legs=journeyLegs(235000,250000);
  assert.deepEqual(legs.map(l=>l.world.id),['mountain','forest']);
  assert.equal(legs[0].to,1);assert.equal(legs[1].from,0);
  assert.equal(legs[1].endSteps,250000);
  assert.deepEqual(journeyLegs(235000,240000).map(l=>[l.world.id,l.to]),[['mountain',1],['forest',0]]);
});
test('1 240 000 åpner lysverdenen, og ekstra skritt blir aldri borte',()=>{
  const legs=journeyLegs(1235000,1260000);
  assert.deepEqual(legs.map(l=>l.world.id),['cosmos','light']);
  assert.equal(legs[1].endSteps,1260000);
  assert.equal(worldProgress(1260000),20000/240000);
  assert.equal(journeyLegs(1235000,1240000).at(-1)?.world.id,'light');
});
test('ny lyssti ved 1 480 000, også ved nøyaktig grense',()=>{
  const legs=journeyLegs(1470000,1490000);
  assert.equal(legs.length,2);assert.equal(legs[0].to,1);assert.equal(legs[1].from,0);
  assert.equal(legs[1].endSteps,1490000);
  assert.equal(worldProgress(1480000),0);
  assert.equal(journeyLegs(1470000,1480000).at(-1)?.to,0);
});
test('retting nedover og uendret antall skaper ingen falsk fremgang',()=>{
  const corrected=journeyLegs(1260000,1230000);
  assert.equal(corrected.length,1);assert.equal(corrected[0].world.id,'cosmos');
  assert.equal(corrected[0].from,corrected[0].to);
  const unchanged=journeyLegs(240000,240000);assert.equal(unchanged[0].from,unchanged[0].to);
});
test('lange sprang besøker alle mellomliggende verdener',()=>{
  const legs=journeyLegs(100000,1600000);
  assert.deepEqual(legs.map(l=>l.world.id),['mountain','forest','body','micro','cosmos','light','light']);
  for(const leg of legs){assert.ok(leg.from>=0&&leg.to<=1);assert.ok(Number.isFinite(leg.to));}
  assert.equal(legs.at(-1)?.endSteps,1600000);
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
  const first=createWorld(WORLDS[5],'Endre',1240000);
  const next=createWorld(WORLDS[5],'Endre',1480000);
  assert.notDeepEqual(first.route.getPoint(.4).toArray(),next.route.getPoint(.4).toArray());
  disposeWorld(first.group);disposeWorld(next.group);
});

test('kjempetreet bærer hele turen og holder figuren synlig fra begge kameravisninger',()=>{
  const built=createWorld(WORLDS[1],'Endre',240000);
  try {
    built.group.updateMatrixWorld(true);
    const obstacles:THREE.Mesh[]=[];
    built.group.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      let parent:THREE.Object3D|null=object;
      while(parent){if(parent===built.wanderer)return;parent=parent.parent;}
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.some(m=>!m.transparent||m.opacity>.7))obstacles.push(object);
    });
    const ray=new THREE.Raycaster();
    for(let i=0;i<=200;i++) {
      const point=built.route.getPoint(i/200);
      ray.set(point.clone().add(new THREE.Vector3(0,.1,0)),new THREE.Vector3(0,-1,0));ray.far=.6;
      assert.ok(ray.intersectObjects(obstacles,false).length,`Mangler fotfeste ved ${i/2}%`);
      for(const aspect of [.48,1,1.8])for(const overview of [0,.5,1]) {
        const camera=new THREE.PerspectiveCamera(39,aspect,.1,200);
        const pose=built.cameraPose!(point,aspect,overview);
        camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
        for(const height of [.3,1.2,2.35]) {
          const target=point.clone().add(new THREE.Vector3(0,height,0));
          const direction=target.clone().sub(camera.position);
          ray.set(camera.position,direction.clone().normalize());ray.far=direction.length()-.08;
          assert.equal(ray.intersectObjects(obstacles,false).length,0,`Skjult ved ${i/2}%, høyde ${height}, oversikt ${overview}`);
          const screen=target.project(camera);
          assert.ok(Math.abs(screen.x)<.95&&Math.abs(screen.y)<.95&&screen.z<1,`Utenfor bildet ved ${i/2}%`);
        }
      }
    }
    let turn=0,previousAngle=Math.atan2(built.route.getPoint(0).z+6.8,built.route.getPoint(0).x);
    for(const p of built.route.getPoints(200)) {
      const angle=Math.atan2(p.z+6.8,p.x),delta=angle-previousAngle;
      turn+=Math.atan2(Math.sin(delta),Math.cos(delta));previousAngle=angle;
      assert.ok(Math.hypot(p.x,p.z+6.8)>9.3,'Stien må holde avstand til stammen');
    }
    assert.ok(Math.abs(turn)>Math.PI*1.5,'Turen skal gå minst tre kvart runde rundt stammen');
    for(const t of [0,1]){const p=built.route.getPoint(t);assert.ok(Math.hypot(p.x,p.z+6.8)>25);}
    assert.ok(built.route.getPoint(1).y-built.route.getPoint(0).y>8);
  } finally {disposeWorld(built.group);}
});

test('gigantkorallene bærer hele turen og lar den lille dykkeren være synlig',()=>{
  const built=createWorld(WORLDS[2],'Stine',480000);
  try {
    assert.ok(built.route.getPoint(1).y-built.route.getPoint(0).y>35);
    const coralSurfaces:THREE.Mesh[]=[];
    built.group.traverse(object=>{if(object instanceof THREE.Mesh&&object.name==='walkable-coral')coralSurfaces.push(object);});
    assert.ok(coralSurfaces.filter(o=>o.userData['diameter']>16).length>=6);
    built.group.updateMatrixWorld(true);
    const obstacles:THREE.Mesh[]=[];
    built.group.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      let parent:THREE.Object3D|null=object;
      while(parent){if(parent===built.wanderer)return;parent=parent.parent;}
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.some(m=>!m.transparent))obstacles.push(object);
    });
    const ray=new THREE.Raycaster();
    for(let i=0;i<=80;i++) {
      const p=built.route.getPoint(i/80);
      ray.set(p.clone().add(new THREE.Vector3(0,.1,0)),new THREE.Vector3(0,-1,0));ray.far=.65;
      assert.ok(ray.intersectObjects(coralSurfaces,false).length,`Mangler korall under føttene ved ${i/80}`);
      for(const aspect of [.48,1.8])for(const overview of [0,.5,1]) {
        const pose=built.cameraPose!(p,aspect,overview),camera=new THREE.PerspectiveCamera(39,aspect,.1,500);
        camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
        for(const height of [.35,1.2,2.4]) {
          const target=p.clone().add(new THREE.Vector3(0,height,0)),direction=target.clone().sub(pose.position);
          ray.set(pose.position,direction.clone().normalize());ray.far=direction.length()-.08;
          assert.equal(ray.intersectObjects(obstacles,false).length,0,`Korall skjuler figuren ved ${i/80}, høyde ${height}, oversikt ${overview}`);
          const screen=target.project(camera);assert.ok(Math.abs(screen.x)<.95&&Math.abs(screen.y)<.95&&screen.z<1,`Utenfor bildet ved ${i/80}, oversikt ${overview}, format ${aspect}`);
        }
      }
    }
    built.animate?.(10,.016);built.animate?.(90,.016);
    built.group.traverse(object=>assert.ok(object.position.toArray().every(Number.isFinite)));
  } finally {disposeWorld(built.group);}
});
