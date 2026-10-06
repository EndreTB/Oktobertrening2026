import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld, disposeWorld } from '../src/app/world-scene';
import { WORLDS } from '../src/app/worlds';

test('messingbroene bærer hele turen opp til stjerneklokken',()=>{
  const info=WORLDS.find(world=>world.id==='micro')!;
  const built=createWorld(info,'Endre',info.start);
  try {
    built.group.updateMatrixWorld(true);
    const deck=built.group.getObjectByName('clockwork-bridge')!;
    const landing=built.group.getObjectByName('clockwork-landing')!;
    const ray=new THREE.Raycaster();
    assert.ok(built.route.getPoint(1).y-built.route.getPoint(0).y>20);
    for(let i=0;i<=100;i++) {
      const p=built.route.getPoint(i/100);
      ray.set(p.clone().add(new THREE.Vector3(0,.1,0)),new THREE.Vector3(0,-1,0));ray.far=.5;
      assert.ok(ray.intersectObjects([deck,landing]).length,`Mangler fotfeste ved ${i}%`);
      for(const aspect of [.48,1,1.8])for(const overview of [0,.5,1]) {
        const pose=built.cameraPose!(p,aspect,overview);
        const camera=new THREE.PerspectiveCamera(39,aspect,.1,200);
        camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
        for(const h of [.1,1.4]) {
          const projected=p.clone().add(new THREE.Vector3(0,h,0)).project(camera);
          assert.ok(Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95&&Math.abs(projected.z)<1,`Figuren utenfor bildet ved ${i}%, ${aspect}, ${overview}`);
        }
      }
    }
    const clock=built.group.getObjectByName('star-clock')!;
    assert.ok(clock.position.distanceTo(built.portal.position)<1);
  } finally {disposeWorld(built.group);}
});

test('urverket beveger seg uten å flytte gangbroene eller svinge gjennom ruten',()=>{
  const built=createWorld(WORLDS.find(world=>world.id==='micro')!,'Stine');
  try {
    const deck=built.group.getObjectByName('clockwork-bridge')!;
    const initial=deck.matrix.clone();
    const moving=built.group.children.filter(object=>['clockwork-gear','clockwork-pendulum'].includes(object.name));
    const ray=new THREE.Raycaster();
    for(const elapsed of [0,1.4,4,20]) {
      built.animate!(elapsed,.016);built.group.updateMatrixWorld(true);
      assert.ok(deck.matrix.equals(initial));
      for(let i=0;i<=60;i++) {
        const p=built.route.getPoint(i/60);
        ray.set(p.clone().add(new THREE.Vector3(0,.1,0)),new THREE.Vector3(0,1,0));ray.far=1.5;
        assert.equal(ray.intersectObjects(moving,true).length,0,`Urverket treffer figuren ved ${i/60}`);
      }
    }
    const wheel=moving.find(object=>object.name==='clockwork-gear')!;
    const before=wheel.rotation.z;built.animate!(21,.016);
    assert.notEqual(wheel.rotation.z,before);
  } finally {disposeWorld(built.group);}
});

test('tannhjulene griper inn i hverandre og har samsvarende rotasjon',()=>{
  const built=createWorld(WORLDS.find(world=>world.id==='micro')!,'Endre');
  try {
    const gears=built.group.children.filter(object=>object.name==='clockwork-gear');
    const before=gears.map(gear=>gear.rotation.z);
    built.animate!(1,.016);
    for(let i=1;i<gears.length;i++) {
      const previous=gears[i-1],current=gears[i];
      const firstRadius=previous.userData['pitchRadius'],secondRadius=current.userData['pitchRadius'];
      assert.ok(Math.abs(previous.position.distanceTo(current.position)-firstRadius-secondRadius)<1e-8,'Tannhjulene må møtes ved delingssirklene');
      const firstTurn=(previous.rotation.z-before[i-1])*firstRadius;
      const secondTurn=(current.rotation.z-before[i])*secondRadius;
      assert.ok(Math.abs(firstTurn+secondTurn)<1e-8,'Tannhjulene må drive hverandre i motsatt retning');
    }
  } finally {disposeWorld(built.group);}
});
