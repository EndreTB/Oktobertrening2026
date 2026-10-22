import * as THREE from 'three';
import type { RealmComposition } from './realm-environments';
import { jungleMaterial, jungleLeafGeometry, jungleAtmosphere } from './jungle-materials';
import { jungleWater, JUNGLE_WATER_LEVEL } from './jungle-water';

const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
export const JUNGLE_CROSSINGS=[{from:.22,to:.265,kind:'jump'},{from:.53,to:.62,kind:'swing'},{from:.79,to:.825,kind:'jump'}] as const;

/** One hanging ecosystem: the trees, traversable roots, vines and flower share a sky canopy. */
export function buildInvertedJungle(group:THREE.Group,random:()=>number):RealmComposition {
  const surface=(color:string,glow=0)=>new THREE.MeshStandardMaterial({color,roughness:.85,emissive:color,emissiveIntensity:glow,side:THREE.DoubleSide});
  const time={value:0};
  const bark=jungleMaterial('bark','#91826b'),rootBark=jungleMaterial('bark','#9e8968'),moss=jungleMaterial('moss','#728349');
  jungleAtmosphere(group,time,random);
  jungleWater(group,time);
  const greens=['#164f43','#28684a','#49865a','#84ac66'].map(color=>surface(color));
  const pink=jungleMaterial('petal','#ffffff',true),amber=surface('#ffdc8c',.85);
  const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,position=v(0,0,0),parent:THREE.Object3D=group)=>{
    const object=new THREE.Mesh(geometry,material);object.position.copy(position);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  };
  const geometry=(positions:number[],indices:number[])=>{
    const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setIndex(indices);result.computeVertexNormals();return result;
  };
  function branch(points:THREE.Vector3[],radius:number,material:THREE.Material,taper=.12,parent:THREE.Object3D=group) {
    const curve=new THREE.CatmullRomCurve3(points),geo=new THREE.TubeGeometry(curve,48,radius,10,false),positions=geo.getAttribute('position');
    for(let i=0;i<=48;i++) {
      const centre=curve.getPointAt(i/48),size=1-(1-taper)*(i/48)**1.6;
      for(let j=0;j<=10;j++) {
        const index=i*11+j,p=new THREE.Vector3().fromBufferAttribute(positions,index).sub(centre);
        p.multiplyScalar(size*(1+.11*Math.sin(j*3.7+i*.13)+.05*Math.cos(j*2.3+i*.35))).add(centre);positions.setXYZ(index,p.x,p.y,p.z);
      }
    }
    geo.computeVertexNormals();return mesh(geo,material,v(0,0,0),parent);
  }
  // A hanging forest of distinct, twisted trunks with buttress roots in the sky.
  const leafGeo=jungleLeafGeometry(),fernGeo=jungleLeafGeometry(true);
  const foliage=jungleMaterial('leaf','#ffffff',false,time);
  const crowns=new THREE.InstancedMesh(leafGeo,foliage,2400),ferns=new THREE.InstancedMesh(fernGeo,foliage,6000);
  const dummy=new THREE.Object3D();let leafIndex=0,fernIndex=0;
  const leafAt=(position:THREE.Vector3,direction:THREE.Vector3,size:number,fern=false)=>{
    dummy.position.copy(position);dummy.quaternion.setFromUnitVectors(v(0,1,0),direction.clone().normalize());dummy.rotateY(random()*1.3-.65);
    dummy.scale.set(size*(.75+random()*.4),size,size);dummy.updateMatrix();
    const target=fern?ferns:crowns,index=fern?fernIndex++:leafIndex++;
    target.setMatrixAt(index,dummy.matrix);target.setColorAt(index,new THREE.Color().setHSL(.23+random()*.1,.26+random()*.24,.25+random()*.18));
  };
  const fernAt=(base:THREE.Vector3,length:number,angle:number)=>{
    const direction=v(Math.cos(angle),-.6,Math.sin(angle));
    const spine=new THREE.CatmullRomCurve3([base,base.clone().addScaledVector(direction,length*.45).add(v(0,.5,0)),base.clone().addScaledVector(direction,length).add(v(0,-length*.35,0))]);
    branch(spine.getPoints(8),.035,greens[1]);
    for(let i=1;i<13;i++)for(const sign of [-1,1]) {
      const t=i/13,p=spine.getPoint(t),side=v(-direction.z,0,direction.x).multiplyScalar(sign);
      leafAt(p,side.addScaledVector(direction,.2).add(v(0,-.15,0)),Math.sin(Math.PI*t)*length*.2,true);
    }
  };
  const trees=[v(-23,44,-13),v(-10,48,-19),v(11,46,-17),v(27,43,-15),v(-1,54,-34),v(-31,51,-32),v(30,53,-38)];
  trees.forEach((top,index)=>{
    const bottom=top.clone().add(v(index%2?4:-4,-29-random()*7,4));
    const trunk=branch([top,top.clone().add(v(-2,-9,1)),top.clone().add(v(2,-21,-1)),bottom],2.1+random(),bark,.3);trunk.name='inverted-trunk';
    trunk.userData['top']=top.toArray();trunk.userData['bottom']=bottom.toArray();
    for(let j=0;j<8;j++) {
      const a=j/8*Math.PI*2+index*.7;
      const rootTip=top.clone().add(v(Math.cos(a)*9,4+random()*2,Math.sin(a)*8));
      branch([top,top.clone().lerp(rootTip,.4).add(v(0,-2,0)),rootTip],.7+random()*.5,bark);
      const b=bottom.clone().lerp(top,.1+j*.095),tip=b.clone().add(v(Math.cos(a)*(7+random()*3),-4-random()*4,Math.sin(a)*6));
      branch([b,b.clone().lerp(tip,.55).add(v(0,-2,0)),tip],.55+random()*.35,bark);
      for(let k=0;k<16;k++) {
        const along=.2+k/20,centre=b.clone().lerp(tip,along),side=k%2?1:-1;
        leafAt(centre.clone().add(v((random()-.5),-.4,(random()-.5))),v(Math.cos(a+side)*.8,-.7-random()*.5,Math.sin(a+side)*.8),.65+random()*.75);
      }
      fernAt(tip,3+random()*3,a);
      // Fine aerial roots descend from real branch junctions.
      if(j%2===0)branch([b,b.clone().add(v(1,-6,1)),b.clone().add(v(-1,-11,2)),b.clone().add(v(.2,-15,1))],.09,greens[1]);
    }
  });
  // The canopy opens directly into the upside-down lake; its underside stays visible.
  trees.forEach((top,index)=>{
    const base=v(top.x,39,top.z),tip=v(top.x+(index%2?3:-3),JUNGLE_WATER_LEVEL+2.5,top.z-2);
    const root=branch([base,base.clone().lerp(tip,.4).add(v(1.5,0,1)),tip],1.3,bark,.65);
    root.name='water-root';
  });
  for(let i=0;i<48;i++) {
    const p=v(-38+random()*76,41+random()*4,-8-random()*33);
    for(let j=0;j<8;j++)leafAt(p.clone().add(v((random()-.5)*4,random()*2,(random()-.5)*4)),v((random()-.5)*1.6,-1,(random()-.5)*1.6),.8+random()*.8);
  }

  const raw=new THREE.CatmullRomCurve3([
    v(-16,0,8),v(-12,1.5,9),v(-6,3,8),v(1,4,7),v(9,6,6),v(13,8,4),
    v(9,10,5),v(3,11.5,7),v(-5,13,8),v(-12,15,6),v(-9,17,4),v(-3,19,5),v(3,20.5,4),v(2,22,2.5),
  ]);
  const points=raw.getSpacedPoints(320);
  // Match createWorld's equal-distance resampling so gaps and character motion use the same progress.
  const route=new THREE.CatmullRomCurve3(new THREE.CatmullRomCurve3(points).getSpacedPoints(320));
  const spans=[[0,.22],[.265,.53],[.62,.79],[.825,1]];
  for(const [spanIndex,[from,to]] of spans.entries()) {
    const positions:number[]=[],indices:number[]=[],colors:number[]=[],topPositions:number[]=[],topIndices:number[]=[];
    const rootDark=new THREE.Color('#58452e'),rootLight=new THREE.Color('#a08055');
    const count=Math.ceil((to-from)*480),sides=20;
    for(let i=0;i<=count;i++) {
      const t=from+(to-from)*i/count,p=route.getPoint(t),d=route.getTangent(t),side=v(d.z,0,-d.x).normalize();
      const width=1.45+.18*Math.sin(t*37)+.08*Math.cos(t*91),depth=1.05+.1*Math.sin(t*43);
      for(let j=0;j<=sides;j++) {
        const a=j/sides*Math.PI*2;
        const rise=Math.min(.74,Math.sin(a))*depth;
        const point=p.clone().addScaledVector(side,Math.cos(a)*width*(1+.035*Math.sin(a*7+t*71))).add(v(0,rise-depth*.74-.09,0));
        positions.push(...point.toArray());
        const grain=.42+.22*Math.sin(a*12+Math.sin(t*18))+.1*Math.cos(t*140+a*3);
        const color=rootDark.clone().lerp(rootLight,grain);colors.push(color.r,color.g,color.b);
        if(i<count&&j<sides){const n=i*(sides+1)+j;indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
      }
      for(const s of [-1,1])topPositions.push(...p.clone().addScaledVector(side,s*width*.56).add(v(0,-.075,0)).toArray());
      if(i<count){const n=i*2;topIndices.push(n,n+1,n+2,n+1,n+3,n+2);}
    }
    const rootGeometry=geometry(positions,indices);rootGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const root=mesh(rootGeometry,jungleMaterial('bark','#ffffff',true));root.name='walkable-jungle-root';
    const carpet=mesh(geometry(topPositions,topIndices),moss);carpet.name='walkable-jungle-root';
    // Large natural forks grow from the route all the way back into a hanging tree.
    const midpoint=route.getPoint((from+to)/2),tree=trees[spanIndex];
    branch([tree.clone().add(v(0,-9,0)),tree.clone().add(v(0,-16,3)),midpoint.clone().add(v(0,-.65,0))],1.6,bark,.48);
    for(const t of [from,to]) {
      const p=route.getPoint(t);
      const knot=mesh(new THREE.SphereGeometry(1,24,12),rootBark,p.clone().add(v(0,-.51,0)));knot.scale.set(1.25,.42,.7);knot.name='walkable-jungle-root';
      branch([p.clone().add(v(0,-.6,0)),p.clone().add(v(1,-1,-1)),p.clone().add(v(2,-2,-3))],.4,rootBark);
    }
  }
  // Tendrils and tiny flowers are attached to the roots, leaving their walking tops clear.
  for(let i=0;i<70;i++) {
    const t=i/69;if(JUNGLE_CROSSINGS.some(gap=>t>gap.from-.01&&t<gap.to+.01))continue;
    const p=route.getPoint(t),d=route.getTangent(t),edge=v(d.z,0,-d.x).normalize().multiplyScalar(i%2?1.2:-1.2);
    const base=p.clone().add(edge).add(v(0,-.25,0));
    branch([base,base.clone().add(v(.3,-1,0)),base.clone().add(v(.7,-2.4,-.4))],.07,greens[2]);
    leafAt(base,v(edge.x*.6,-.7,edge.z*.6),.25+random()*.2);
    if(i%3===0)fernAt(base.clone().add(v(0,-.3,-.3)),1.2+random(),i*2.4);
    if(i%3===0)mesh(new THREE.SphereGeometry(.13,10,8),amber,base.clone().add(v(0,.2,0)));
  }

  // A vine tied to the canopy carries the traveller across the longest gap.
  const swingGap=JUNGLE_CROSSINGS[1],swingMid=route.getPoint((swingGap.from+swingGap.to)/2);
  const anchor=v(swingMid.x,34,swingMid.z-1);
  branch([trees[1],v(anchor.x,36,anchor.z-3),anchor],.45,bark,.22);
  const rope=mesh(new THREE.CylinderGeometry(.075,.075,1,8),greens[2]);rope.name='swing-vine';
  const updateRope=(hand:THREE.Vector3)=>{
    rope.position.copy(anchor).lerp(hand,.5);rope.scale.y=anchor.distanceTo(hand);
    rope.quaternion.setFromUnitVectors(v(0,1,0),anchor.clone().sub(hand).normalize());
  };
  const restingHand=route.getPoint(swingGap.from).add(v(0,1.55,0));updateRope(restingHand);
  // Moving plants hang from the undersides of real root forks.
  const plants:THREE.Group[]=[];
  for(const t of [.16,.43,.73]) {
    const junction=route.getPoint(t).add(v(0,-.55,-.6)),p=junction.clone().add(v(.4,-.35,-1.1));
    branch([junction,junction.clone().lerp(p,.5).add(v(0,-.1,0)),p],.28,rootBark,.6);
    const plant=new THREE.Group();plant.name='hanging-moving-plant';plant.position.copy(p);plant.rotation.z=Math.PI;group.add(plant);
    branch([v(0,0,0),v(.4,1.2,0),v(0,2.2,0)],.17,greens[2],.6,plant);
    const head=new THREE.Group();head.name='moving-jungle-plant';head.position.y=2.2;plant.add(head);plants.push(head);
    for(const side of [-1,1]) {
      const jaw=mesh(leafGeo,side===1?pink:greens[3],v(0,0,0),head);jaw.rotation.set(side*.65,0,side*.9);jaw.scale.set(.65,.65,.65);
    }
  }

  // Water falls upward from the mist and lands against the lake overhead.
  const waterfallBottom=-6,waterfallHeight=JUNGLE_WATER_LEVEL-waterfallBottom;
  const drops=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({color:'#b3f7e4',transparent:true,opacity:.72}),160);
  drops.name='upward-water-drops';const dropSeeds=Array.from({length:160},()=>random());
  const water=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time},
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 st;uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){float flow=st.y*24.-time*1.6;float n=noise(vec2(st.x*17.,flow));float filaments=pow(.5+.5*sin(st.x*90.+n*4.),4.);
      float foam=smoothstep(.57,.87,noise(vec2(st.x*29.,flow*3.)))*.7;
      float edge=smoothstep(0.,.12,st.x)*(1.-smoothstep(.84,1.,st.x));float end=smoothstep(0.,.04,st.y);foam+=smoothstep(.92,1.,st.y)*.25;
      gl_FragColor=vec4(mix(vec3(.32,.58,.52),vec3(.79,.88,.80),foam+filaments*.3),edge*end*(.12+filaments*.19+foam*.30));}`});
  for(const x of [-23,21]) {
    const positions:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let i=0;i<=80;i++)for(let j=0;j<=12;j++) {
      const t=i/80,u=j/12;
      positions.push(x+(u-.5)*(2.3+.4*Math.sin(t*7))+Math.sin(t*5)*.4,waterfallBottom+t*waterfallHeight,-6-t*3+Math.sin(u*13+t*9)*.16);
      uv.push(u,t);if(i<80&&j<12){const n=i*13+j;indices.push(n,n+1,n+13,n+1,n+14,n+13);}
    }
    const curtain=geometry(positions,indices);curtain.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const fall=mesh(curtain,water);fall.castShadow=false;fall.name='upward-waterfall';

  }
  group.add(drops);
  const updateWater=(elapsed:number)=>{
    for(let i=0;i<160;i++) {
      const seed=dropSeeds[i],height=(seed*waterfallHeight+elapsed*2.8)%waterfallHeight;
      dummy.position.set((i<80?-23:21)+.5+Math.sin(seed*50)*.6,waterfallBottom+height,-6-height/waterfallHeight*3);
      dummy.rotation.set(0,0,0);dummy.scale.set(.045+seed*.035,.22+seed*.3,.045);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate=true;
  };updateWater(0);

  // One giant blossom, grown from the same canopy, encloses the destination portal.
  const end=route.getPoint(1),heart=end.clone().add(v(0,1.7,-.6));
  branch([trees[2],v(12,33,-8),v(8,23,-4),end.clone().add(v(0,-1,-1))],1.35,greens[1],.7);
  const flower=new THREE.Group();flower.name='jungle-heart-flower';flower.position.copy(heart);group.add(flower);
  const petals:THREE.Mesh[]=[];
  const petalAngles=[-2.65,-1.46,-.22,.97,2.22,3.1];
  petalAngles.forEach((angle,j)=>{
    const positions:number[]=[],indices:number[]=[],colors:number[]=[],uv:number[]=[];
    const length=[7.3,8.1,9.2,7.6,8.4,5.5][j],width=[2.9,3.4,3.3,3.6,3.1,3.5][j];
    const throat=new THREE.Color('#9b4154'),tip=new THREE.Color('#e5bca5');
    for(let i=0;i<=40;i++)for(let k=0;k<=20;k++) {
      const t=i/40,s=k/10-1,w=Math.sin(Math.PI*t)**.65*width*(1-.16*t);
      const ruffle=Math.sin(t*32+s*7+j)*.13*Math.abs(s)**3;
      positions.push(s*w*(1+.08*Math.sin(t*9+j)),t*length,-1.15-Math.sin(Math.PI*t)*1.65+s*s*.75+t**5*.65+ruffle);
      uv.push(k/20,t);
      const color=throat.clone().lerp(tip,Math.min(1,t*.95+Math.abs(s)*.2));colors.push(color.r,color.g,color.b);
      if(i<40&&k<20){const n=i*21+k;indices.push(n,n+1,n+21,n+1,n+22,n+21);}
    }
    const geo=geometry(positions,indices);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const petal=mesh(geo,pink,v(0,0,0),flower);petal.rotation.z=angle;petal.userData['angle']=angle;petals.push(petal);
  });
  // Deep, warm corolla rather than a flat luminous disk.
  const bowlPositions:number[]=[],bowlIndices:number[]=[],bowlUV:number[]=[],bowlColors:number[]=[];
  for(let i=0;i<=20;i++)for(let j=0;j<=64;j++) {
    const t=i/20,a=j/64*Math.PI*2,r=.5+t*2.15;
    bowlPositions.push(Math.cos(a)*r,Math.sin(a)*r,-1.2+t*t*1.3);bowlUV.push(j/64,t);
    const color=new THREE.Color('#f0c784').lerp(new THREE.Color('#bd755c'),t);bowlColors.push(color.r,color.g,color.b);
    if(i<20&&j<64){const n=i*65+j;bowlIndices.push(n,n+1,n+65,n+1,n+66,n+65);}
  }
  const bowlGeo=geometry(bowlPositions,bowlIndices);bowlGeo.setAttribute('uv',new THREE.Float32BufferAttribute(bowlUV,2));bowlGeo.setAttribute('color',new THREE.Float32BufferAttribute(bowlColors,3));mesh(bowlGeo,pink,v(0,0,0),flower);
  const core=mesh(new THREE.SphereGeometry(.62,24,16),amber,v(0,0,-.65),flower);core.name='jungle-heart';
  for(let i=0;i<23;i++) {
    const a=i/23*Math.PI*2,r=1.2+random()*.5,end=v(Math.cos(a)*r,Math.sin(a)*r,.12+random()*.2);
    branch([v(Math.cos(a)*.6,Math.sin(a)*.6,-.9),end.clone().multiplyScalar(.8),end],.025,amber,.45,flower);
    const anther=mesh(new THREE.SphereGeometry(.065,8,6),amber,end,flower);anther.scale.set(.8,1.8,.8);
  }
  const landing=mesh(new THREE.SphereGeometry(1,32,16),moss,end.clone().add(v(0,-.32,-.15)));landing.scale.set(1.1,.25,1.05);landing.name='walkable-jungle-root';
  const light=new THREE.PointLight('#ffd6a0',32,22,2);light.position.copy(heart).add(v(0,0,3));group.add(light);

  crowns.count=leafIndex;ferns.count=fernIndex;crowns.castShadow=true;crowns.receiveShadow=true;ferns.receiveShadow=true;group.add(crowns,ferns);
  const lookAt=v(0,21,-5),overview=v(4,30,83),followOffset=v(3,7,23);
  return {
    points,lookAt,overview,followOffset,
    traversal(progress,point) {
      const gap=JUNGLE_CROSSINGS.find(gap=>progress>gap.from&&progress<gap.to);
      if(!gap){updateRope(restingHand);return {lift:0,armAngle:0,lean:0,airborne:false};}
      const phase=(progress-gap.from)/(gap.to-gap.from),arc=Math.sin(Math.PI*phase),swing=gap.kind==='swing';
      const lift=(swing?-1.5:2)*arc;
      if(swing)updateRope(point.clone().add(v(0,lift+1.55,0)));else updateRope(restingHand);
      return {lift,armAngle:swing?-Math.PI:-arc,lean:swing?.12*Math.cos(Math.PI*phase):-.12*arc,airborne:true};
    },
    cameraPose(point,aspect,overviewAmount,pointer={x:0,y:0}) {
      const target=point.clone().add(v(0,2.8,-1.2)).lerp(lookAt,overviewAmount);
      const follow=point.clone().add(followOffset.clone().multiplyScalar(Math.max(1,.65/aspect)));
      const wide=lookAt.clone().add(overview.clone().sub(lookAt).multiplyScalar(Math.max(1,.9/aspect)));
      return {position:follow.lerp(wide,overviewAmount).add(v(pointer.x*2,pointer.y*1.5,0)),target};
    },
    animate(elapsed) {
      time.value=elapsed;
      updateWater(elapsed);
      plants.forEach((plant,i)=>{plant.rotation.z=Math.sin(elapsed*.75+i)*.22;plant.children.forEach((jaw,j)=>jaw.rotation.x=(j?1:-1)*(.55+.22*Math.sin(elapsed+i)));});
      petals.forEach((petal,i)=>petal.rotation.z=petal.userData['angle']+Math.sin(elapsed*.45+i*.7)*.012);
      (core.material as THREE.MeshStandardMaterial).emissiveIntensity=1.25+Math.sin(elapsed*1.3)*.15;
    },
  };
}
