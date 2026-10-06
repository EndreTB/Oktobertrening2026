import * as THREE from 'three';
import type { RealmComposition } from './realm-environments';
import { walkway } from './landscape-details';

const v = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);

/** The walk follows the chapter ring and fixed bearing bridges of one skeleton clock. */
export function buildClockwork(group:THREE.Group): RealmComposition {
  const brass = new THREE.MeshStandardMaterial({color:'#b68a45',metalness:.72,roughness:.38});
  const gold = new THREE.MeshStandardMaterial({color:'#e5bc70',metalness:.65,roughness:.3});
  const bronze = new THREE.MeshStandardMaterial({color:'#685039',metalness:.6,roughness:.6});
  const iron = new THREE.MeshStandardMaterial({color:'#283b3c',metalness:.7,roughness:.5});
  const wood = new THREE.MeshStandardMaterial({color:'#35261f',roughness:.86});
  const enamel = new THREE.MeshStandardMaterial({color:'#e6d3a9',metalness:.12,roughness:.55});
  const ink = new THREE.MeshStandardMaterial({color:'#302920',metalness:.2,roughness:.55});
  const glow = new THREE.MeshStandardMaterial({color:'#fff0bc',emissive:'#ffd387',emissiveIntensity:1.5,roughness:.3});
  const mesh = (geometry:THREE.BufferGeometry,material:THREE.Material,position:THREE.Vector3,parent:THREE.Object3D=group) => {
    const object=new THREE.Mesh(geometry,material);object.position.copy(position);
    object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  };
  const beam = (a:THREE.Vector3,b:THREE.Vector3,radius:number,material:THREE.Material,parent:THREE.Object3D=group) => {
    const object=mesh(new THREE.CylinderGeometry(radius,radius,a.distanceTo(b),8),material,a.clone().lerp(b,.5),parent);
    object.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());return object;
  };
  const ring = (radius:number,thickness:number,position:THREE.Vector3,material:THREE.Material,parent:THREE.Object3D=group) =>
    mesh(new THREE.TorusGeometry(radius,thickness,8,120),material,position,parent);
  const disk = (radius:number,depth:number,position:THREE.Vector3,material:THREE.Material,parent:THREE.Object3D=group) => {
    const object=mesh(new THREE.CylinderGeometry(radius,radius,depth,80),material,position,parent);object.rotation.x=Math.PI/2;return object;
  };
  const tube = (points:THREE.Vector3[],radius:number,material:THREE.Material) =>
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),240,radius,8,false),material,v(0,0,0));

  // A continuous circular wooden case, ivory chapter ring, and a pendulum window below it.
  const centre=v(0,17,-4);
  disk(20.2,1.2,centre.clone().add(v(0,0,-2)),wood);
  ring(20,.55,centre,wood);ring(19.6,.17,centre.clone().add(v(0,0,.45)),gold);
  const chapter=mesh(new THREE.RingGeometry(16.8,19.3,128),enamel,centre.clone().add(v(0,0,.4)));chapter.name='clock-chapter-ring';
  ring(16.7,.16,centre.clone().add(v(0,0,.5)),brass);
  // The deep inner bezel is a real part of the case, carrying the first part of the walk.
  const bezelShape=new THREE.Shape();bezelShape.absarc(0,0,16.65,0,Math.PI*2,false);
  const opening=new THREE.Path();opening.absarc(0,0,15.25,0,Math.PI*2,true);bezelShape.holes.push(opening);
  mesh(new THREE.ExtrudeGeometry(bezelShape,{depth:3.5,bevelEnabled:false,curveSegments:96}),bronze,v(0,17,-3.6));
  ring(16.55,.07,v(0,17,.02),gold);
  for(const x of [-6.5,6.5])mesh(new THREE.BoxGeometry(.65,12,3.5),wood,v(x,-5,-4.7));
  mesh(new THREE.BoxGeometry(13.6,12,.6),wood,v(0,-5,-6.1));
  mesh(new THREE.BoxGeometry(14.5,.65,4),bronze,v(0,-11,-4.5));
  for(const x of [-6.5,6.5])beam(v(x,-10.5,-2.8),v(x,.8,-2.8),.1,gold);

  // Raised Roman numerals need no image textures and remain crisp in the overview.
  const numerals=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
  for(let i=0;i<60;i++) {
    const a=i*Math.PI/30;
    const tick=mesh(new THREE.BoxGeometry(i%5?.055:.12,i%5?.22:.48,.065),ink,v(Math.sin(a)*19,17+Math.cos(a)*19,-3.52));tick.rotation.z=-a;
  }
  numerals.forEach((numeral,i)=>{
    const a=i*Math.PI/6,letters=new THREE.Group();letters.position.set(Math.sin(a)*18,17+Math.cos(a)*18,-3.48);group.add(letters);
    [...numeral].forEach((letter,j)=>{
      const x=(j-(numeral.length-1)/2)*.48;
      const stroke=(ax:number,ay:number,bx:number,by:number)=>beam(v(x+ax,ay,0),v(x+bx,by,0),.055,ink,letters);
      if(letter==='I') {stroke(0,-.55,0,.55);stroke(-.14,.55,.14,.55);stroke(-.14,-.55,.14,-.55);}
      if(letter==='V') {stroke(-.19,.55,0,-.55);stroke(0,-.55,.19,.55);}
      if(letter==='X') {stroke(-.19,-.55,.19,.55);stroke(-.19,.55,.19,-.55);}
    });
  });

  // A single train with a common tooth pitch. Distances and angular speeds derive from its radii.
  const gears:{object:THREE.Group;speed:number;phase:number;radius:number}[]=[];
  function gear(position:THREE.Vector3,teeth:number,speed:number,phase:number) {
    const radius=teeth*.15;
    const wheel=new THREE.Group();wheel.name='clockwork-gear';wheel.position.copy(position);wheel.rotation.z=phase;
    wheel.userData['pitchRadius']=radius;wheel.userData['teeth']=teeth;group.add(wheel);
    ring(radius-.4,.36,v(0,0,0),brass,wheel);ring(radius-.7,.035,v(0,0,.3),gold,wheel);
    disk(.65,.8,v(0,0,0),bronze,wheel);
    const teethMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.43,.48,.65),gold,teeth);
    const spokes=new THREE.InstancedMesh(new THREE.BoxGeometry(.23,(radius-.45)*2,.35),brass,3);
    const dummy=new THREE.Object3D();
    for(let i=0;i<teeth;i++) {
      const a=i/teeth*Math.PI*2;dummy.position.set(Math.cos(a)*radius,Math.sin(a)*radius,0);dummy.rotation.z=a-Math.PI/2;dummy.updateMatrix();teethMesh.setMatrixAt(i,dummy.matrix);
    }
    dummy.position.set(0,0,0);
    for(let i=0;i<3;i++){dummy.rotation.z=i*Math.PI/3;dummy.updateMatrix();spokes.setMatrixAt(i,dummy.matrix);}
    teethMesh.castShadow=true;spokes.castShadow=true;wheel.add(teethMesh,spokes);
    beam(position.clone().setZ(-5.8),position.clone().setZ(.45),.2,iron);
    disk(.42,.24,position.clone().setZ(.45),gold);
    gears.push({object:wheel,speed,phase,radius});
  }
  const train=[{x:-4.8,y:6,teeth:28},{x:3.3,y:0,teeth:32},{x:-3.2,y:0,teeth:28},{x:3.8,y:0,teeth:30},{x:0,y:0,teeth:16}];
  train.forEach((item,i)=>{
    const r=item.teeth*.15;
    let phase=0;
    if(i) {
      const previous=train[i-1],prior=gears[i-1],distance=r+prior.radius;
      item.y=previous.y+Math.sqrt(distance*distance-(item.x-previous.x)**2);
      const contact=Math.atan2(item.y-previous.y,item.x-previous.x);
      // Align a tooth on one wheel with the space on its neighbour at the contact point.
      const previousPhase=(contact-prior.phase)*previous.teeth;
      phase=contact+Math.PI-(Math.PI-previousPhase)/item.teeth;
    }
    gear(v(item.x,item.y,-1.6),item.teeth,(i%2?-1:1)*.2/r,phase);
  });
  // Fixed bearing rails join the arbors. These stay still while the wheels turn behind them.
  for(let i=0;i<train.length-1;i++) {
    const a=train[i],b=train[i+1];beam(v(a.x,a.y,-.72),v(b.x,b.y,-.72),.2,bronze);
  }
  for(const item of train) {
    disk(.65,.18,v(item.x,item.y,-.62),bronze);
    ring(.44,.045,v(item.x,item.y,-.5),gold);
  }

  const pendulum=new THREE.Group();pendulum.name='clockwork-pendulum';pendulum.position.set(0,25,-4.4);group.add(pendulum);
  beam(v(0,0,0),v(0,-32,0),.1,gold,pendulum);
  disk(2,.45,v(0,-32,0),brass,pendulum);ring(1.7,.055,v(0,-32,.25),gold,pendulum);
  disk(.35,.2,v(0,0,.15),gold,pendulum);
  // The fork and anchor move with the pendulum, visibly tying it to the upper escapement.
  beam(v(0,0,0),v(-1.6,-1,0),.09,bronze,pendulum);beam(v(0,0,0),v(1.6,-1,0),.09,bronze,pendulum);

  // Large, dark clock hands make the complete mechanism read as a clock at a glance.
  const mainHands:THREE.Group[]=[];
  for(const [length,angle] of [[8.4,Math.PI/3],[12.2,-Math.PI/3]]) {
    const hand=new THREE.Group();hand.position.set(0,17,-.23);hand.rotation.z=angle;group.add(hand);
    mesh(new THREE.BoxGeometry(.25,length,.16),gold,v(0,length/2,0),hand);
    const tip=mesh(new THREE.ConeGeometry(.48,1.3,4),gold,v(0,length,0),hand);tip.rotation.y=Math.PI/4;
    ring(.48,.075,v(0,length*.7,0),gold,hand);mainHands.push(hand);
  }
  disk(.7,.25,v(0,17,-.05),gold);

  // Walk on the inner chapter-ring flange, then on the central movement bridge and upper bearing rim.
  const anchors:THREE.Vector3[]=[];
  for(let i=0;i<=32;i++) {
    const t=i/32,a=-Math.PI/2-t*Math.PI/2;
    anchors.push(v(Math.cos(a)*15.7,17+Math.sin(a)*15.7,.7+t*1.9));
  }
  anchors.push(v(-13.5,17.45,3),v(-9,17.8,2.6),v(-4.5,18.15,2),v(-2.8,19,1.8));
  const upper=train[3],rim=5.2;
  anchors.push(v(upper.x-rim-.8,upper.y-1.3,2.1));
  for(let i=0;i<=24;i++) {
    const t=i/24,a=Math.PI-t*Math.PI/2;
    anchors.push(v(upper.x+Math.cos(a)*rim,upper.y+Math.sin(a)*rim,2.3+t*.7));
  }
  anchors.push(v(2.8,29.3,2.8),v(0,30.1,2.3));
  const points=new THREE.CatmullRomCurve3(anchors).getPoints(320),route=new THREE.CatmullRomCurve3(points);
  const deck=walkway(group,route,1.65,'#a77f43','#efcc87',true);deck.name='clockwork-bridge';
  (deck.material as THREE.MeshStandardMaterial).metalness=.65;
  (deck.material as THREE.MeshStandardMaterial).roughness=.42;
  // Continuous cast ribs turn the route into the clock's load-bearing structure.
  tube(points.map(p=>p.clone().add(v(0,-.48,-.42))),.28,bronze);
  tube(points.map(p=>p.clone().add(v(0,-.48,.42))),.28,brass);
  // An annular housing follows the same rim as the upper part of the walk.
  ring(rim,.32,v(upper.x,upper.y,1.15),bronze);
  for(let i=0;i<=12;i++) {
    const a=i/12*Math.PI*2;
    const bolt=v(upper.x+Math.cos(a)*rim,upper.y+Math.sin(a)*rim,1.5);
    disk(.095,.08,bolt,gold);
  }
  for(let i=0;i<=22;i++) {
    const p=route.getPointAt(i/22),d=route.getTangentAt(i/22);
    // Short, substantial spacers attach the walking flange directly to the clock plate.
    beam(p.clone().add(v(0,-.5,-.4)),v(p.x,p.y-.5,-3.5),.14,bronze);
    const lamp=p.clone().add(v(d.z,0,-d.x).normalize().multiplyScalar(-.74));
    disk(.11,.1,p.clone().add(v(0,-.45,.72)),gold);
    if(i%2===0) {
      beam(lamp.clone().add(v(0,-.1,0)),lamp.clone().add(v(0,.8,0)),.045,bronze);
      mesh(new THREE.SphereGeometry(.1,10,8),glow,lamp.clone().add(v(0,.86,0)));
    }
  }

  // The final portal is a small astronomical subdial, carried by the upper clock plate.
  const end=points.at(-1)!;
  const landing=mesh(new THREE.CylinderGeometry(1.8,1.8,.4,48),brass,end.clone().add(v(0,-.3,0)));landing.name='clockwork-landing';
  const clock=new THREE.Group();clock.name='star-clock';clock.position.copy(end).add(v(0,1.7,-.5));group.add(clock);
  disk(2.65,.4,v(0,0,-.25),iron,clock);
  ring(2.68,.13,v(0,0,0),gold,clock);ring(2.38,.035,v(0,0,.02),brass,clock);
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    const tick=mesh(new THREE.BoxGeometry(.055,i%3===0?.3:.16,.07),gold,v(Math.sin(a)*2.15,Math.cos(a)*2.15,.04),clock);tick.rotation.z=-a;
    mesh(new THREE.SphereGeometry(.05,8,6),glow,v(Math.sin(a)*1.85,Math.cos(a)*1.85,.07),clock);
  }
  const hands:THREE.Group[]=[];
  for(const length of [1.2,1.7]) {
    const hand=new THREE.Group();hand.position.z=.14;clock.add(hand);
    mesh(new THREE.BoxGeometry(.07,length,.06),gold,v(0,length/2,0),hand);hands.push(hand);
  }
  hands[0].rotation.z=.6;hands[1].rotation.z=-.8;
  mesh(new THREE.SphereGeometry(.15,12,8),glow,v(0,0,.2),clock);
  const starShape=new THREE.Shape();
  for(let i=0;i<10;i++) {
    const a=Math.PI/2+i*Math.PI/5,r=i%2?.26:.65;
    if(i)starShape.lineTo(Math.cos(a)*r,Math.sin(a)*r);else starShape.moveTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  starShape.closePath();
  mesh(new THREE.ExtrudeGeometry(starShape,{depth:.12,bevelEnabled:false}),glow,v(0,3.3,0),clock);
  ring(.87,.025,v(0,3.3,0),gold,clock);
  const beacon=new THREE.PointLight('#ffcf83',24,17,2);beacon.position.copy(clock.position).add(v(0,1,2));group.add(beacon);

  const lookAt=v(0,16,0),overview=v(2,21,72),followOffset=v(3,4,17);
  return {
    points,overview,lookAt,followOffset,
    cameraPose(point,aspect,overviewAmount,pointer={x:0,y:0}) {
      const framing=Math.max(1,.85/aspect);
      const target=point.clone().add(v(0,1.1,0)).lerp(lookAt,overviewAmount);
      const follow=point.clone().add(followOffset.clone().multiplyScalar(Math.max(1,.65/aspect)));
      const wide=lookAt.clone().add(overview.clone().sub(lookAt).multiplyScalar(framing));
      const position=follow.lerp(wide,overviewAmount).add(v(pointer.x*2,pointer.y*1.5,0));
      return {position,target};
    },
    animate(elapsed) {
      gears.forEach(({object,speed,phase})=>object.rotation.z=phase+elapsed*speed);
      pendulum.rotation.z=Math.sin(elapsed*1.15)*.08;
      mainHands[0].rotation.z=Math.PI/3-elapsed*.001;mainHands[1].rotation.z=-Math.PI/3-elapsed*.012;
      hands[0].rotation.z=.6-elapsed*.012;hands[1].rotation.z=-.8-elapsed*.07;
    },
  };
}
