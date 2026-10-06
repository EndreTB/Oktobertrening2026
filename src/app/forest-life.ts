import * as THREE from 'three';

const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);

/** Smooth, separated gusts, with a travelling front across the branches. */
export function forestWind(elapsed:number,x=0,z=0) {
  const time=elapsed-x*.065-z*.04;
  const pulse=(period:number,offset:number,duration:number)=>{
    const phase=THREE.MathUtils.euclideanModulo(time-offset,period);
    return phase<duration?Math.sin(Math.PI*phase/duration)**2:0;
  };
  return Math.min(1,pulse(19,5,6.5)*.85+pulse(31,17,8)*.65);
}

/** Shared sculpted blade: raised midrib, cupped edges and a gently drooping tip. */
function leafGeometry() {
  const positions:number[]=[],colors:number[]=[],indices:number[]=[];
  const rows=18,columns=8,dark=new THREE.Color('#345c30'),light=new THREE.Color('#8eac59');
  for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++) {
    const t=i/rows,u=j/columns*2-1;
    const width=Math.pow(Math.sin(Math.PI*t),.85)*.57*(1-.2*t);
    const ridge=Math.sin(Math.PI*t)*.16;
    positions.push(u*width,2.4*t,ridge*(1-u*u)-.24*t*t+u*.065*Math.sin(Math.PI*t));
    const veins=Math.pow(Math.max(0,Math.cos((t-Math.abs(u)*.12)*Math.PI*16)),18);
    const c=dark.clone().lerp(light,.24+.27*(1-Math.abs(u))+.14*veins+(j===4?.22:0));
    colors.push(c.r,c.g,c.b);
    if(i<rows&&j<columns){const n=i*(columns+1)+j;indices.push(n,n+1,n+columns+1,n+1,n+columns+2,n+columns+1);}
  }
  const stalk=positions.length/3;
  positions.push(-.013,-.22,0,.013,-.22,0,.008,.025,0,-.008,.025,0);
  for(let i=0;i<4;i++)colors.push(dark.r,dark.g,dark.b);
  indices.push(stalk,stalk+1,stalk+2,stalk,stalk+2,stalk+3);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

