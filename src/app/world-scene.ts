import { TEAM_TARGET } from './participants';
import * as THREE from 'three';
import { LIGHT_CYCLE, JourneyWorld } from './worlds';
import { buildRealm, type RealmComposition } from './realm-environments';
import { buildEndlessUniverse } from './endless-universe';
import { naturalTrail, sculptedTerrain } from './landscape-details';

export interface WorldScene {
  group: THREE.Group;
  route: THREE.CatmullRomCurve3;
  trail: THREE.BufferGeometry;
  wanderer: THREE.Group;
  limbs: THREE.Group[];
  portal: THREE.Group;
  floaters: THREE.Object3D[];
  particles: THREE.Points;
  overview: THREE.Vector3;
  lookAt: THREE.Vector3;
  followOffset: THREE.Vector3;
  cameraPose?: RealmComposition['cameraPose'];
  animate?: RealmComposition['animate'];
  traversal?: RealmComposition['traversal'];
}
const material = (color: THREE.ColorRepresentation, glow = 0) => new THREE.MeshStandardMaterial({ color, roughness: .72, emissive: color, emissiveIntensity: glow });
function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, position: [number, number, number], parent: THREE.Object3D) {
  const object = new THREE.Mesh(geometry, mat); object.position.set(...position); object.castShadow=true;object.receiveShadow=true;parent.add(object); return object;
}
export function disposeWorld(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(object => {
    if(object instanceof THREE.InstancedMesh)object.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
export function createWorld(info: JourneyWorld, person: string, steps = 0): WorldScene {
  const group = new THREE.Group(), floaters: THREE.Object3D[] = [];
  const lightEra = Math.max(0, Math.floor((steps - TEAM_TARGET) / LIGHT_CYCLE));
  let seed = 46 + lightEra * 187;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const mountain = info.id === 'mountain';
  const lightHeight=(x:number,z:number)=>.5+8*Math.exp(-(x*x+(z+9)**2)/85)+.12*Math.sin(x*.4)*Math.cos(z*.3);
  const height = (x: number, z: number) => {
    if (!mountain) return 1.4 + Math.sin(x * .28) * .65 + Math.cos(z * .36) * .55;
    const peak = (px:number,pz:number,h:number,s:number) => h * Math.exp(-((x-px)**2 + (z-pz)**2)/s);
    const h=.2 + peak(3,-7,12,22) + peak(-5,-2,3,30) + peak(8,0,2,18) + .16 * Math.sin(x*1.8) * Math.cos(z*1.4);
    const tarn=Math.hypot((x+7)/3.5,(z-4)/2.3);
    return THREE.MathUtils.lerp(.1,h,THREE.MathUtils.smoothstep(tarn,.8,1.2));
  };
  const routeXZ = mountain ? [[-10,10],[-6,8],[-4,5],[1,4],[4,1],[0,-1],[-1,-3],[2,-5],[3,-7]] : [[-11,9],[-7,6],[-2,7],[3,4],[0,0],[-4,-3],[1,-5],[6,-4],[9,-8]];
  const initial = new THREE.CatmullRomCurve3(routeXZ.map(([x,z])=>new THREE.Vector3(x,height(x,z)+.2,z)));
  const points = initial.getPoints(200).map(p=>new THREE.Vector3(p.x,height(p.x,p.z)+.18,p.z));
  const composition=info.id==='light'?buildEndlessUniverse(group,lightEra):buildRealm(info.id,group,floaters,random);
  if(composition)points.splice(0,points.length,...composition.points);
  // Equal-distance samples keep the walking pace steady through bends and climbs.
  const route = new THREE.CatmullRomCurve3(new THREE.CatmullRomCurve3(points).getSpacedPoints(320));
  // Cut a shallow bench into steep slopes, so the full width of the path is walkable.
  const groundHeight=(x:number,z:number)=>{
    const base=mountain?height(x,z):lightHeight(x,z);
    let nearest=Infinity,pathHeight=base;
    for(const p of points){const distance=(p.x-x)**2+(p.z-z)**2;if(distance<nearest){nearest=distance;pathHeight=p.y-.18;}}
    const width=mountain?.7:1.05;
    return THREE.MathUtils.lerp(pathHeight,base,THREE.MathUtils.smoothstep(Math.sqrt(nearest),width,width+.8));
  };
  if(info.id!=='cosmos'&&info.id!=='light')mesh(new THREE.TubeGeometry(route,240,.018,7,false),material(info.color,.12),[0,0,0],group);
  const trail = new THREE.TubeGeometry(route,240,.045,7,false);
  const progressTrail=mesh(trail,new THREE.MeshBasicMaterial({color:info.color}),[0,0,0],group);
  progressTrail.visible=info.id!=='cosmos'&&info.id!=='light';
  const awayFromPath = (x:number,z:number,margin=1.3) => !points.some(p=>Math.hypot(p.x-x,p.z-z)<margin);

  if (mountain) {
    sculptedTerrain(group,17,4.5,groundHeight,['#526957','#e3dcc8','#293e3c']);
    naturalTrail(group,route,1.2,'#b6ad8a');
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(.62,2.2,9),material('#254637'),125);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(.46,1.6,9),material('#365f4c'),125);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075,.11,.9,6),material('#71573a'),125);
    const dummy = new THREE.Object3D();
    for(let i=0;i<125;i++) {
      let x=0,z=0,h=0;
      for(let t=0;t<100;t++){x=(random()-.5)*29;z=(random()-.5)*24;h=height(x,z);if(h<5.8&&Math.hypot(x,z/.85)<15.8&&awayFromPath(x,z,1.3))break;}
      const s=.55+random()*.75;dummy.position.set(x,h+s,z);dummy.scale.setScalar(s);dummy.rotation.y=random()*6;dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);
      dummy.position.y=h+s*2;dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
      dummy.position.y=h+.25;dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      trees.setColorAt(i,new THREE.Color().setHSL(.35+random()*.06,.22+random()*.15,.18+random()*.12));
    }
    trees.castShadow=true;crowns.castShadow=true;group.add(trees,crowns,trunks);
    // The tarn and one small cabin establish the scale of the climb.
    const lake=mesh(new THREE.CircleGeometry(2.3,64),new THREE.MeshStandardMaterial({color:'#447b7c',metalness:.55,roughness:.22}),[-7,.32,4],group);lake.rotation.x=-Math.PI/2;lake.scale.set(1.5,1,1);
    const stoneMat=material('#89917e'),stoneGeo=new THREE.IcosahedronGeometry(1,1);
    for(let i=0;i<25;i++){
      const a=i/25*Math.PI*2,x=-7+Math.cos(a)*3.5,z=4+Math.sin(a)*2.4;
      if(!awayFromPath(x,z,1))continue;
      const stone=mesh(stoneGeo,stoneMat,[x,height(x,z)+.1,z],group);stone.scale.set(.3+random()*.25,.25,.4);stone.rotation.y=a;
    }
    const summit=route.getPoint(1);
    mesh(new THREE.CylinderGeometry(1.7,1.9,.35,24),stoneMat,[summit.x,summit.y-.3,summit.z],group);
    const cabin=new THREE.Group();cabin.position.set(-9,height(-9,7),7);group.add(cabin);
    mesh(new THREE.BoxGeometry(1.7,1.35,1.5),material('#805a40'),[0,.7,0],cabin);
    const roof=mesh(new THREE.CylinderGeometry(0,1.5,.85,4),material('#354b48'),[0,1.75,0],cabin);roof.rotation.y=Math.PI/4;
    mesh(new THREE.PlaneGeometry(.43,.65),new THREE.MeshBasicMaterial({color:'#ffda97'}),[0,.6,.76],cabin);
  }
  // A small, readable hiker: boots, swinging limbs, jacket, backpack and bobble hat.
  const wanderer=new THREE.Group(), limbs: THREE.Group[]=[];
  const jacket=material(person==='Stine'?'#e89aab':person==='Lars'?'#80c7e3':person==='Cathrine'?'#bd9ce3':'#e9ac69');
  const boots=material('#243448'), skin=material('#f0d2b1'), hat=material('#f5e9b4');
  mesh(new THREE.CapsuleGeometry(.28,.44,4,10),jacket,[0,1.03,0],wanderer);
  mesh(new THREE.SphereGeometry(.29,14,10),skin,[0,1.65,0],wanderer);
  if(info.id==='body') {
    const helmet=mesh(new THREE.SphereGeometry(.43,24,16),new THREE.MeshPhysicalMaterial({color:'#d0faff',transparent:true,opacity:.18,roughness:.08,metalness:.1,depthWrite:false}),[0,1.67,0],wanderer);helmet.castShadow=false;
    const collar=mesh(new THREE.TorusGeometry(.3,.06,8,24),material('#f1d49b'),[0,1.4,0],wanderer);collar.rotation.x=Math.PI/2;
    for(const x of [-.16,.16])mesh(new THREE.CapsuleGeometry(.12,.38,4,10),material('#d7e4bf'),[x,1.08,-.35],wanderer);
    mesh(new THREE.BoxGeometry(.19,.11,.12),boots,[0,1.5,.3],wanderer);
  } else {
    mesh(new THREE.SphereGeometry(.31,12,8,0,Math.PI*2,0,Math.PI/2),hat,[0,1.73,0],wanderer);
    mesh(new THREE.SphereGeometry(.1,8,6),jacket,[0,2.06,0],wanderer);
    mesh(new THREE.BoxGeometry(.43,.56,.27),material('#718c66'),[0,1.14,-.29],wanderer);
  }
  for(const side of [-1,1]) {
    const leg=new THREE.Group();leg.position.set(side*.17,.77,0);mesh(new THREE.CapsuleGeometry(.1,.37,3,7),boots,[0,-.26,0],leg);mesh(new THREE.BoxGeometry(.23,.16,.35),boots,[0,-.54,.07],leg);wanderer.add(leg);limbs.push(leg);
    const arm=new THREE.Group();arm.position.set(side*.36,1.34,0);mesh(new THREE.CapsuleGeometry(.08,.32,3,7),jacket,[0,-.24,0],arm);mesh(new THREE.SphereGeometry(.085,8,6),skin,[0,-.48,0],arm);wanderer.add(arm);limbs.push(arm);
  }
  for(const x of [-.1,.1])mesh(new THREE.SphereGeometry(.035,6,6),boots,[x,1.66,.27],wanderer);
  wanderer.scale.setScalar(info.id==='body'?.82:info.id==='micro'?.65:info.id==='cosmos'?.75:1.15);group.add(wanderer);
  wanderer.traverse(object=>{if(object instanceof THREE.Mesh)object.castShadow=true;});
  const halo=mesh(new THREE.TorusGeometry(.55,.025,5,30),new THREE.MeshBasicMaterial({color:info.color}),[0,.03,0],wanderer);halo.rotation.x=-Math.PI/2;
  const portal=new THREE.Group();portal.position.copy(route.getPoint(1));portal.position.y+=1.7;
  // Place the gateway beside the landing, opposite the orbiting camera's shoulder.
  if(info.id==='forest') {
    const inward=new THREE.Vector3(-portal.position.x,0,-6.8-portal.position.z).normalize();
    portal.position.addScaledVector(inward,1.2).addScaledVector(new THREE.Vector3(-inward.z,0,inward.x),2.7);
    portal.rotation.y=Math.atan2(-inward.x,-inward.z);
  }
  if(info.id==='body')portal.position.z-=2;
  mesh(new THREE.TorusGeometry(1.4,.11,9,48),material(info.color,1),[0,0,0],portal);
  const veil=mesh(new THREE.CircleGeometry(1.3,48),new THREE.MeshBasicMaterial({color:info.color,transparent:true,opacity:.14,side:THREE.DoubleSide}),[0,0,0],portal);veil.rotation.y=.05;
  portal.visible=info.id!=='light';
  group.add(portal);
  const moteGeo=new THREE.BufferGeometry(), motes:number[]=[];
  const moteCount={mountain:8,forest:22,body:14,micro:18,cosmos:0,light:0}[info.id];
  for(let i=0;i<moteCount;i++)motes.push((random()-.5)*35,random()*14+1,(random()-.5)*27);
  moteGeo.setAttribute('position',new THREE.Float32BufferAttribute(motes,3));
  const particles=new THREE.Points(moteGeo,new THREE.PointsMaterial({color:info.color,size:info.id==='cosmos'?.12:.075,transparent:true,opacity:.7}));group.add(particles);
  floaters.forEach(object=>object.userData['baseY']=object.position.y);
  return {group,route,trail,wanderer,limbs,portal,floaters,particles,cameraPose:composition?.cameraPose,animate:composition?.animate,traversal:composition?.traversal,overview:composition?.overview??new THREE.Vector3(25,24,35),lookAt:composition?.lookAt??new THREE.Vector3(0,info.id==='light'?5:4,-1),followOffset:composition?.followOffset??new THREE.Vector3(8,6,11)};
}
