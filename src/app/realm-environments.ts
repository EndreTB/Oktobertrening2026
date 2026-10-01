import * as THREE from 'three';
import { JourneyWorld } from './worlds';

export interface RealmComposition {
  points: THREE.Vector3[];
  overview: THREE.Vector3;
  lookAt: THREE.Vector3;
  followOffset: THREE.Vector3;
}
type Position = [number, number, number];
const v = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
const mat = (color:string, emissive=0) => new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:emissive,roughness:.75,flatShading:true});
function add(parent:THREE.Object3D, geometry:THREE.BufferGeometry, material:THREE.Material, position:Position) {
  const object=new THREE.Mesh(geometry,material);object.position.set(...position);parent.add(object);return object;
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
  const object=add(parent,new THREE.IcosahedronGeometry(1,1),material,p);object.scale.set(...scale);object.rotation.y=seed;return object;
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
    rock(group,[0,-1,0],[11,3.5,9],bark);
    rock(group,[0,.7,0],[10.8,1.5,8.8],moss);
    for(let i=0;i<12;i++) {
      const angle=i/12*Math.PI*2;
      tube(group,[v(0,0,0),v(Math.cos(angle)*5,-2,Math.sin(angle)*4),v(Math.cos(angle)*8,-6-random()*2,Math.sin(angle)*6)],.24,root,24);
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
    ribbon(group,points.map(p=>p.clone().add(v(0,-.12,0))),1.65,root);
    for(const p of balconies) {
      tube(group,[v(0,Math.max(0,p.y-3),-2),p.clone().add(v(0,-1,-.6)),p.clone().add(v(0,-.35,0))],.3,bark,30);
      add(group,new THREE.CylinderGeometry(1.55,1.3,.35,10),root,[p.x,p.y-.3,p.z]);
      rock(group,[p.x,p.y-.5,p.z],[1.7,.4,1.5],moss);
    }
    // Handrails follow the bends; crosswise planks make this a woodland boardwalk.
    for(const side of [-1,1])tube(group,points.map((p,i)=>{
      const tangent=path.getTangent(i/160);
      return p.clone().add(v(tangent.z,0,-tangent.x).normalize().multiplyScalar(side*.78)).add(v(0,.6,0));
    }),.035,mint,160);
    for(let i=0;i<=90;i++) {
      const p=path.getPoint(i/90),tangent=path.getTangent(i/90);
      const plank=add(group,new THREE.BoxGeometry(1.75,.12,.25),i%5?root:bark,[p.x,p.y-.08,p.z]);plank.rotation.y=Math.atan2(tangent.x,tangent.z);
      if(i%7===0){
        const post=p.clone().add(v(tangent.z,0,-tangent.x).normalize().multiplyScalar(.78));
        tube(group,[post,post.clone().add(v(0,1,0))],.045,bark,8);
        glow(group,[post.x,post.y+1.1,post.z],'#fbd59c',.11);
      }
    }
    for(let i=0;i<22;i++) {
      const a=random()*Math.PI*2,r=3+random()*6,x=Math.cos(a)*r,z=Math.sin(a)*r,y=.8;
      const h=.6+random()*2.2;
      add(group,new THREE.CylinderGeometry(.1,.24,h,8),amber,[x,y+h/2,z]);
      const cap=add(group,new THREE.SphereGeometry(h*.62,16,8,0,Math.PI*2,0,Math.PI/2),i%3?mint:amber,[x,y+h,z]);cap.scale.y=.45;
      if(i%2===0)leaf(group,[x,y,z],1.4,a,new THREE.MeshStandardMaterial({color:'#418960',side:THREE.DoubleSide,roughness:1}));
    }
    // Tiny windows make the enormous tree feel inhabited.
    for(const y of [5,9,13]) {
      const window=add(group,new THREE.CircleGeometry(.45,24),new THREE.MeshBasicMaterial({color:'#ffd491'}),[.2,y,-.16]);
      add(window,new THREE.TorusGeometry(.46,.09,6,24),bark,[0,0,.01]);
    }
    const end=points.at(-1)!;
    const droplet=add(group,new THREE.SphereGeometry(.65,20,16),new THREE.MeshStandardMaterial({color:'#baffea',metalness:.25,roughness:.08,emissive:'#73daba',emissiveIntensity:.3}),[end.x,end.y+3,end.z]);droplet.scale.y=1.5;floaters.push(droplet);
    return {points,overview:v(29,24,40),lookAt:v(0,7,-2),followOffset:v(11,7,14)};
  }
  if(id==='body') {
    // An open anatomical fantasy: a winding artery canyon, suspended above branching vessels.
    const flesh=mat('#9d324d'),ridge=mat('#dd6178'),vein=mat('#5b386e'),cell=mat('#e94b5b',.14),pulse=mat('#ffc1a2',.6);
    const spine=Array.from({length:81},(_,i)=>{const t=i/80;return v(Math.sin(t*Math.PI*2)*5,1+t*5,12-t*26);});
    const center=new THREE.CatmullRomCurve3(spine);
    const vertices:number[]=[],indices:number[]=[];
    for(let i=0;i<=100;i++) {
      const p=center.getPoint(i/100);
      for(let j=0;j<=24;j++){const a=Math.PI+j/24*Math.PI;vertices.push(p.x+Math.cos(a)*5,p.y+3+Math.sin(a)*4.5,p.z);}
      if(i<100)for(let j=0;j<24;j++){const n=i*25+j;indices.push(n,n+1,n+25,n+1,n+26,n+25);}
    }
    const membrane=new THREE.BufferGeometry();membrane.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));membrane.setIndex(indices);membrane.computeVertexNormals();
    const wallMat=new THREE.MeshStandardMaterial({color:'#a83658',side:THREE.DoubleSide,roughness:.52});
    add(group,membrane,wallMat,[0,0,0]);
    for(const s of [-1,1])tube(group,spine.map(p=>p.clone().add(v(s*5,3,0))),.28,ridge,100);
    for(let i=0;i<12;i++) {
      const p=center.getPoint(i/11);
      const ring=add(group,new THREE.TorusGeometry(4.9,.1,7,48,Math.PI),ridge,[p.x,p.y+3,p.z]);ring.rotation.z=Math.PI;
    }
    // A sculpted heart at the head of the river, using a true heart silhouette.
    const heartShape=new THREE.Shape();heartShape.moveTo(0,-3);heartShape.bezierCurveTo(-6,1,-5,6,-1.5,5);heartShape.bezierCurveTo(-.4,5,0,4,0,3.6);heartShape.bezierCurveTo(0,4,1,5,2.2,5);heartShape.bezierCurveTo(6,5,6,1,0,-3);
    const heartGeo=new THREE.ExtrudeGeometry(heartShape,{depth:1.9,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.5,bevelThickness:.7,curveSegments:18});
    const heart=add(group,heartGeo,mat('#c6385b',.1),[-6,10,-13]);heart.rotation.y=.3;heart.scale.setScalar(.8);heart.userData['pulse']=true;heart.userData['baseScale']=.8;floaters.push(heart);
    tube(group,[v(-5,13,-12),v(-7,17,-11),v(-3,17,-13),v(-1,13,-14)],.65,ridge,35);
    for(let i=0;i<9;i++) {
      const p=center.getPoint(i/8);
      tube(group,[p.clone().add(v(0,-2,0)),p.clone().add(v(-5,-4,1)),p.clone().add(v(-8,-3,-2))],.32,i%2?vein:flesh,24);
      const blood=add(group,new THREE.TorusGeometry(.72,.27,12,20),cell,[p.x+1,p.y+2,p.z]);blood.rotation.set(.9,.2,i);floaters.push(blood);
      if(i<8){const blood2=add(group,new THREE.TorusGeometry(.55,.23,10,18),cell,[p.x-2,p.y+2.5,p.z+1]);blood2.rotation.x=i*.5;floaters.push(blood2);}
    }
    const points=spine.map((p,i)=>p.clone().add(v(Math.sin(i*.1)*1.1,-1,0)));
    ribbon(group,points.map(p=>p.clone().add(v(0,-.1,0))),1.7,mat('#ea8991'));
    tube(group,points.map(p=>p.clone().add(v(-.95,.15,0))),.045,pulse,100);
    for(let i=0;i<14;i++){const p=center.getPoint(random());glow(group,[p.x+(random()-.5)*6,p.y+2+random()*3,p.z],'#ffb99e',.07);}
    return {points,overview:v(25,23,36),lookAt:v(-1,6,-2),followOffset:v(9,8,15)};
  }
  if(id==='micro') {
    // No floor: travel through a cutaway cell, between organelles on a DNA staircase.
    const teal=mat('#7be4d7',.28),purple=mat('#9a65ce',.2),pink=mat('#ef9ed4',.3);
    const membrane=new THREE.MeshPhysicalMaterial({color:'#798dd7',transparent:true,opacity:.12,roughness:.24,metalness:.1,side:THREE.DoubleSide,depthWrite:false});
    add(group,new THREE.SphereGeometry(11,40,26,Math.PI*.22,Math.PI*1.4),membrane,[0,6,0]);
    for(let i=0;i<4;i++){const band=add(group,new THREE.TorusGeometry(11,.035,6,96,Math.PI*1.45),teal,[0,6,0]);band.rotation.set(.3+i*.65,.1+i*.6,0);}
    const nucleus=add(group,new THREE.IcosahedronGeometry(3,3),new THREE.MeshStandardMaterial({color:'#ca82dc',emissive:'#9443ba',emissiveIntensity:.25,roughness:.3}),[-2,7,-3]);
    const nucleusRing=add(group,new THREE.TorusGeometry(3.5,.09,8,64),pink,[-2,7,-3]);nucleusRing.rotation.set(.8,.3,.2);
    for(let i=0;i<18;i++){const a=i*2.4;const bead=add(nucleus,new THREE.SphereGeometry(.2,8,6),pink,[Math.sin(a)*2.5,Math.cos(a)*2.3,Math.sin(a*2)*1.6]);}
    const points=Array.from({length:141},(_,i)=>{const t=i/140,a=t*Math.PI*2.45-.5;return v(Math.cos(a)*7.4,-1+t*15,Math.sin(a)*6);});
    ribbon(group,points.map(p=>p.clone().add(v(0,-.18,0))),1.25,mat('#696ba9',.16));
    const dnaA=points.map((p,i)=>p.clone().add(v(Math.cos(i*.4)*.75,.3,Math.sin(i*.4)*.75)));
    const dnaB=points.map((p,i)=>p.clone().add(v(-Math.cos(i*.4)*.75,.3,-Math.sin(i*.4)*.75)));
    tube(group,dnaA,.075,teal,220);tube(group,dnaB,.075,pink,220);
    for(let i=0;i<141;i+=4)tube(group,[dnaA[i],dnaB[i]],.045,mat('#d3cef7',.2),4);
    for(let i=0;i<12;i++) {
      const a=i*2.4,x=Math.cos(a)*(i%2?10:5),z=Math.sin(a)*8,y=1+random()*10;
      const organism=new THREE.Group();organism.position.set(x,y,z);organism.rotation.set(random()*2,random()*2,random()*2);
      const skin=i%3?teal:purple;
      add(organism,new THREE.CapsuleGeometry(.55,1.1,6,12),skin,[0,0,0]);
      for(let j=0;j<5;j++){const k=j*1.25;tube(organism,[v(Math.cos(k)*.5,0,Math.sin(k)*.5),v(Math.cos(k),.3,Math.sin(k)),v(Math.cos(k)*1.3,.8,Math.sin(k)*1.3)],.04,skin,10);}
      add(organism,new THREE.SphereGeometry(.2,10,8),pink,[0,.2,.5]);group.add(organism);floaters.push(organism);
    }
    // Mitochondria with folded interior membranes.
    for(const p of [[6,4,-5],[-7,1,1],[3,11,2]] as Position[]) {
      const organelle=new THREE.Group();organelle.position.set(...p);organelle.rotation.z=.7;
      const shell=add(organelle,new THREE.CapsuleGeometry(.7,1.7,6,12),mat('#efac81',.12),[0,0,0]);
      tube(organelle,Array.from({length:20},(_,i)=>v(Math.sin(i*1.3)*.45,-1.2+i*.13,.66)),.085,mat('#fff0a6',.4),35);group.add(organelle);floaters.push(organelle);
    }
    return {points,overview:v(22,18,32),lookAt:v(0,6,0),followOffset:v(12,7,15)};
  }
  if(id==='cosmos') {
    // A luminous tree growing from a broken moon, with its branches forming the climb.
    const stone=mat('#3f4874'),silver=mat('#9498c4'),gold=mat('#ffd29a',.55),blue=mat('#a7dbf5',.45);
    rock(group,[0,-2,0],[5,3.5,4.5],stone);
    rock(group,[0,.1,0],[5,.7,4.5],silver);
    for(let i=0;i<8;i++){const a=i*2.4;rock(group,[Math.cos(a)*7,-3-random()*4,Math.sin(a)*6],[1.3+random(),1+random(),1.2],stone,i);}
    const trunk=[v(0,0,0),v(-1,4,0),v(1,9,-1),v(-.3,14,-1),v(0,20,-2)];
    tube(group,trunk,.62,gold,70);
    const tips:THREE.Vector3[]=[];
    for(let i=0;i<13;i++) {
      const y=4+i*.9,a=i*2.4,r=6.5-Math.max(0,y-10)*.4;
      const end=v(Math.cos(a)*r,y+3,Math.sin(a)*r-1);tips.push(end);
      tube(group,[v(0,y,-1),v(end.x*.55,y+.7,end.z*.5),end],.22,i%2?gold:blue,28);
      for(let j=0;j<2;j++){const sprig=end.clone().add(v(Math.cos(a+j)*2,1.5,Math.sin(a+j)*2));tube(group,[end,sprig],.08,gold,12);glow(group,sprig.toArray() as Position,j?'#b9e6ff':'#ffe3aa',.18);}
      const crystal=add(group,new THREE.OctahedronGeometry(.7),i%2?gold:blue,end.toArray() as Position);floaters.push(crystal);
    }
    // A true star silhouette crowns the tree, rather than a generic ball.
    const star=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.65:1.65;i?star.lineTo(Math.cos(a)*r,Math.sin(a)*r):star.moveTo(Math.cos(a)*r,Math.sin(a)*r);}star.closePath();
    const starObject=add(group,new THREE.ExtrudeGeometry(star,{depth:.2,bevelEnabled:true,bevelSize:.08,bevelThickness:.1,bevelSegments:1,steps:1}),new THREE.MeshBasicMaterial({color:'#ffe9ab'}),[0,21,-2]);starObject.rotation.y=.5;
    for(let i=0;i<2;i++){const halo=add(group,new THREE.TorusGeometry(2.5+i*.8,.025,6,72),gold,[0,21,-2]);halo.rotation.y=.5;}
    // A constellation of separate moon islands joined by soaring bridges.
    const islands=[v(7,.8,6),v(-1,4,9),v(-8,8,3),v(0,11,5),v(8,14,3),v(3,18,0)];
    const points:THREE.Vector3[]=[];
    const bridgeMaterial=mat('#8396c6',.3);
    for(let i=0;i<islands.length;i++) {
      const p=islands[i];
      rock(group,[p.x,p.y-1.1,p.z],[2,1.5,1.7],stone,i);
      add(group,new THREE.CylinderGeometry(1.55,1.8,.3,6),silver,[p.x,p.y-.25,p.z]);
      const crystal=add(group,new THREE.OctahedronGeometry(.48),i%2?blue:gold,[p.x+.9,p.y+.8,p.z-.7]);floaters.push(crystal);
      if(i===islands.length-1)break;
      const next=islands[i+1],bridge:THREE.Vector3[]=[];
      for(let j=0;j<=28;j++) {
        const t=j/28,piece=p.clone().lerp(next,t);piece.y+=Math.sin(t*Math.PI)*1.15;
        bridge.push(piece);if(i===0||j>0)points.push(piece);
      }
      ribbon(group,bridge.map(p=>p.clone().add(v(0,-.14,0))),1.15,bridgeMaterial);
      const direction=next.clone().sub(p),side=v(direction.z,0,-direction.x).normalize();
      for(const s of [-1,1])tube(group,bridge.map(p=>p.clone().add(side.clone().multiplyScalar(s*.64))),.035,i%2?gold:blue,36);
      for(let j=3;j<28;j+=5){const p=bridge[j];add(group,new THREE.OctahedronGeometry(.14),gold,[p.x,p.y-.65,p.z]);}
    }
    const planet=add(group,new THREE.SphereGeometry(2.6,24,16),mat('#829ed2'),[-11,9,-5]);
    const ringMat=new THREE.MeshStandardMaterial({color:'#cdbbe9',emissive:'#a494c8',emissiveIntensity:.25,side:THREE.DoubleSide});
    const ring=add(planet,new THREE.RingGeometry(3.2,4.4,64),ringMat,[0,0,0]);ring.rotation.x=1.2;ring.rotation.y=.2;
    const moon=add(group,new THREE.IcosahedronGeometry(1.4,2),mat('#d9beac'),[9,14,-7]);floaters.push(moon);
    const orbit=add(group,new THREE.TorusGeometry(12,.025,5,100),blue,[0,3,0]);orbit.rotation.x=1.2;orbit.rotation.z=.2;
    for(let i=0;i<7;i++){const p=v(-13+i*3,17+Math.sin(i)*2,-10);glow(group,p.toArray() as Position,'#cfe8ff',.1);if(i)tube(group,[v(-13+(i-1)*3,17+Math.sin(i-1)*2,-10),p],.015,blue,5);}
    return {points,overview:v(30,25,44),lookAt:v(0,9,-1),followOffset:v(12,8,16)};
  }
  return null;
}
