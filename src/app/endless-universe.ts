import * as THREE from 'three';
import type { RealmComposition } from './realm-environments';

const TAU = Math.PI * 2;
const RISE = 38;
const v = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
/** A cycle is only a bookkeeping boundary: both its position and tangent continue into the next. */
export function universePoint(turn:number):THREE.Vector3 {
  const angle=turn*TAU+.65;
  return v(Math.cos(angle)*24,turn*RISE,Math.sin(angle)*24);
}
const noise = `
  float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
  float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  float fbm(vec3 p){return noise(p)*.55+noise(p*2.03)*.27+noise(p*4.07)*.12+noise(p*8.13)*.06;}
`;
const planetVertex=`varying vec3 p; varying vec3 n; varying vec3 eye;
  void main(){p=position; n=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);eye=-mv.xyz;gl_Position=projectionMatrix*mv;}`;

function planet(group:THREE.Group,position:THREE.Vector3,radius:number,tint:string,gas:boolean,rings:boolean) {
  const system=new THREE.Group();system.position.copy(position);system.rotation.set(.48,0,-.36);group.add(system);
  const light=v(-.65,.65,.7).normalize();
  const surface=new THREE.ShaderMaterial({
    uniforms:{tint:{value:new THREE.Color(tint)},gas:{value:gas?1:0},sun:{value:light}},
    vertexShader:planetVertex,
    fragmentShader:`uniform vec3 tint;uniform float gas;uniform vec3 sun;varying vec3 p;varying vec3 n;varying vec3 eye;${noise}
    void main(){vec3 q=normalize(p);float clouds=fbm(q*9.);
      float latitude=q.y+noise(q*5.)*.055;
      float bands=fbm(vec3(latitude*22.,clouds*1.5,2.));
      bands+=sin(latitude*180.+clouds*3.)*.045;
      vec3 rock=mix(tint*.42,tint*1.3,fbm(q*18.));
      float relief=0.;
      for(int i=0;i<26;i++){float f=float(i);vec3 c=normalize(vec3(hash(vec3(f,1,0)),hash(vec3(f,2,0)),hash(vec3(f,3,0)))*2.-1.);
        float d=length(q-c),r=.055+hash(vec3(f,4,0))*.13;
        relief+=exp(-pow((d-r)/.018,2.))*.24-(1.-smoothstep(r*.65,r,d))*.25;}
      rock*=1.+relief;
      vec3 cloud=mix(tint*.62,vec3(.94,.87,.72),smoothstep(.25,.8,bands)*.65+clouds*.12);
      vec3 albedo=mix(rock,cloud,gas);
      vec3 viewSun=normalize(mat3(viewMatrix)*sun);
      float daylight=max(0.,dot(normalize(n),viewSun));
      vec3 color=albedo*(.035+daylight*1.3);
      float rim=pow(1.-max(0.,dot(normalize(n),normalize(eye))),4.);
      color+=tint*rim*.12*smoothstep(-.2,.4,dot(normalize(n),viewSun));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const body=new THREE.Mesh(new THREE.SphereGeometry(radius,72,48),surface);body.name=gas?'banded-planet':'cratered-moon';system.add(body);
  if(gas){
    const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(radius*1.025,48,32),new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{tint:{value:new THREE.Color(tint)},sun:{value:light}},vertexShader:planetVertex,
      fragmentShader:`uniform vec3 tint;uniform vec3 sun;varying vec3 n;varying vec3 eye;void main(){float rim=pow(1.-max(0.,dot(normalize(n),normalize(eye))),3.);float day=smoothstep(-.3,.7,dot(normalize(n),normalize(mat3(viewMatrix)*sun)));gl_FragColor=vec4(tint,rim*day*.35);}`,
    }));system.add(atmosphere);
  }
  if(rings){
    const ring=new THREE.Mesh(new THREE.RingGeometry(radius*1.38,radius*2.12,160,1),new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{radius:{value:radius},tint:{value:new THREE.Color(tint)},sun:{value:light.clone().applyQuaternion(system.quaternion.clone().invert())}},
      vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform float radius;uniform vec3 tint;uniform vec3 sun;varying vec3 p;
      void main(){float r=length(p.xy)/radius;float grain=.62+.19*sin(r*220.)+.12*sin(r*597.);
        float gap=1.-smoothstep(.014,.027,abs(r-1.79));
        float alpha=grain*(1.-gap*.93)*smoothstep(1.38,1.43,r)*(1.-smoothstep(2.04,2.12,r));
        vec3 pos=vec3(p.x,0.,-p.y);float along=dot(pos,sun);float shadow=step(along,0.)*(1.-smoothstep(radius*.94,radius*1.04,length(pos-sun*along)));
        gl_FragColor=vec4(mix(tint,vec3(.87,.82,.71),.5)*(1.-shadow*.88),alpha*.82);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }));ring.rotation.x=-Math.PI/2;ring.name='planet-rings';system.add(ring);
  }
}

export function buildEndlessUniverse(group:THREE.Group,era:number):RealmComposition {
  const points=Array.from({length:321},(_,i)=>universePoint(era+i/320));
  // Extend well beyond the far plane in either direction; neither end can enter the camera frustum.
  const start=era-9,end=era+10,segments=3800;
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const edgePoints:THREE.Vector3[][]=[[],[]];
  for(let i=0;i<=segments;i++){
    const turn=THREE.MathUtils.lerp(start,end,i/segments),p=universePoint(turn),radial=v(p.x,0,p.z).normalize();
    for(const side of [-1,1]){
      const edge=p.clone().addScaledVector(radial,side*1.35);edge.y-=.035;
      positions.push(...edge.toArray());uvs.push((side+1)/2,(turn-start)*155);
      edgePoints[(side+1)/2].push(edge.clone().add(v(0,.055,0)));
    }
    if(i<segments){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const paving=new THREE.MeshStandardMaterial({color:'#b5b6c3',metalness:.38,roughness:.52,side:THREE.DoubleSide});
  paving.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 pavingUv;').replace('#include <uv_vertex>','#include <uv_vertex>\npavingUv=uv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 pavingUv;').replace('#include <color_fragment>',`#include <color_fragment>
      float joint=1.-smoothstep(.015,.045,min(fract(pavingUv.y),1.-fract(pavingUv.y)));
      float edge=smoothstep(.83,.97,abs(pavingUv.x-.5)*2.);
      diffuseColor.rgb*=1.-joint*.32;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.43,.32,.17),edge*.65);`);
  };
  const path=new THREE.Mesh(geometry,paving);path.name='endless-walkway';path.receiveShadow=true;group.add(path);
  const underside=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#333b50',metalness:.65,roughness:.4,side:THREE.DoubleSide}));underside.position.y=-.22;group.add(underside);
  const edgeMaterial=new THREE.MeshBasicMaterial({color:'#ecd5a1',toneMapped:false});
  for(const edge of edgePoints){
    const curve=new THREE.CatmullRomCurve3(edge);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,segments,.028,4,false),edgeMaterial));
  }
  // The same absolute sectors are retained across cycle boundaries, so nearby planets never jump.
  for(let sector=era-4;sector<=era+5;sector++){
    const warm=((sector%3)+3)%3===0;
    planet(group,v(-3,sector*RISE+18,-3),warm?7:5.4,warm?'#c6a47a':'#789cae',true,true);
    planet(group,v(9,sector*RISE+31,4),2.15,'#a8a6aa',false,false);
    planet(group,v(-35,sector*RISE+27,-28),3.4,'#8d8fa6',false,false);
  }
  const stars:number[]=[],colors:number[]=[];
  let seed=173;
  const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<3000;i++){
    const a=random()*TAU,r=100+random()*130;
    stars.push(Math.cos(a)*r,(-7+random()*15)*RISE,Math.sin(a)*r);
    const c=new THREE.Color().setHSL(.55+random()*.12,.12+random()*.2,.5+random()*.45);colors.push(c.r,c.g,c.b);
  }
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));starGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const starfield=new THREE.Points(starGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,vertexColors:true,
    vertexShader:'varying vec3 tint;void main(){tint=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(420./-mv.z,1.5,3.5);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'varying vec3 tint;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(tint,(1.-smoothstep(.15,1.,r))*.95);}',
  }));starfield.name='distant-stars';
  const starLayer=Math.floor(era/15);
  for(let layer=starLayer-1;layer<=starLayer+1;layer++){const field=starfield.clone();field.position.y=layer*15*RISE;group.add(field);}
  return {
    points,overview:v(60,era*RISE+30,66),lookAt:v(0,era*RISE+18,0),followOffset:v(20,10,23),
    cameraPose(point,aspect,overview,pointer={x:0,y:0}) {
      const radial=v(point.x,0,point.z).normalize(),side=v(-radial.z,0,radial.x);
      const distance=THREE.MathUtils.lerp(20,48,overview)*Math.max(1,Math.min(1.65,.85/aspect));
      const target=point.clone().addScaledVector(radial,-overview*9).add(v(0,3+overview*6,0));
      const position=point.clone().addScaledVector(radial,distance).addScaledVector(side,-distance*.24+pointer.x*3).add(v(0,10+overview*14+pointer.y*2,0));
      return {position,target};
    },
  };
}