export function createForestLife(group:THREE.Group,random:()=>number,moss:THREE.Material) {
  const bladeGeometry=leafGeometry();
  const foliage=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.74});
  const twigMaterial=new THREE.MeshStandardMaterial({color:'#617346',roughness:.95});
  const twigGeometry=new THREE.CylinderGeometry(.014,.033,1.6,5);
  const sprigs:{pivot:THREE.Group;rest:THREE.Quaternion;phase:number;position:THREE.Vector3}[]=[];
  const leaves:{pivot:THREE.Group;rest:THREE.Euler;phase:number;position:THREE.Vector3}[]=[];
  const curtains:{pivot:THREE.Group;phase:number}[]=[];

  function sprig(position:THREE.Vector3,size:number,direction:THREE.Vector3,roll=0) {
    const pivot=new THREE.Group();pivot.name='forest-sprig';pivot.position.copy(position);
    pivot.quaternion.setFromUnitVectors(v(0,1,0),direction.clone().normalize());pivot.rotateY(roll);
    pivot.scale.setScalar(size);group.add(pivot);
    sprigs.push({pivot,rest:pivot.quaternion.clone(),phase:random()*Math.PI*2,position:position.clone()});
    const twig=new THREE.Mesh(twigGeometry,twigMaterial);twig.position.y=.8;pivot.add(twig);
    // Alternating leaves emerge from actual petioles along the twig, not a single fan point.
    for(let i=0;i<5;i++) {
      const leaf=new THREE.Group();leaf.name='forest-leaf';leaf.position.set(0,.22+i*.29,0);
      leaf.rotation.set(-.18+random()*.35,random()*.5-.25,i===4?.12:(i%2?1:-1)*(1.02+random()*.22));
      leaf.scale.setScalar((i===4?.55:.6+random()*.15));pivot.add(leaf);
      const blade=new THREE.Mesh(bladeGeometry,foliage);blade.position.y=.22;
      blade.scale.x=.85+random()*.3;blade.castShadow=true;blade.receiveShadow=true;leaf.add(blade);
      leaves.push({pivot:leaf,rest:leaf.rotation.clone(),phase:random()*Math.PI*2,position:position.clone()});
    }
  }

  function hangingMoss(position:THREE.Vector3,length:number) {
    const pivot=new THREE.Group();pivot.name='forest-moss';pivot.position.copy(position);group.add(pivot);
    for(let i=0;i<3;i++) {
      const x=(i-1)*.12,h=length*(.65+random()*.35);
      const curve=new THREE.CatmullRomCurve3([v(x,0,0),v(x+.09,-h*.4,.06),v(x-.12,-h*.8,.12),v(x+.03,-h,.08)]);
      const strand=new THREE.Mesh(new THREE.TubeGeometry(curve,12,.018,4,false),moss);pivot.add(strand);
    }
    curtains.push({pivot,phase:random()*Math.PI*2});
  }

  // Loose leaves descend below the walking level, keeping the hiker's silhouette clear.
  const drift=new THREE.InstancedMesh(bladeGeometry,foliage,18);drift.name='forest-falling-leaves';
  drift.instanceMatrix.setUsage(THREE.DynamicDrawUsage);drift.frustumCulled=false;group.add(drift);
  const drifting=Array.from({length:18},()=>({angle:random()*Math.PI*2,radius:29+random()*16,height:random()*64,speed:.32+random()*.3,phase:random()*6,size:.1+random()*.1}));
  const dustPositions=new Float32Array(90*3);
  const dust=Array.from({length:90},()=>({x:(random()-.5)*70,y:random()*45-12,z:(random()-.5)*60,phase:random()*6}));
  const dustGeometry=new THREE.BufferGeometry();
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3).setUsage(THREE.DynamicDrawUsage));
  const pollen=new THREE.Points(dustGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{},
    vertexShader:'void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(95.0/-p.z,1.0,4.0);}',
    fragmentShader:'void main(){float r=length(gl_PointCoord-.5)*2.0;float a=(1.0-smoothstep(.15,1.0,r))*.48;gl_FragColor=vec4(.85,.92,.59,a);}',
  }));
  pollen.name='forest-pollen';pollen.frustumCulled=false;group.add(pollen);
  const dummy=new THREE.Object3D(),bend=new THREE.Quaternion(),axis=v(.35,0,-1).normalize();
  let driftDistance=0;
  function animate(elapsed:number,dt:number) {
    const gust=forestWind(elapsed);
    driftDistance+=Math.max(0,Math.min(dt,.08))*(.3+gust*2.1);
    for(const item of sprigs) {
      const wind=forestWind(elapsed,item.position.x,item.position.z);
      const sway=.025*Math.sin(elapsed*.8+item.phase)+wind*(.13+.025*Math.sin(elapsed*3+item.phase));
      item.pivot.quaternion.copy(item.rest).multiply(bend.setFromAxisAngle(axis,sway));
    }
    for(const item of leaves) {
      const wind=forestWind(elapsed,item.position.x,item.position.z);
      item.pivot.rotation.copy(item.rest);
      item.pivot.rotation.x+=Math.sin(elapsed*1.5+item.phase)*.07+wind*(.16+Math.sin(elapsed*5.2+item.phase)*.09);
      item.pivot.rotation.y+=Math.sin(elapsed*1.1+item.phase)*.045+wind*Math.sin(elapsed*3.8+item.phase)*.1;
    }
    for(const {pivot,phase} of curtains) {
      const wind=forestWind(elapsed,pivot.position.x,pivot.position.z);
      pivot.rotation.z=.035*Math.sin(elapsed*.9+phase)+wind*.21;
      pivot.rotation.x=.025*Math.sin(elapsed*.7+phase)+wind*.07;
    }
    drifting.forEach((leaf,i)=>{
      const angle=leaf.angle+driftDistance*.012;
      dummy.position.set(Math.cos(angle)*leaf.radius+Math.sin(elapsed*.65+leaf.phase)*.8,-4-THREE.MathUtils.euclideanModulo(leaf.height+elapsed*leaf.speed,64),-6.8+Math.sin(angle)*leaf.radius);
      dummy.rotation.set(elapsed*.5+leaf.phase,elapsed*.3+leaf.phase,Math.sin(elapsed*1.3+leaf.phase)*.65);
      dummy.scale.setScalar(leaf.size);dummy.updateMatrix();drift.setMatrixAt(i,dummy.matrix);
    });
    drift.instanceMatrix.needsUpdate=true;
    dust.forEach((mote,i)=>{
      dustPositions[i*3]=THREE.MathUtils.euclideanModulo(mote.x+driftDistance,70)-35;
      dustPositions[i*3+1]=mote.y+Math.sin(elapsed*.45+mote.phase)*.6;
      dustPositions[i*3+2]=mote.z+Math.sin(elapsed*.3+mote.phase)*.8;
    });
    dustGeometry.attributes['position'].needsUpdate=true;
  }
  // Reduced-motion users see a fully initialized, still forest.
  animate(0,0);
  return {sprig,hangingMoss,animate};
}
