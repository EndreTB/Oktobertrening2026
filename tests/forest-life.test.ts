import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { forestWind } from '../src/app/forest-life';
import { createWorld, disposeWorld } from '../src/app/world-scene';
import { WORLDS } from '../src/app/worlds';

test('skogvinden har rolige pauser og myke, avgrensede vindkast',()=>{
  let calm=0,strong=0,previous=forestWind(0);
  for(let t=0;t<120;t+=.05) {
    const wind=forestWind(t);
    assert.ok(wind>=0&&wind<=1);
    assert.ok(Math.abs(wind-previous)<.04,'Vindkast må bygge seg opp uten rykk');
    if(wind<.02)calm++;
    if(wind>.6)strong++;
    previous=wind;
  }
  assert.ok(calm>600);assert.ok(strong>100);
  assert.notEqual(forestWind(7,-20,0),forestWind(7,20,0),'Vindfronten beveger seg gjennom skogen');
});

test('løv og mose beveger seg fra festepunktene uten å flytte stien eller skjule turfiguren',()=>{
  const built=createWorld(WORLDS[1],'Endre',240000);
  try {
    const sprigs:THREE.Object3D[]=[],obstacles:THREE.Mesh[]=[];
    built.group.traverse(object=>{
      if(object.name==='forest-sprig'||object.name==='forest-moss')sprigs.push(object);
      if(!(object instanceof THREE.Mesh))return;
      let parent:THREE.Object3D|null=object;
      while(parent){if(parent===built.wanderer)return;parent=parent.parent;}
      obstacles.push(object);
    });
    const anchors=sprigs.map(object=>object.position.clone());
    const route=built.route.getPoints(30).map(p=>p.toArray());
    const initial=built.group.getObjectByName('forest-leaf')!.rotation.clone();
    const ray=new THREE.Raycaster();
    for(const elapsed of [0,8.2,20,42,3600]) {
      built.animate!(elapsed,.016);built.group.updateMatrixWorld(true);
      sprigs.forEach((object,i)=>assert.ok(object.position.equals(anchors[i])));
      assert.deepEqual(built.route.getPoints(30).map(p=>p.toArray()),route);
      for(let i=0;i<=24;i++)for(const aspect of [.48,1.8])for(const overview of [0,1]) {
        const p=built.route.getPoint(i/24),pose=built.cameraPose!(p,aspect,overview);
        for(const height of [.3,1.2,2.35]) {
          const d=p.clone().add(new THREE.Vector3(0,height,0)).sub(pose.position);
          ray.set(pose.position,d.clone().normalize());ray.far=d.length()-.08;
          assert.equal(ray.intersectObjects(obstacles,false).length,0,`Skjult ved ${i/24}, tid ${elapsed}`);
        }
      }
    }
    assert.notDeepEqual(built.group.getObjectByName('forest-leaf')!.rotation.toArray(),initial.toArray());
  } finally {disposeWorld(built.group);}
});
