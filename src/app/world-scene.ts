import * as THREE from 'three';
import { JourneyWorld } from './worlds';
import { buildRealm } from './realm-environments';

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
}
const material = (color: THREE.ColorRepresentation, glow = 0) => new THREE.MeshStandardMaterial({ color, roughness: .8, flatShading: true, emissive: color, emissiveIntensity: glow });
function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, position: [number, number, number], parent: THREE.Object3D) {
  const object = new THREE.Mesh(geometry, mat); object.position.set(...position); parent.add(object); return object;
}
function line(points: THREE.Vector3[], radius: number, mat: THREE.Material, parent: THREE.Object3D) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, 50, radius, 6, false), mat, [0,0,0], parent);
}
export function disposeWorld(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
export function createWorld(info: JourneyWorld, person: string, steps = 0): WorldScene {
  const group = new THREE.Group(), floaters: THREE.Object3D[] = [];
  const lightEra = Math.max(0, Math.floor((steps - 930000) / 180000));
  const lightGlints = Math.max(0, Math.floor((steps - 930000) / 50000));
  let seed = 46 + lightEra * 187;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const mountain = info.id === 'mountain';
  const height = (x: number, z: number) => {
    if (!mountain) return 1.4 + Math.sin(x * .28) * .65 + Math.cos(z * .36) * .55;
    const peak = (px:number,pz:number,h:number,s:number) => h * Math.exp(-((x-px)**2 + (z-pz)**2)/s);
    return .2 + peak(-4,-5,10,15) + peak(3,-7,12,13) + peak(8,-1,6,12) + peak(-9,0,4,15) + .28 * Math.sin(x*1.8) * Math.cos(z*1.4);
  };
  const palettes = { mountain: ['#637b55','#8b9276','#e1d8bc'], forest: ['#1d6650','#639872','#c5e69f'], body: ['#81384c','#b76378','#f5b1a2'], micro: ['#373873','#6860a6','#b3c3e6'], cosmos: ['#263862','#606187','#c9bdd6'], light: ['#a9a2b6','#e1d9d9','#fff3d5'] };
  const palette = palettes[info.id];
  const ground = new THREE.PlaneGeometry(29,24,64,54); ground.rotateX(-Math.PI/2);
  const positions = ground.attributes['position'], colors: number[] = [];
  const low = new THREE.Color(palette[0]), mid = new THREE.Color(palette[1]), high = new THREE.Color(palette[2]);
  for (let i=0;i<positions.count;i++) {
    const x=positions.getX(i), z=positions.getZ(i), h=height(x,z);
    positions.setY(i,h);
    const c = h>6 ? mid.clone().lerp(high,Math.min(1,(h-6)/4)) : low.clone().lerp(mid,Math.max(0,h/(mountain?9:3)));
    colors.push(c.r,c.g,c.b);
  }
  ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); ground.computeVertexNormals();
  const groundMesh = mesh(ground,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}),[0,0,0],group);
  const baseMesh = mesh(new THREE.BoxGeometry(29,2.1,24),material(palette[0]),[0,-1.1,0],group);
  const lowerMesh = mesh(new THREE.BoxGeometry(28.6,.45,23.6),material(info.background),[0,-2.15,0],group);
  const routeXZ = mountain ? [[-10,10],[-6,8],[-4,5],[1,4],[4,1],[0,-1],[-1,-3],[2,-5],[3,-7]] : [[-11,9],[-7,6],[-2,7],[3,4],[0,0],[-4,-3],[1,-5],[6,-4],[9,-8]];
  const initial = new THREE.CatmullRomCurve3(routeXZ.map(([x,z])=>new THREE.Vector3(x,height(x,z)+.2,z)));
  const points = initial.getPoints(200).map(p=>new THREE.Vector3(p.x,height(p.x,p.z)+.18,p.z));
  if (!mountain) { groundMesh.visible=false; baseMesh.visible=false; lowerMesh.visible=false; }
  const composition=buildRealm(info.id,group,floaters,random);
  if(composition)points.splice(0,points.length,...composition.points);
  if (info.id === 'light') {
    groundMesh.visible=false; baseMesh.visible=false; lowerMesh.visible=false;
    points.splice(0,points.length,...Array.from({length:201},(_,i)=>{const t=i/200,a=t*Math.PI*(2.2+(lightEra%3)*.3),r=8+Math.sin(t*9+lightEra)*1.3;return new THREE.Vector3(Math.sin(a)*r, t*12, Math.cos(a)*r);}));
  }
  const route = new THREE.CatmullRomCurve3(points);
  mesh(new THREE.TubeGeometry(route,240,.13,7,false),material(info.color,.3),[0,0,0],group);
  const trail = new THREE.TubeGeometry(route,240,.18,7,false);
  mesh(trail,new THREE.MeshBasicMaterial({color:info.color}),[0,0,0],group);
  const awayFromPath = (x:number,z:number,margin=1.3) => !points.some(p=>Math.hypot(p.x-x,p.z-z)<margin);

  if (mountain) {
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(.62,2.2,5),material('#254637'),210);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075,.11,.9,4),material('#71573a'),210);
    const dummy = new THREE.Object3D();
    for(let i=0;i<210;i++) {
      let x=0,z=0,h=0;
      for(let t=0;t<50;t++){x=(random()-.5)*27;z=(random()-.5)*22;h=height(x,z);if(h<5.8&&awayFromPath(x,z,.9))break;}
      const s=.55+random()*.75;dummy.position.set(x,h+s,z);dummy.scale.setScalar(s);dummy.rotation.y=random()*6;dummy.updateMatrix();trees.setMatrixAt(i,dummy.matrix);
      dummy.position.y=h+.25;dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      trees.setColorAt(i,new THREE.Color().setHSL(.35+random()*.06,.22+random()*.15,.18+random()*.12));
    }
    group.add(trees,trunks);
  }
  if (info.id==='light') {
    const ivory=material('#f4e6d1',.12), gold=material('#fff0c4',.6);
    const cloudMaterial=new THREE.MeshStandardMaterial({color:'#ded9ed',transparent:true,opacity:.38,depthWrite:false,flatShading:true,roughness:1});
    for(let i=0;i<80;i++) {
      const t=i/80,p=route.getPoint(t),tangent=route.getTangent(t);
      const step=mesh(new THREE.BoxGeometry(1.9,.18,.62),i%8===0?gold:ivory,[p.x,p.y-.18,p.z],group);
      step.rotation.y=Math.atan2(tangent.x,tangent.z);
    }
    for(let i=0;i<16;i++) {
      const x=(random()-.5)*32,z=(random()-.5)*27,y=-3+random()*2;
      const cloud=new THREE.Group(); cloud.position.set(x,y,z);
      for(let j=0;j<3;j++){const wisp=mesh(new THREE.IcosahedronGeometry(1.4+random(),1),cloudMaterial,[j*1.2,random()*.4,0],cloud);wisp.scale.y=.35;}
      group.add(cloud);floaters.push(cloud);
      const lantern=mesh(new THREE.OctahedronGeometry(.28),gold,[x,y+2,z],group);floaters.push(lantern);
    }
    for(let i=0;i<Math.min(48,lightGlints+3);i++){const glint=mesh(new THREE.OctahedronGeometry(.15+random()*.2),gold,[(random()-.5)*32,4+random()*14,(random()-.5)*28],group);floaters.push(glint);}
    const light=mesh(new THREE.SphereGeometry(2.8,24,16),new THREE.MeshBasicMaterial({color:'#fff2cc'}),[-2,10,-14],group);
    const aura=mesh(new THREE.TorusGeometry(3.7,.045,6,80),gold,[0,0,0],light);aura.rotation.x=.3;
    const aura2=mesh(new THREE.TorusGeometry(4.6,.035,6,80),gold,[0,0,0],light);aura2.rotation.y=.4;
  }

  // A small, readable hiker: boots, swinging limbs, jacket, backpack and bobble hat.
  const wanderer=new THREE.Group(), limbs: THREE.Group[]=[];
  const jacket=material(person==='Stine'?'#e89aab':person==='Lars'?'#80c7e3':'#e9ac69');
  const boots=material('#243448'), skin=material('#f0d2b1'), hat=material('#f5e9b4');
  mesh(new THREE.CapsuleGeometry(.28,.44,4,10),jacket,[0,1.03,0],wanderer);
  mesh(new THREE.SphereGeometry(.29,14,10),skin,[0,1.65,0],wanderer);
  mesh(new THREE.SphereGeometry(.31,12,8,0,Math.PI*2,0,Math.PI/2),hat,[0,1.73,0],wanderer);
  mesh(new THREE.SphereGeometry(.1,8,6),jacket,[0,2.06,0],wanderer);
  mesh(new THREE.BoxGeometry(.43,.56,.27),material('#718c66'),[0,1.14,-.29],wanderer);
  for(const side of [-1,1]) {
    const leg=new THREE.Group();leg.position.set(side*.17,.77,0);mesh(new THREE.CapsuleGeometry(.1,.37,3,7),boots,[0,-.26,0],leg);mesh(new THREE.BoxGeometry(.23,.16,.35),boots,[0,-.54,.07],leg);wanderer.add(leg);limbs.push(leg);
    const arm=new THREE.Group();arm.position.set(side*.36,1.34,0);mesh(new THREE.CapsuleGeometry(.08,.32,3,7),jacket,[0,-.24,0],arm);mesh(new THREE.SphereGeometry(.085,8,6),skin,[0,-.48,0],arm);wanderer.add(arm);limbs.push(arm);
  }
  for(const x of [-.1,.1])mesh(new THREE.SphereGeometry(.035,6,6),boots,[x,1.66,.27],wanderer);
  wanderer.scale.setScalar(1.15);group.add(wanderer);
  const halo=mesh(new THREE.TorusGeometry(.55,.025,5,30),new THREE.MeshBasicMaterial({color:info.color}),[0,.03,0],wanderer);halo.rotation.x=-Math.PI/2;
  const portal=new THREE.Group();portal.position.copy(route.getPoint(1));portal.position.y+=1.7;
  mesh(new THREE.TorusGeometry(1.4,.11,9,48),material(info.color,1),[0,0,0],portal);
  const veil=mesh(new THREE.CircleGeometry(1.3,48),new THREE.MeshBasicMaterial({color:info.color,transparent:true,opacity:.14,side:THREE.DoubleSide}),[0,0,0],portal);veil.rotation.y=.05;
  group.add(portal);
  const moteGeo=new THREE.BufferGeometry(), motes:number[]=[];
  for(let i=0;i<100;i++)motes.push((random()-.5)*35,random()*14+1,(random()-.5)*27);
  moteGeo.setAttribute('position',new THREE.Float32BufferAttribute(motes,3));
  const particles=new THREE.Points(moteGeo,new THREE.PointsMaterial({color:info.color,size:info.id==='cosmos'?.12:.075,transparent:true,opacity:.7}));group.add(particles);
  floaters.forEach(object=>object.userData['baseY']=object.position.y);
  return {group,route,trail,wanderer,limbs,portal,floaters,particles,overview:composition?.overview??new THREE.Vector3(32,31,44),lookAt:composition?.lookAt??new THREE.Vector3(0,4,0),followOffset:composition?.followOffset??new THREE.Vector3(10,8,13)};
}
