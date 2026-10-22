import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld,disposeWorld } from '../src/app/world-scene';
import { WORLDS } from '../src/app/worlds';
import { JUNGLE_CROSSINGS } from '../src/app/inverted-jungle';
import { JUNGLE_WATER_LEVEL } from '../src/app/jungle-water';
import { Reflector } from 'three/addons/objects/Reflector.js';
const info=WORLDS.find(world=>world.id==='cosmos')!;

test('jungelrøttene bærer figuren, og hoppene og lianen forbinder åpningene',()=>{
  const built=createWorld(info,'Endre',info.start);
  try {
    built.group.updateMatrixWorld(true);
    const roots:THREE.Object3D[]=[];built.group.traverse(object=>{if(object.name==='walkable-jungle-root')roots.push(object);});
    const ray=new THREE.Raycaster();
    for(let i=0;i<=300;i++) {
      const t=i/300,p=built.route.getPoint(t),motion=built.traversal!(t,p);
      if(!motion.airborne) {
        ray.set(p.clone().add(new THREE.Vector3(0,.1,0)),new THREE.Vector3(0,-1,0));ray.far=.5;
        assert.ok(ray.intersectObjects(roots).length,`Mangler rot under føttene ved ${t}`);
      }
      p.y+=motion.lift;
      for(const aspect of [.48,1,1.8])for(const wide of [0,.5,1]) {
        const pose=built.cameraPose!(p,aspect,wide),camera=new THREE.PerspectiveCamera(39,aspect,.1,200);
        camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
        const screen=p.clone().add(new THREE.Vector3(0,.8,0)).project(camera);
        assert.ok(Math.abs(screen.x)<.96&&Math.abs(screen.y)<.96&&Math.abs(screen.z)<1,`Figuren utenfor bildet ved ${t}`);
      }
    }
    for(const gap of JUNGLE_CROSSINGS) {
      for(const t of [gap.from,gap.to])assert.ok(Math.abs(built.traversal!(t,built.route.getPoint(t)).lift)<1e-8);
      const t=(gap.from+gap.to)/2,p=built.route.getPoint(t),motion=built.traversal!(t,p);
      assert.ok(motion.airborne);
      if(gap.kind==='jump')assert.ok(motion.lift>1);
      else {
        const rope=built.group.getObjectByName('swing-vine')!;built.group.updateMatrixWorld(true);
        const tip=rope.localToWorld(new THREE.Vector3(0,-.5,0));
        assert.ok(tip.distanceTo(p.clone().add(new THREE.Vector3(0,motion.lift+1.55,0)))<1e-6,'Lianen må følge hånden');
      }
    }
    assert.ok(built.group.getObjectByName('jungle-heart-flower')!.position.distanceTo(built.portal.position)<1);
  } finally {disposeWorld(built.group);}
});

test('vannet renner opp, trærne vokser ned og plantene beveger seg',()=>{
  const built=createWorld(info,'Stine',info.start);
  let reflectionDisposed=false;
  try {
    const trees=built.group.children.filter(object=>object.name==='inverted-trunk');
    assert.ok(trees.length>=4);trees.forEach(tree=>assert.ok(tree.userData['top'][1]-tree.userData['bottom'][1]>20));
    const water=built.group.getObjectByName('upward-water-drops') as THREE.InstancedMesh;
    const before=new THREE.Matrix4(),after=new THREE.Matrix4();
    built.animate!(0,0);water.getMatrixAt(10,before);built.animate!(.01,.01);water.getMatrixAt(10,after);
    assert.ok(after.elements[13]>before.elements[13]);
    const plant=built.group.getObjectByName('moving-jungle-plant')!,angle=plant.rotation.z;
    built.animate!(2,.016);assert.notEqual(plant.rotation.z,angle);
    built.group.updateMatrixWorld(true);
    const hangingPlants=built.group.children.filter(object=>object.name==='hanging-moving-plant');
    assert.equal(hangingPlants.length,3);
    hangingPlants.forEach(parent=>{
      const head=parent.getObjectByName('moving-jungle-plant')!;
      assert.ok(head.getWorldPosition(new THREE.Vector3()).y<parent.position.y-2,'Planten skal henge ned fra roten');
    });
    const lake=built.group.getObjectByName('jungle-lake') as Reflector;
    assert.equal(lake.position.y,JUNGLE_WATER_LEVEL);
    const waterNormal=new THREE.Vector3(0,0,1).applyQuaternion(lake.quaternion);
    assert.ok(waterNormal.y<-.99,'Vannflaten skal vende ned mot jungelen');
    assert.ok(built.route.getPoints(100).every(p=>p.y<JUNGLE_WATER_LEVEL),'Hele banen skal ligge under vannet');
    const falls=built.group.children.filter(object=>object.name==='upward-waterfall');
    falls.forEach(fall=>{
      const bounds=new THREE.Box3().setFromObject(fall);
      assert.equal(bounds.max.y,JUNGLE_WATER_LEVEL,'Fossen må nå helt opp til vannflaten');
      assert.ok(bounds.min.y<0);
    });
    for(let i=0;i<water.count;i++){
      water.getMatrixAt(i,after);
      assert.ok(after.elements[13]<JUNGLE_WATER_LEVEL,'Dråpene skal falle opp mot vannet');
    }
    const wetRoots=built.group.children.filter(object=>object.name==='water-root');
    assert.ok(wetRoots.length>=4);
    wetRoots.forEach(root=>{
      const bounds=new THREE.Box3().setFromObject(root);
      assert.ok(bounds.min.y<JUNGLE_WATER_LEVEL&&bounds.max.y>JUNGLE_WATER_LEVEL,'Roten må krysse vannflaten');
    });
    lake.getRenderTarget().addEventListener('dispose',()=>reflectionDisposed=true);
    built.group.traverse(object=>assert.ok(object.position.toArray().every(Number.isFinite)));
  } finally {disposeWorld(built.group);}
  assert.ok(reflectionDisposed,'Vannets speilbuffer må frigjøres når verdenen lukkes');
});
