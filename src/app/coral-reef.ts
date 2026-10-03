import * as THREE from 'three';
import type { RealmComposition } from './realm-environments';
import { buildReefAtmosphere, coralMaterial } from './reef-atmosphere';

const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
const mat=coralMaterial;
function reefCameraPose(point:THREE.Vector3,aspect:number,overview:number) {
  const zoom=aspect<.85?1.1:1,framing=Math.max(1,1.12/aspect);
  const target=point.clone().add(v(0,1,0)),wideTarget=v(0,18,-9);
  const wide=wideTarget.clone().add(v(8,43,112).multiplyScalar(framing));
  return {position:point.clone().add(v(2,8,23).multiplyScalar(zoom)).lerp(wide,overview),target:target.lerp(wideTarget,overview)};
}

/** The coral is the terrain: colossal living shelves and limbs, suspended above the blue deep. */
export function buildCoralReef(group:THREE.Group,random:()=>number):RealmComposition {
  const reef=new THREE.Group();reef.name='coral-reef';group.add(reef);
  const palette=['#d17d66','#b77486','#dbad70','#589f90','#8883a6','#d99b7d'].map(color=>mat(color));
  const pale=new THREE.MeshStandardMaterial({color:'#f6c687',emissive:'#efa44d',emissiveIntensity:.65,roughness:.65});
  const atmosphere=buildReefAtmosphere(reef,random);
  const lightTime={value:0};
  const causticMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:lightTime},
    vertexShader:'varying vec3 p; varying float up; void main(){p=position;up=normal.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*.025,1.0);}',
    fragmentShader:'varying vec3 p; varying float up; uniform float time; void main(){float a=sin(p.x*1.35+sin(p.z*1.1+time*.21))+sin(p.z*1.7+sin(p.x*1.2-time*.17));float line=pow(1.0-abs(sin(a*2.8+time*.16)),20.0);gl_FragColor=vec4(1.,.84,.53,line*.13*smoothstep(.3,.8,up));}',
  });
  function add(geometry:THREE.BufferGeometry,material:THREE.Material,position=v(0,0,0),parent:THREE.Object3D=reef) {
    const mesh=new THREE.Mesh(geometry,material);mesh.position.copy(position);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function living(geometry:THREE.BufferGeometry,material:THREE.Material) {
    const mesh=add(geometry,material);mesh.name='walkable-coral';
    const glimmer=add(geometry,causticMaterial);glimmer.castShadow=false;return mesh;
  }
  function tube(points:THREE.Vector3[],radius:number,material:THREE.Material,endRatio=.07) {
    const curve=new THREE.CatmullRomCurve3(points),geo=new THREE.TubeGeometry(curve,48,radius,12,false),positions=geo.getAttribute('position');
    for(let i=0;i<=48;i++) {
      const center=curve.getPointAt(i/48),taper=1-(1-endRatio)*(i/48)**1.5;
      for(let j=0;j<=12;j++) {
        const index=i*13+j;
        const ribs=1+.045*Math.sin(j/12*Math.PI*12+i*.25)+.025*Math.sin(i*.7+j*2);
        const p=new THREE.Vector3().fromBufferAttribute(positions,index).sub(center).multiplyScalar(taper*ribs).add(center);
        positions.setXYZ(index,p.x,p.y,p.z);
      }
    }
    geo.computeVertexNormals();return add(geo,material);
  }
  function geometry(positions:number[],indices:number[]) {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
  }
  const shelves=[
    {center:v(-25,0,10),radius:8.5,color:0},
    {center:v(-1,7,4),radius:9,color:1},
    {center:v(22,14,-3),radius:8.5,color:2},
    {center:v(2,22,-12),radius:10,color:3},
    {center:v(-22,30,-19),radius:9,color:4},
    {center:v(6,38,-29),radius:12,color:5},
  ];
  const shelfTop=(radius:number,angle:number)=>-.12-.6*radius**4+.06*Math.cos(radius*14)*Math.sin(angle*9)*radius;
  for(const [index,shelf] of shelves.entries()) {
    const positions:number[]=[],indices:number[]=[],rings=32,sides=112;
    // Both sides of each scalloped plate form one substantial living colony.
    for(let face=0;face<2;face++)for(let r=0;r<=rings;r++)for(let j=0;j<=sides;j++) {
      const a=j/sides*Math.PI*2,t=r/rings;
      const radius=shelf.radius*(1+.065*Math.sin(a*7+index)+.025*Math.sin(a*17))*t;
      const y=shelfTop(t,a)-(face?(.65+2.6*Math.sqrt(1-t)):0);
      positions.push(shelf.center.x+Math.cos(a)*radius,shelf.center.y+y,shelf.center.z+Math.sin(a)*radius);
      if(r<rings&&j<sides) {
        const n=face*(rings+1)*(sides+1)+r*(sides+1)+j;
        if(face===0)indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);
        else indices.push(n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2);
      }
    }
    const last=rings*(sides+1),offset=(rings+1)*(sides+1);
    for(let j=0;j<sides;j++)indices.push(last+j,last+j+1,last+j+offset,last+j+1,last+j+offset+1,last+j+offset);
    const plate=living(geometry(positions,indices),palette[shelf.color]);plate.userData['diameter']=shelf.radius*2;
    // Thick coral trunks continue down out of the frame, with rooted, layered side shelves.
    const c=shelf.center;
    tube([c.clone().add(v(index%2?3:-3,-220,-4)),c.clone().add(v(-2,-24,-1)),c.clone().add(v(0,-2,0))],4.1,palette[shelf.color],.62);
    for(let j=0;j<3;j++) {
      const disk=add(new THREE.SphereGeometry(1,32,16),palette[shelf.color],c.clone().add(v((j%2?1:-1)*3,-7-j*7,-3)));
      disk.scale.set(5.5-j*.65,.55,4-j*.4);
    }
  }
  const raw=new THREE.CatmullRomCurve3([
    v(-31,.18,11),v(-25,.18,10),v(-18,.18,9),v(-14,3.5,8),v(-11,7.18,7),v(-7,7.18,5),v(0,7.18,4),v(7,7.18,3),
    v(11,10.5,1),v(13,14.18,-1),v(18,14.18,-2),v(24,14.18,-3),v(28,14.18,-7),
    v(24,18,-11),v(13,22.18,-12),v(8,22.18,-12),v(0,22.18,-12),v(-7,22.18,-14),
    v(-12,26,-16),v(-12,30.18,-19),v(-18,30.18,-19),v(-25,30.18,-20),v(-29,30.18,-23),
    v(-23,34,-28),v(-8,38.18,-30),v(-3,38.18,-30),v(6,38.18,-29),v(15,38.18,-27),
  ]);
  const points=raw.getPoints(520).map(p=>{
    for(const shelf of shelves) {
      const dx=p.x-shelf.center.x,dz=p.z-shelf.center.z,angle=Math.atan2(dz,dx);
      const edge=shelf.radius*(1+.065*Math.sin(angle*7+shelves.indexOf(shelf))+.025*Math.sin(angle*17));
      const r=Math.hypot(dx,dz)/edge;
      if(r<=1&&Math.abs(p.y-shelf.center.y)<4)p.y=Math.max(p.y,shelf.center.y+shelfTop(r,angle)+.14);
    }
    return p;
  });
  const route=new THREE.CatmullRomCurve3(points);
  // An organic, porous coral limb joins every shelf. Its broad top is the walking surface.
  const positions:number[]=[],indices:number[]=[],colors:number[]=[],samples=route.getSpacedPoints(640);
  for(let i=0;i<=640;i++) {
    const p=samples[i],d=route.getTangentAt(i/640),side=v(d.z,0,-d.x).normalize();
    const radius=2.1+.7*Math.sin(i/640*Math.PI)**2;
    const colorPosition=i/640*(palette.length-1),colorIndex=Math.floor(colorPosition);
    const color=palette[colorIndex].color.clone().lerp(palette[Math.min(colorIndex+1,palette.length-1)].color,colorPosition-colorIndex);
    for(let j=0;j<=24;j++) {
      const a=j/24*Math.PI*2,q=p.clone().addScaledVector(side,Math.cos(a)*radius*(1+.018*Math.cos(a*11+i*.12)));
      q.y+=Math.min(1,Math.sin(a)/.72)*radius*.7-radius*.7-.13;
      positions.push(...q.toArray());
      const c=color.clone().multiplyScalar(.88+.12*Math.sin(a)+.025*Math.sin(i*.8+j*3));colors.push(c.r,c.g,c.b);
      if(i<640&&j<24){const n=i*25+j;indices.push(n,n+1,n+25,n+1,n+26,n+25);}
    }
  }
  const limbGeometry=geometry(positions,indices);limbGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  living(limbGeometry,coralMaterial('#ffffff',true));
  // The beginnings and endings grow down into their host plates; no severed branch ends.
  for(const t of [0,1]) {
    const p=route.getPoint(t),d=route.getTangent(t).multiplyScalar(t===0?-1:1);
    tube([p.clone().add(v(0,-1.6,0)),p.clone().addScaledVector(d,2).add(v(0,-1.8,0)),p.clone().addScaledVector(d,4).add(v(0,-3,0))],1.9,palette[t===0?0:5]);
  }

  // Fleshy, amber-tipped polyps catch the warm light; fine pores live in the coral shader.
  const polyps=new THREE.InstancedMesh(new THREE.SphereGeometry(.085,8,6),pale,1080),dummy=new THREE.Object3D();
  let polyp=0;
  for(const shelf of shelves)for(let j=0;j<180;j++) {
    const a=random()*Math.PI*2,r=.25+random()*.66,x=shelf.center.x+Math.cos(a)*r*shelf.radius,z=shelf.center.z+Math.sin(a)*r*shelf.radius;
    const y=shelf.center.y+shelfTop(r,a);
    dummy.position.set(x,y+.055,z);dummy.rotation.set(0,0,0);dummy.scale.set(.75,1.4+random()*.8,.75);dummy.updateMatrix();polyps.setMatrixAt(polyp++,dummy.matrix);
  }
  reef.add(polyps);

  // Monumental tube colonies and sea fans tower over the tiny diver, behind the route.
  const cup=new THREE.LatheGeometry([new THREE.Vector2(1.5,0),new THREE.Vector2(2.3,4),new THREE.Vector2(2.7,14),new THREE.Vector2(3.3,22),new THREE.Vector2(2.8,22.1),new THREE.Vector2(2.15,16),new THREE.Vector2(1.4,9)],28);
  const cupPositions=cup.getAttribute('position');
  for(let i=0;i<cupPositions.count;i++) {
    const p=new THREE.Vector3().fromBufferAttribute(cupPositions,i),a=Math.atan2(p.z,p.x),r=1+.065*Math.sin(a*7+p.y*.2)+.025*Math.sin(a*13-p.y*.3);
    p.x=p.x*r+Math.sin(p.y*.09)*.85;p.z=p.z*r+Math.sin(p.y*.15)*.38;p.y+=Math.sin(a*5)*.45*(p.y/22)**3;
    cupPositions.setXYZ(i,p.x,p.y,p.z);
  }
  cup.computeVertexNormals();
  for(let i=0;i<15;i++) {
    const cluster=[[-45,-57],[36,-78],[-7,-113],[64,-66],[3,-76]][Math.floor(i/3)];
    const x=cluster[0]+(i%3-1)*6,z=cluster[1]-random()*10,y=-27+random()*19;
    const sponge=add(cup,palette[(Math.floor(i/3)+1)%6],v(x,y,z));sponge.scale.set(1.1+random()*.65,1.25+random()*1.7,1.1+random()*.6);sponge.rotation.z=(random()-.5)*.2;
  }
  for(const [x,y,z,color] of [[-49,-7,-30,0],[44,2,-33,4],[-13,12,-65,2]]) {
    const base=v(x,y,z),m=palette[color];
    for(let j=0;j<13;j++) {
      const a=-1.35+j/12*2.7;
      const curl=Math.sin(j*1.8)*1.5;
      tube([base,base.clone().add(v(Math.sin(a)*8,9+Math.cos(a)*5,0)),base.clone().add(v(Math.sin(a)*22+curl,12+Math.cos(a)*26,1+curl))],.38,m);
      if(j>0)for(const r of [.45,.65,.85,1]) {
        const before=-1.35+(j-1)/12*2.7;
        tube([base.clone().add(v(Math.sin(before)*22*r,12*r+Math.cos(before)*26*r,r)),base.clone().add(v(Math.sin(a)*22*r,12*r+Math.cos(a)*26*r,r))],.17,m);
      }
    }
  }
  for(let i=0;i<8;i++) {
    const root=v(-60+i*17,-37,-78),m=palette[i%6];
    const center=root.clone().add(v(0,28,0));tube([root,root.clone().add(v(2,15,0)),center],3,m);
    for(let j=0;j<4;j++) {
      const end=center.clone().add(v((j-1.5)*7,18+random()*12,0));
      tube([center,center.clone().lerp(end,.65),end],1.7,m);
      tube([end.clone().add(v(0,-7,0)),end.clone().add(v(4,2,1)),end.clone().add(v(7,7,2))],.75,m);
    }
  }
  // A deep, irregular reef wall and distant arch anchor the colonies in a much larger habitat.
  const distant=mat('#20575a'),middle=mat('#34736d');
  for(let i=0;i<17;i++) {
    const rock=add(new THREE.IcosahedronGeometry(1,2),i%3?distant:middle,v(-108+i*14,-35+random()*17,-118-random()*55));
    rock.scale.set(9+random()*9,22+random()*34,10+random()*15);rock.rotation.set(random()*.5,random()*3,random()*.4);
  }
  for(const side of [-1,1])tube([v(side*74,-45,-135),v(side*65,8,-126),v(side*41,58,-115),v(side*6,70,-116)],7,distant,.5);
  for(let i=0;i<9;i++) {
    const rock=add(new THREE.IcosahedronGeometry(1,2),distant,v(-90+i*24,-95,-40-random()*55));
    rock.scale.set(17,15+random()*12,25);rock.rotation.y=random()*4;
  }
  const fish:THREE.Group[]=[];
  const sphere=new THREE.SphereGeometry(1,12,8),eyeMaterial=new THREE.MeshBasicMaterial({color:'#103547'});
  for(let i=0;i<18;i++) {
    const f=new THREE.Group(),m=palette[i%2?2:3];
    const body=add(sphere,m,v(0,0,0),f);body.scale.set(1.5,.62,.38);
    const tail=add(new THREE.ConeGeometry(.75,1.2,3),m,v(-1.7,0,0),f);tail.rotation.z=Math.PI/2;
    const eye=add(sphere,eyeMaterial,v(.9,.17,.33),f);eye.scale.setScalar(.085);
    f.position.set(-42+random()*84,12+random()*48,-48-random()*12);f.scale.setScalar(.7+random()*.65);
    f.userData['origin']=f.position.clone();reef.add(f);fish.push(f);
  }
  const bubbles=new THREE.InstancedMesh(new THREE.SphereGeometry(.15,8,6),new THREE.MeshPhysicalMaterial({color:'#b8f3ff',transparent:true,opacity:.32,roughness:.1,depthWrite:false}),75);
  const bubbleOrigins=Array.from({length:75},()=>v((random()-.5)*95,-25+random()*95,-45+random()*55));
  function updateBubbles(time:number) {
    bubbleOrigins.forEach((p,i)=>{dummy.position.set(p.x+Math.sin(time*.3+i)*.4,-25+(p.y+25+time*.8)%95,p.z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(.5+(i%5)*.24);dummy.updateMatrix();bubbles.setMatrixAt(i,dummy.matrix);});
    bubbles.instanceMatrix.needsUpdate=true;
  }
  updateBubbles(0);bubbles.frustumCulled=false;reef.add(bubbles);
  return {
    points,overview:v(8,61,103),lookAt:v(0,18,-9),followOffset:v(2,8,23),cameraPose:reefCameraPose,
    animate:(elapsed)=>{
      lightTime.value=elapsed;updateBubbles(elapsed);atmosphere(elapsed);
      fish.forEach((f,i)=>{const phase=elapsed*.13+i*.7;f.position.copy(f.userData['origin']).add(v(Math.sin(phase)*5,Math.sin(phase*.8)*.8,0));f.rotation.y=Math.cos(phase)>0?0:Math.PI;f.children[1].rotation.y=Math.sin(elapsed*4+i)*.25;});
    },
  };
}
