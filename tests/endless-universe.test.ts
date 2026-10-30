import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld,disposeWorld } from '../src/app/world-scene';
import { WORLDS,LIGHT_CYCLE } from '../src/app/worlds';

test('universet fortsetter sømløst uten portal, med fotfeste og synlig turfigur',()=>{
  const world=WORLDS[5],first=createWorld(world,'Endre',world.start),next=createWorld(world,'Endre',world.start+LIGHT_CYCLE);
  try {
    assert.equal(first.portal.visible,false);
    assert.ok(first.route.getPoint(1).distanceTo(next.route.getPoint(0))<1e-8);
    assert.ok(first.route.getTangent(1).dot(next.route.getTangent(0))>.999);
    const walkway=first.group.getObjectByName('endless-walkway')!;
    first.group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster();
    for(let i=0;i<=60;i++){
      const p=first.route.getPoint(i/60);
      if(i)assert.ok(p.y>first.route.getPoint((i-1)/60).y);
      ray.set(p.clone().add(new THREE.Vector3(0,.15,0)),new THREE.Vector3(0,-1,0));ray.far=.4;
      assert.ok(ray.intersectObject(walkway).length,`Mangler fotfeste ved ${i/60}`);
      for(const aspect of [.48,1,1.8])for(const overview of [0,.5,1]){
        const camera=new THREE.PerspectiveCamera(39,aspect,.1,300),pose=first.cameraPose!(p,aspect,overview);
        camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
        for(const height of [0,2.4]){
          const screen=p.clone().add(new THREE.Vector3(0,height,0)).project(camera);
          assert.ok(Math.abs(screen.x)<.9&&Math.abs(screen.y)<.9&&screen.z<1,'Turfiguren skal være i bildet');
        }
      }
    }
    const bounds=new THREE.Box3().setFromObject(walkway);
    assert.ok(first.route.getPoint(0).y-bounds.min.y>300);
    assert.ok(bounds.max.y-first.route.getPoint(1).y>300);
  } finally {disposeWorld(first.group);disposeWorld(next.group);}
});
