import * as THREE from 'three';
import type { RealmComposition } from './realm-environments';
import { naturalTrail } from './landscape-details';

const v = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
const material = (color:string,glow=0) => new THREE.MeshStandardMaterial({color,roughness:.93,emissive:color,emissiveIntensity:glow});
const treeCenter=v(0,0,-6.8);
const outward=(point:THREE.Vector3)=>v(point.x,0,point.z-treeCenter.z).normalize();

/** Orbit on the walker's side of the trunk. Blend distance, never cut across the trunk. */
function treeCameraPose(point:THREE.Vector3,aspect:number,overview:number) {
  const radial=outward(point),side=v(-radial.z,0,radial.x);
  const zoom=aspect<.85?1.15:1;
  const position=point.clone().addScaledVector(radial,16*zoom).addScaledVector(side,12*zoom).add(v(0,8*zoom,0));
  const target=point.clone().add(v(0,1.4,0));
  const framing=Math.max(1,.95/aspect);
  const wide=treeCenter.clone().addScaledVector(radial,70*framing).addScaledVector(side,45*framing).add(v(0,30*framing,0));
  return {position:position.lerp(wide,overview),target:target.lerp(treeCenter.clone().add(v(0,8,0)),overview)};
}

function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,position=new THREE.Vector3()) {
  const object=new THREE.Mesh(geometry,mat);
  object.position.copy(position);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}
