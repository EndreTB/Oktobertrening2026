import * as THREE from 'three';
import { JourneyWorld } from './worlds';
import { buildStarTree } from './star-tree';
import { buildClockwork } from './clockwork';
import { buildGiantTree } from './giant-tree';
import { buildCoralReef } from './coral-reef';

export interface RealmComposition {
  points: THREE.Vector3[];
  overview: THREE.Vector3;
  lookAt: THREE.Vector3;
  followOffset: THREE.Vector3;
  animate?: (elapsed:number,dt:number) => void;
  cameraPose?: (point:THREE.Vector3,aspect:number,overview:number,pointer?:{x:number;y:number}) => {position:THREE.Vector3;target:THREE.Vector3};
}
export function buildRealm(id:JourneyWorld['id'],group:THREE.Group,floaters:THREE.Object3D[],random:()=>number): RealmComposition | null {
  if(id==='forest') return buildGiantTree(group,floaters,random);
  if(id==='body') return buildCoralReef(group,random);
  if(id==='micro') return buildClockwork(group);
  if(id==='cosmos') return buildStarTree(group,random);
  return null;
}
