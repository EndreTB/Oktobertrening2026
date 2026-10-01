import * as THREE from 'three';
import { JourneyWorld } from './worlds';
import { buildStarTree } from './star-tree';
import { naturalTrail, sculptedTerrain, trailLanterns, walkway } from './landscape-details';

export interface RealmComposition {
  points: THREE.Vector3[];
  overview: THREE.Vector3;
  lookAt: THREE.Vector3;
  followOffset: THREE.Vector3;
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
function ribbon(parent:THREE.Object3D, points:THREE.Vector3[], width:number, material:THREE.Material) {
  const curve=new THREE.CatmullRomCurve3(points),vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<=160;i++) {
    const t=i/160,p=curve.getPoint(t),direction=curve.getTangent(t),side=v(direction.z,0,-direction.x).normalize().multiplyScalar(width/2);
    vertices.push(...p.clone().add(side).toArray(),...p.clone().sub(side).toArray());
    if(i<160){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const object=add(parent,geometry,material,[0,0,0]);object.material.side=THREE.DoubleSide;return object;
}
function rock(parent:THREE.Object3D,p:Position,scale:Position,material:THREE.Material,seed=0) {
  const object=add(parent,new THREE.IcosahedronGeometry(1,2),material,p);object.scale.set(...scale);object.rotation.y=seed;return object;
}
function glow(parent:THREE.Object3D,p:Position,color:string,size:number) {
  const textureGeometry=new THREE.SphereGeometry(size,16,12);
  const core=add(parent,textureGeometry,new THREE.MeshBasicMaterial({color}),p);
  const aura=add(core,new THREE.SphereGeometry(size*1.5,16,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.09,depthWrite:false}),[0,0,0]);
  return core;
}
function leaf(parent:THREE.Object3D,p:Position,size:number,angle:number,material:THREE.Material) {
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(size*.75,size*.4,0,size*1.8);shape.quadraticCurveTo(-size*.75,size*.4,0,0);
  const object=add(parent,new THREE.ShapeGeometry(shape,8),material,p);object.rotation.set(-Math.PI/2+.2,0,angle);return object;
}

export function buildRealm(id:JourneyWorld['id'],group:THREE.Group,floaters:THREE.Object3D[],random:()=>number): RealmComposition | null {
  if(id==='forest') {
    // A living cathedral, supported by roots instead of a rectangular plinth.
    const bark=mat('#604935'),root=mat('#70543a'),moss=mat('#386744'),fern=mat('#56a76b'),mint=mat('#83f1c5',.3),amber=mat('#ffc788',.4);
    const floor=(x:number,z:number)=>.35+Math.exp(-(x*x+z*z)/80)*.55+Math.sin(x*.45)*Math.cos(z*.4)*.15;
    sculptedTerrain(group,13.5,4,floor,['#244b3d','#67926c','#203f36']);
    // One giant tree, with small plants establishing its scale.
    const fernMat=new THREE.MeshStandardMaterial({color:'#537f58',side:THREE.DoubleSide,roughness:.8});
    for(let i=0;i<10;i++){
      const a=i*2.4,r=5+random()*6,x=Math.cos(a)*r,z=Math.sin(a)*r,y=floor(x,z);
      for(let j=0;j<4;j++)leaf(group,[x,y,z],.5+random()*.6,j*Math.PI/2+a,fernMat);
    }
    for(let i=0;i<7;i++) {
      const angle=i/7*Math.PI*2;
      tube(group,[v(0,2,-2),v(Math.cos(angle)*4,1.2,Math.sin(angle)*3-2),v(Math.cos(angle)*8,floor(Math.cos(angle)*8,Math.sin(angle)*6),Math.sin(angle)*6)],.28,root,24);
    }
    const trunkPath=[v(0,0,-2),v(-1,5,-2),v(.4,10,-3),v(-.6,15,-3),v(1,20,-4)];
    tube(group,trunkPath,1.8,bark);
    // Vertical bark strands keep the oversized trunk readable in close-ups.
    for(let i=0;i<11;i++) {
      const a=i/11*Math.PI*2;
      tube(group,trunkPath.map(p=>p.clone().add(v(Math.cos(a)*1.65,0,Math.sin(a)*1.65))),.075,root,35);
    }
    for(let i=0;i<8;i++) {
      const a=i*2.4,y=10+i*.95,end=v(Math.cos(a)*7,y+3,-3+Math.sin(a)*5);
      tube(group,[v(0,y,-3),v(end.x*.55,y+1.5,end.z),end],.4,bark,25);
      for(let j=0;j<4;j++)rock(group,[end.x+(random()-.5)*3,end.y+random(),end.z+(random()-.5)*3],[2.7,1.2,2],i%2?moss:fern,i);
    }
    // Switchbacks across the face of the tree, with branch balconies at each turn.
    const balconies=[v(-7,1.7,6),v(6,5,4),v(-6,9,4),v(5,13,2),v(2,17,0)];
    const path=new THREE.CatmullRomCurve3([
      balconies[0],v(-2,3,6.5),balconies[1],v(3,7,3.5),balconies[2],
      v(-5,11,2.5),balconies[3],v(6,15,1),balconies[4]
    ]);
    const points=path.getPoints(160);
    walkway(group,path,1.8,'#876746','#b7a377',true);
    for(const p of balconies) {
      tube(group,[v(0,Math.max(0,p.y-3),-2),p.clone().add(v(0,-1,-.6)),p.clone().add(v(0,-.35,0))],.3,bark,30);
      add(group,new THREE.CylinderGeometry(1.55,1.3,.35,10),root,[p.x,p.y-.3,p.z]);
      rock(group,[p.x,p.y-.5,p.z],[1.7,.4,1.5],moss);
    }
    // Handrails follow the bends; crosswise planks make this a woodland boardwalk.
    trailLanterns(group,path,1.8,'#ffda9f',9);
    for(let i=0;i<7;i++) {
      const a=random()*Math.PI*2,r=3+random()*6,x=Math.cos(a)*r,z=Math.sin(a)*r,y=.8;
      const h=.6+random()*2.2;
      add(group,new THREE.CylinderGeometry(.1,.24,h,8),amber,[x,y+h/2,z]);
      const cap=add(group,new THREE.SphereGeometry(h*.62,16,8,0,Math.PI*2,0,Math.PI/2),i%3?mint:amber,[x,y+h,z]);cap.scale.y=.45;
      if(i%2===0)leaf(group,[x,y,z],1.4,a,new THREE.MeshStandardMaterial({color:'#418960',side:THREE.DoubleSide,roughness:1}));
    }
    const end=points.at(-1)!;
    const droplet=add(group,new THREE.SphereGeometry(.65,20,16),new THREE.MeshStandardMaterial({color:'#baffea',metalness:.25,roughness:.08,emissive:'#73daba',emissiveIntensity:.3}),[end.x,end.y+3,end.z]);droplet.scale.y=1.5;floaters.push(droplet);
    return {points,overview:v(29,25,43),lookAt:v(0,8,-2),followOffset:v(8,5,11)};
  }
  if(id==='body') {
    // An open anatomical fantasy: a winding artery canyon, suspended above branching vessels.
    const ridge=mat('#dd6178'),vein=mat('#5b386e'),cell=mat('#e94b5b',.14);
    const spine=Array.from({length:81},(_,i)=>{const t=i/80;return v(Math.sin(t*Math.PI*2)*5,1+t*5,12-t*26);});
    const center=new THREE.CatmullRomCurve3(spine);
    const vertices:number[]=[],indices:number[]=[];
    for(let i=0;i<=100;i++) {
      const p=center.getPoint(i/100);
      for(let j=0;j<=24;j++){const a=Math.PI+j/24*Math.PI;vertices.push(p.x+Math.cos(a)*5,p.y+3+Math.sin(a)*4.5,p.z);}
      if(i<100)for(let j=0;j<24;j++){const n=i*25+j;indices.push(n,n+1,n+25,n+1,n+26,n+25);}
    }
    const membrane=new THREE.BufferGeometry();membrane.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));membrane.setIndex(indices);membrane.computeVertexNormals();
    const wallMat=new THREE.MeshPhysicalMaterial({color:'#863a54',side:THREE.DoubleSide,roughness:.4,clearcoat:.35,clearcoatRoughness:.4});
    add(group,membrane,wallMat,[0,0,0]);
    for(const s of [-1,1])tube(group,spine.map(p=>p.clone().add(v(s*5,3,0))),.28,ridge,100);
    for(let i=0;i<12;i++) {
      const p=center.getPoint(i/11);
      const ring=add(group,new THREE.TorusGeometry(4.9,.1,7,48,Math.PI),ridge,[p.x,p.y+3,p.z]);ring.rotation.z=Math.PI;
    }
    // Longitudinal vessel walls and a lower plasma channel bind the scene together.
    for(const side of [-1,1])for(let j=0;j<3;j++){
      tube(group,spine.map((p,i)=>p.clone().add(v(side*(3.3+j*.48),.15+j*.55+Math.sin(i*.16+j)*.08,0))),.055,j%2?vein:ridge,100);
    }
    ribbon(group,spine.map(p=>p.clone().add(v(0,-1.35,0))),4.9,new THREE.MeshPhysicalMaterial({color:'#c34f68',metalness:.25,roughness:.2,clearcoat:.65}));
    // A sculpted heart at the head of the river, using a true heart silhouette.
    const heartShape=new THREE.Shape();heartShape.moveTo(0,-3);heartShape.bezierCurveTo(-6,1,-5,6,-1.5,5);heartShape.bezierCurveTo(-.4,5,0,4,0,3.6);heartShape.bezierCurveTo(0,4,1,5,2.2,5);heartShape.bezierCurveTo(6,5,6,1,0,-3);
    const heartGeo=new THREE.ExtrudeGeometry(heartShape,{depth:1.9,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.5,bevelThickness:.7,curveSegments:18});
    const heart=add(group,heartGeo,mat('#b93654',.08),[0,10,-15]);heart.rotation.y=.15;heart.scale.setScalar(1);heart.userData['pulse']=true;heart.userData['baseScale']=1;floaters.push(heart);
    tube(group,[v(1,13,-14),v(-1,17,-13),v(3,17,-15),v(5,13,-16)],.65,ridge,35);
    for(let i=0;i<6;i++) {
      const p=center.getPoint(i/6);
      const blood=add(group,new THREE.TorusGeometry(.72,.27,12,20),cell,[p.x+1,p.y+2,p.z]);blood.rotation.set(.9,.2,i);floaters.push(blood);
    }
    const points=spine.map((p,i)=>p.clone().add(v(Math.sin(i*.1)*1.1,-1,0)));
    const bloodRoute=new THREE.CatmullRomCurve3(points);
    naturalTrail(group,bloodRoute,1.85,'#d58991');
    for(let i=0;i<14;i++){const p=center.getPoint(random());glow(group,[p.x+(random()-.5)*6,p.y+2+random()*3,p.z],'#ffb99e',.07);}
    return {points,overview:v(27,25,40),lookAt:v(-1,6,-2),followOffset:v(7,5,11)};
  }
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