function strand(parent:THREE.Object3D,points:THREE.Vector3[],radius:number,mat:THREE.Material) {
  const curve=new THREE.CatmullRomCurve3(points),geometry=new THREE.TubeGeometry(curve,48,radius,7,false);
  {
    const positions=geometry.getAttribute('position');
    for(let i=0;i<=48;i++)for(let j=0;j<=7;j++) {
      const index=i*8+j,center=curve.getPointAt(i/48);
      const p=new THREE.Vector3().fromBufferAttribute(positions,index).sub(center).multiplyScalar(1-.985*(i/48)**2).add(center);
      positions.setXYZ(index,p.x,p.y,p.z);
    }
    geometry.computeVertexNormals();
  }
  return mesh(parent,geometry,mat);
}
function surface(positions:number[],colors:number[],indices:number[]) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** A slice of an ancient tree: its roots and crown are far outside every camera view. */
export function buildGiantTree(group:THREE.Group,floaters:THREE.Object3D[],random:()=>number):RealmComposition {
  const bark=material('#70503a'),darkBark=material('#493b30'),moss=material('#4e7750');
  const foliage=new THREE.MeshStandardMaterial({color:'#548658',side:THREE.DoubleSide,roughness:.9});
  const mint=material('#9ce6bc',.35),amber=material('#f9cf8b',.65);
  const vertexMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96});

  // The trunk has actual fluted bark, rather than separate vertical cylinders.
  const positions:number[]=[],colors:number[]=[],indices:number[]=[];
  const dark=new THREE.Color('#44372d'),light=new THREE.Color('#8b6948');
  const rings=120,sides=96;
  for(let i=0;i<=rings;i++) {
    const y=-220+i/rings*440;
    for(let j=0;j<=sides;j++) {
      const a=j/sides*Math.PI*2;
      const ridge=Math.sin(a*19+Math.sin(y*.075)*.5)*.25+Math.cos(a*31-y*.045)*.12;
      const radius=6.4+ridge+Math.sin(y*.04)*.22;
      positions.push(Math.cos(a)*radius+Math.sin(y*.025)*.35,y,-6.8+Math.sin(a)*radius);
      const c=dark.clone().lerp(light,.42+ridge*.9+Math.sin(y*.25+a*7)*.07);
      colors.push(c.r,c.g,c.b);
      if(i<rings&&j<sides){const n=i*(sides+1)+j;indices.push(n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2);}
    }
  }
  const trunk=mesh(group,surface(positions,colors,indices),vertexMaterial);trunk.name='ancient-trunk';

  // Enter along a low bough, spiral three quarters around the trunk, then leave one level up.
  const polar=(angle:number,radius:number,y:number)=>v(Math.cos(angle)*radius,y,treeCenter.z+Math.sin(angle)*radius);
  const entryAngle=2.8,exitAngle=entryAngle-Math.PI*1.5;
  const spiral=Array.from({length:25},(_,i)=>polar(entryAngle-i/24*Math.PI*1.5,9.7,2.5+i/24*11));
  const path=new THREE.CatmullRomCurve3([
    polar(entryAngle+.12,26,.3),polar(entryAngle+.1,21,.8),polar(entryAngle+.06,15,1.5),
    ...spiral,
    polar(exitAngle-.06,15,14.2),polar(exitAngle-.1,21,14.8),polar(exitAngle-.12,26,15.3),
  ]);
  const points=path.getSpacedPoints(320);
  const radiusAt=(p:THREE.Vector3)=>1.05+1.65*Math.exp(-(((Math.hypot(p.x,p.z-treeCenter.z)-9.7)/7)**2));
  // Continue past both walking endpoints into real tapered tips, not open or capped tubes.
  const branchPoints=points.map(p=>({point:p,radius:radiusAt(p)}));
  for(const t of [0,1]) {
    const end=path.getPoint(t),direction=path.getTangent(t).multiplyScalar(t===0?-1:1);
    const tipPoints=Array.from({length:16},(_,i)=>{
      const distance=(i+1)/16;
      return {point:end.clone().addScaledVector(direction,distance*4.5).add(v(0,-(distance**2)*.65,0)),radius:radiusAt(end)*Math.max(.008,(1-distance)**.8)};
    });
    if(t===0)branchPoints.unshift(...tipPoints.reverse());else branchPoints.push(...tipPoints);
  }
  const branchPositions:number[]=[],branchColors:number[]=[],branchIndices:number[]=[];
  const mossPositions:number[]=[],mossColors:number[]=[],mossIndices:number[]=[];
  const woodDark=new THREE.Color('#543c2c'),woodLight=new THREE.Color('#997249');
  const mossDark=new THREE.Color('#365b3d'),mossLight=new THREE.Color('#7c9960');
  for(let i=0;i<branchPoints.length;i++) {
    const {point:p,radius:r}=branchPoints[i];
    const d=branchPoints[Math.min(i+1,branchPoints.length-1)].point.clone().sub(branchPoints[Math.max(0,i-1)].point);
    const side=v(d.z,0,-d.x).normalize();
    for(let j=0;j<=24;j++) {
      const a=j/24*Math.PI*2,flute=1+.035*Math.cos(a*9+i*.07);
      // A naturally worn, broad top carries the feet and moss path without floating boards.
      const rise=Math.min(1,Math.sin(a)/.72)*r*.82;
      const q=p.clone().addScaledVector(side,Math.cos(a)*r*flute);q.y+=rise-r*.82-.13;
      branchPositions.push(...q.toArray());
      const c=woodDark.clone().lerp(woodLight,.4+.23*Math.sin(a*9+i*.035));branchColors.push(c.r,c.g,c.b);
      if(i<branchPoints.length-1&&j<24){const n=i*25+j;branchIndices.push(n,n+1,n+25,n+1,n+26,n+25);}
    }
    for(let j=0;j<=12;j++) {
      const a=.47+j/12*(Math.PI-.94),edge=1+.025*Math.sin(i*.31+j);
      const q=p.clone().addScaledVector(side,Math.cos(a)*r*edge);
      q.y+=Math.min(1,Math.sin(a)/.72)*r*.82-r*.82-.105;
      mossPositions.push(...q.toArray());
      const c=mossDark.clone().lerp(mossLight,.5+.24*Math.sin(i*.18+j*.7));mossColors.push(c.r,c.g,c.b);
      if(i<branchPoints.length-1&&j<12){const n=i*13+j;mossIndices.push(n,n+1,n+13,n+1,n+14,n+13);}
    }
  }
  const branch=mesh(group,surface(branchPositions,branchColors,branchIndices),vertexMaterial);branch.name='walking-branches';
  mesh(group,surface(mossPositions,mossColors,mossIndices),vertexMaterial);
  naturalTrail(group,path,1.12,'#91a16b');

  // Heavy branch collars disappear into the trunk, joining the route to the same living tree.
  for(const p of [spiral[0],spiral.at(-1)!]) {
    const radial=outward(p);
    strand(group,[treeCenter.clone().add(v(0,p.y-5,0)),p.clone().addScaledVector(radial,-4).add(v(0,-3,0)),p.clone().addScaledVector(radial,4).add(v(0,-1.6,0))],2,bark);
  }
  for(const side of [-1,1]) {
    const y=side<0?-1:5;
    // A distant bough above and a second below establish that this is just one level.
    strand(group,[v(0,y+20,-8),v(side*9,y+21,-10),v(side*20,y+24,-12),v(side*37,y+25,-18)],1.1,darkBark);
    strand(group,[v(0,y-20,-8),v(side*12,y-18,-11),v(side*30,y-16,-18)],1.6,darkBark);
  }

  // Twisting ivy follows the bark. All dense foliage stays behind or below the walker.
  for(let i=0;i<7;i++) {
    const a=.2+i*.46;
    strand(group,Array.from({length:24},(_,j)=>{
      const y=-35+j*3,angle=a+Math.sin(j*.25+i)*.07;
      return v(Math.cos(angle)*6.7,y,-6.8+Math.sin(angle)*6.7);
    }),.055,i%2?moss:darkBark);
  }
  const leafShape=new THREE.Shape();
  leafShape.moveTo(0,0);leafShape.bezierCurveTo(1.1,.8,1,2.3,0,3.4);leafShape.bezierCurveTo(-1,2.3,-1.1,.8,0,0);
  const leafGeometry=new THREE.ShapeGeometry(leafShape,12);
  function leaf(p:THREE.Vector3,size:number,angle:number) {
    const blade=mesh(group,leafGeometry,foliage,p);blade.rotation.set(-1.05,.18,angle);blade.scale.setScalar(size);
    const vein=mesh(blade,new THREE.CylinderGeometry(.012,.026,2.9,5),moss,v(0,1.55,.02));vein.castShadow=false;
  }
  for(const t of [0,1]) {
    const p=path.getPoint(t),direction=path.getTangent(t).multiplyScalar(t===0?-1:1);
    for(const side of [-1,1]) {
      const start=p.clone().addScaledVector(direction,1.8).add(v(0,-.5,0));
      const end=p.clone().addScaledVector(direction,3.8).add(v(0,-.1,side*1.4));
      strand(group,[start,start.clone().addScaledVector(direction,.8).add(v(0,.1,side*.8)),end],.16,bark);
      leaf(end,.65,t===0?-.8:.8);
    }
  }
  for(let i=0;i<34;i++) {
    const t=.035+i/34*.93,p=path.getPointAt(t),d=path.getTangentAt(t),side=v(d.z,0,-d.x).normalize();
    const r=radiusAt(p),radial=outward(p),edge=p.clone().addScaledVector(side,(i%2?1:-1)*(r*.88));edge.y-=.65;
    const away=radial.clone().multiplyScalar(-.5).add(v(radial.z,0,-radial.x));
    const plantSide=side.clone().multiplyScalar(side.dot(away)<0?-1:1);
    // Fine hanging moss gives the branch an organic silhouette without blocking the trail.
    strand(group,[edge,edge.clone().add(v(.15,-.7,.08)),edge.clone().add(v(-.12,-1.3-random()*1.6,.1))],.035,moss);
    if(i%3===0)leaf(p.clone().addScaledVector(plantSide,r*.9).add(v(0,-.65,0)),.4+random()*.3,-.8+random()*1.6);
    if(i%4===0) {
      const base=p.clone().addScaledVector(plantSide,r*.82).add(v(0,-.2,0));
      mesh(group,new THREE.CylinderGeometry(.045,.085,.35,7),bark,base.clone().add(v(0,.12,0)));
      const cap=mesh(group,new THREE.SphereGeometry(.3,12,8,0,Math.PI*2,0,Math.PI/2),i%8?amber:mint,base.clone().add(v(0,.3,0)));cap.scale.y=.45;
    }
  }
  // Shelf fungi and knots are rooted in the trunk, away from the front-facing walking corridor.
  for(let i=0;i<12;i++) {
    const side=i%2?1:-1,y=-12+i*3.4;
    const fungus=mesh(group,new THREE.SphereGeometry(1,16,8),i%3?moss:bark,v(side*5.8,y,-3.7));fungus.scale.set(1.7,.22,1.4);
  }
  for(const [x,y,z,s,a] of [[-20,24,-11,2.4,-.8],[-12,29,-13,3,.8],[19,30,-14,3.1,-.7],[28,28,-9,2.4,.9],[-29,-9,-8,2.6,-.5],[17,-13,-13,3,.5]]) {
    strand(group,[v(Math.sign(x)*4,y-3,-8),v(x*.7,y-1,z-1),v(x,y,z)],.22,darkBark);
    leaf(v(x,y,z),s,a);
  }
  // Background trunks vanish into the green haze; there is deliberately no ground or crown.
  const distant=material('#284e42');
  for(const [x,z,r] of [[-31,-33,3.8],[27,-40,4.7],[-15,-57,5],[48,-64,4],[-52,-62,5]]) {
    const p=v(x,0,z).sub(treeCenter).normalize().multiplyScalar(200).add(treeCenter);
    mesh(group,new THREE.CylinderGeometry(r*1.4,r*1.8,440,12,1,true),distant,p);
  }
  const end=points.at(-1)!;
  const endRadial=outward(end),endSide=v(-endRadial.z,0,endRadial.x);
  leaf(end.clone().addScaledVector(endSide,-2).add(v(0,-.6,0)),1.2,-1.2);
  const droplet=mesh(group,new THREE.SphereGeometry(.45,20,16),new THREE.MeshPhysicalMaterial({color:'#c0ffde',metalness:.15,roughness:.1,emissive:'#85dbb8',emissiveIntensity:.3,clearcoat:1}),end.clone().addScaledVector(endRadial,-1.2).addScaledVector(endSide,-2.7).add(v(0,3.5,0)));
  droplet.scale.y=1.6;floaters.push(droplet);
  return {points,overview:v(0,24,83),lookAt:v(0,6,0),followOffset:v(0,6.5,19),cameraPose:treeCameraPose};
}
