import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const JUNGLE_WATER_LEVEL=46;

/** An inverted lake faces down and reflects the forest hanging beneath it. */
export function jungleWater(group:THREE.Group,time:{value:number}) {
  const water=new Reflector(new THREE.PlaneGeometry(320,320),{
    textureWidth:512,textureHeight:512,multisample:0,clipBias:.003,
    shader:{
      name:'JungleLake',
      uniforms:{color:{value:new THREE.Color('#608975')},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},time},
      vertexShader:`uniform mat4 textureMatrix;varying vec4 reflectionUV;varying vec3 worldPosition;
        void main(){reflectionUV=textureMatrix*vec4(position,1.);worldPosition=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform sampler2D tDiffuse;uniform float time;varying vec4 reflectionUV;varying vec3 worldPosition;
        void main(){vec2 p=worldPosition.xz;
          vec2 wave=vec2(sin(p.x*.65+p.y*.41+time*.55)+sin(p.y*1.4-time*.42)*.35,
            cos(p.y*.72-p.x*.28+time*.38)+sin(p.x*1.2+time*.6)*.3);
          vec2 uv=reflectionUV.xy/reflectionUV.w+wave*.0018;
          vec3 reflected=texture2D(tDiffuse,uv).rgb;
          vec3 normal=normalize(vec3(wave.x*.045,-1.,wave.y*.045));
          vec3 view=normalize(cameraPosition-worldPosition);
          float fresnel=.34+.50*pow(1.-max(0.,dot(view,normal)),3.);
          vec3 lake=mix(vec3(.025,.105,.09),reflected*vec3(.76,.91,.85),fresnel);
          float glint=pow(max(0.,dot(reflect(-normalize(vec3(-.4,-1.,.5)),normal),view)),170.);
          lake+=vec3(.74,.78,.55)*glint*.3;
          gl_FragColor=vec4(lake,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  water.name='jungle-lake';water.rotation.x=Math.PI/2;water.position.y=JUNGLE_WATER_LEVEL;
  (water.material as THREE.ShaderMaterial).uniforms['time']=time;
  // disposeWorld owns materials; release the reflection buffer with its material.
  (water.material as THREE.ShaderMaterial).addEventListener('dispose',()=>water.getRenderTarget().dispose());
  group.add(water);

  const rippleMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time},
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float time;varying vec2 st;void main(){float r=length(st-.5)*2.;
      float ring=pow(.5+.5*cos(r*49.-time*1.5),12.);float fade=smoothstep(.04,.24,r)*(1.-smoothstep(.35,1.,r));
      gl_FragColor=vec4(.52,.69,.59,ring*fade*.16);}`});
  for(const x of [-23,21]) {
    const ripple=new THREE.Mesh(new THREE.PlaneGeometry(11,11),rippleMaterial);
    ripple.name='waterfall-impact-ripple';ripple.rotation.x=Math.PI/2;ripple.position.set(x,JUNGLE_WATER_LEVEL-.025,-9);group.add(ripple);
  }
  return water;
}
