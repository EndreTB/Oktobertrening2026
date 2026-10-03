import * as THREE from 'three';
import { JourneyWorld } from './worlds';
import { buildStarTree } from './star-tree';
import { naturalTrail } from './landscape-details';
import { buildGiantTree } from './giant-tree';
import { buildCoralReef } from './coral-reef';

export interface RealmComposition {
  points: THREE.Vector3[];
  overview: THREE.Vector3;
  lookAt: THREE.Vector3;
  followOffset: THREE.Vector3;
  animate?: (elapsed:number,dt:number) => void;
  cameraPose?: (point:THREE.Vector3,aspect:number,overview:number) => {position:THREE.Vector3;target:THREE.Vector3};
}
type Position = [number, number, number];
const v = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
const mat = (color:string, emissive=0) => new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:emissive,roughness:.65});
function add(parent:THREE.Object3D, geometry:THREE.BufferGeometry, material:THREE.Material, position:Position) {
  const object=new THREE.Mesh(geometry,material);object.position.set(...position);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}
function tube(parent:THREE.Object3D, points:THREE.Vector3[], radius:number, material:THREE.Material, segments=60) {
  return add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,8,false),material,[0,0,0]);
}
export function buildRealm(id:JourneyWorld['id'],group:THREE.Group,floaters:THREE.Object3D[],random:()=>number): RealmComposition | null {
  if(id==='forest') return buildGiantTree(group,floaters,random);
  if(id==='body') return buildCoralReef(group,random);
  if(id==='micro') {
    // The nucleus is the focal point; its enclosing membrane gives the walk context.
    const teal=mat('#7be4d7',.28),purple=mat('#9a65ce',.2),pink=mat('#ef9ed4',.3);
    const membrane=new THREE.MeshPhysicalMaterial({color:'#798dd7',transparent:true,opacity:.1,roughness:.24,metalness:.25,side:THREE.DoubleSide,depthWrite:false});
    add(group,new THREE.SphereGeometry(11,40,26,Math.PI*.22,Math.PI*1.4),membrane,[0,6,0]);
    const membraneEdge=add(group,new THREE.TorusGeometry(11,.035,6,96,Math.PI*1.45),teal,[0,6,0]);membraneEdge.rotation.set(.3,.1,0);
    const nucleus=add(group,new THREE.IcosahedronGeometry(3,3),new THREE.MeshStandardMaterial({color:'#ca82dc',emissive:'#9443ba',emissiveIntensity:.25,roughness:.3}),[-2,7,-3]);
    const nucleusRing=add(group,new THREE.TorusGeometry(3.5,.09,8,64),pink,[-2,7,-3]);nucleusRing.rotation.set(.8,.3,.2);
    // Nested membranes and connected filaments turn the cell into one explorable interior.
    const bowl=add(group,new THREE.SphereGeometry(10.7,48,24,0,Math.PI*2,Math.PI*.58,Math.PI*.42),new THREE.MeshPhysicalMaterial({color:'#4d5988',metalness:.25,roughness:.4,side:THREE.DoubleSide,transparent:true,opacity:.58}),[0,6,0]);bowl.castShadow=false;
    for(let i=0;i<5;i++){
      const a=i/5*Math.PI*2,end=v(Math.cos(a)*9,-.5,Math.sin(a)*8);
      tube(group,[v(-2,5,-3),v(Math.cos(a)*5,2,Math.sin(a)*4),end],.03,teal,40);
    }
    // Enter at the membrane and spiral inward to the nucleus, rather than past it.
    const points=new THREE.CatmullRomCurve3([
      v(8,-1,4),v(4,0,7),v(-2,1.5,7),v(-7,3,4),v(-7,5,-2),
      v(-3,6,-6),v(2,7,-4),v(2,6.5,0),v(-2,5.5,.8),
    ]).getPoints(160);
    const cellRoute=new THREE.CatmullRomCurve3(points);
    naturalTrail(group,cellRoute,1.65,'#959ac0');
    // Two membrane folds carry the path into the cell's central structure.
    for(const side of [-1,1])tube(group,points.map((p,i)=>{
      const d=cellRoute.getTangent(i/160);return p.clone().add(v(d.z,0,-d.x).normalize().multiplyScalar(side*.7)).add(v(0,-.18,0));
    }),.09,purple,160);
    for(let i=0;i<5;i++) {
      const a=i*2.4,x=Math.cos(a)*(i%2?10:5),z=Math.sin(a)*8,y=1+random()*10;
      const organism=new THREE.Group();organism.position.set(x,y,z);organism.rotation.set(random()*2,random()*2,random()*2);
      const skin=i%3?teal:purple;
      add(organism,new THREE.CapsuleGeometry(.55,1.1,6,12),skin,[0,0,0]);
      for(let j=0;j<5;j++){const k=j*1.25;tube(organism,[v(Math.cos(k)*.5,0,Math.sin(k)*.5),v(Math.cos(k),.3,Math.sin(k)),v(Math.cos(k)*1.3,.8,Math.sin(k)*1.3)],.04,skin,10);}
      add(organism,new THREE.SphereGeometry(.2,10,8),pink,[0,.2,.5]);group.add(organism);floaters.push(organism);
    }
    // Mitochondria with folded interior membranes.
    for(const p of [[6,4,-5],[-7,1,1]] as Position[]) {
      const organelle=new THREE.Group();organelle.position.set(...p);organelle.rotation.z=.7;
      const shell=add(organelle,new THREE.CapsuleGeometry(.7,1.7,6,12),mat('#efac81',.12),[0,0,0]);
      tube(organelle,Array.from({length:20},(_,i)=>v(Math.sin(i*1.3)*.45,-1.2+i*.13,.66)),.085,mat('#fff0a6',.4),35);group.add(organelle);floaters.push(organelle);
    }
    return {points,overview:v(24,20,35),lookAt:v(0,6,0),followOffset:v(8,5,11)};
  }
  if(id==='cosmos') return buildStarTree(group,random);
  return null;
}
