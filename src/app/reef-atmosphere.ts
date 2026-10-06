import * as THREE from 'three';

/** World-space colour and relief stay continuous across the coral's growing surfaces. */
export function coralMaterial(color:string,vertexColors=false,fade?:{bottom:number;top:number}) {
  const material=new THREE.MeshStandardMaterial({color,vertexColors,roughness:.88,emissive:color,emissiveIntensity:.018,transparent:!!fade,depthWrite:!fade});
  material.onBeforeCompile=shader=>{
    if(fade){
      shader.uniforms['reefFade']={value:new THREE.Vector2(fade.bottom,fade.top)};
      shader.uniforms['reefWater']={value:new THREE.Color('#245767')};
    }
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 reefPosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 reefLocal=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        reefLocal=instanceMatrix*reefLocal;
      #endif
      reefPosition=(modelMatrix*reefLocal).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 reefPosition;
      uniform vec2 reefFade;
      uniform vec3 reefWater;
      float reefHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float reefNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(reefHash(i),reefHash(i+vec3(1,0,0)),f.x),mix(reefHash(i+vec3(0,1,0)),reefHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(reefHash(i+vec3(0,0,1)),reefHash(i+vec3(1,0,1)),f.x),mix(reefHash(i+vec3(0,1,1)),reefHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float reefRelief(vec3 p){return reefNoise(p*3.5)*.03+reefNoise(p*15.)*.009+sin(p.y*5.+reefNoise(p*.9)*5.)*.012;}
      vec3 reefNormal(vec3 n,vec3 p,float h){vec3 dx=dFdx(p),dy=dFdy(p);vec3 r1=cross(dy,n),r2=cross(n,dx);float det=dot(dx,r1);
        return normalize(abs(det)*n-sign(det)*(dFdx(h)*r1+dFdy(h)*r2));}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float colony=reefNoise(reefPosition*.24);
      float mottling=reefNoise(reefPosition*1.7);
      float pores=reefNoise(reefPosition*15.);
      diffuseColor.rgb*=.63+colony*.48+mottling*.22;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.14,1.04,.88),smoothstep(.6,.85,mottling)*.45);
      diffuseColor.rgb*=.82+.24*smoothstep(.22,.65,pores);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      normal=reefNormal(normal,-vViewPosition,reefRelief(reefPosition));`);
    if(fade)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      // Break up the transition in world space so neighbouring branches share the same veil.
      float heightInWater=reefPosition.y+(reefNoise(reefPosition*.065)-.5)*7.;
      float baseFade=smoothstep(reefFade.x,reefFade.y,heightInWater);
      float viewScale=max(1.,length(cameraPosition-vec3(0.,18.,-9.))/115.);
      float distanceFade=1.-smoothstep(105.,240.,length(vViewPosition)/viewScale);
      outgoingLight=mix(outgoingLight,reefWater,(1.-baseFade)*.6);
      diffuseColor.a*=pow(baseFade,1.35)*distanceFade;
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>`porous-coral-v4:${vertexColors}:${!!fade}`;
  return material;
}

/** Soft scattered light over an alpha canvas; every atmospheric layer has feathered edges. */
export function buildReefAtmosphere(group:THREE.Group,random:()=>number) {
  const time={value:0};
  const shaftMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{time,phase:{value:0}},
    vertexShader:`varying vec2 st;uniform float time;uniform float phase;void main(){
      st=uv;vec3 p=position;
      p.x*=mix(1.65,.6,uv.y);
      p.x+=sin(uv.y*4.+time*.36+phase)*1.2*(1.-uv.y);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`,
    fragmentShader:`varying vec2 st;uniform float time;uniform float phase;void main(){
      float edge=pow(max(0.,sin(st.x*3.14159265)),2.);
      float end=smoothstep(0.,.3,st.y)*(1.-smoothstep(.86,1.,st.y));
      float ripple=sin(st.x*19.+sin(st.y*7.-time*.55+phase)*1.4+time*.31+phase);
      float filaments=.65+.35*pow(.5+.5*ripple,2.);
      float shimmer=.74+.16*sin(time*.63+phase+st.y*5.)+.1*sin(time*1.07-phase+st.y*11.);
      gl_FragColor=vec4(.92,.88,.64,edge*end*filaments*shimmer*.15);
    }`,
  });
  const shafts:THREE.Group[]=[];
  // Two crossed ribbons per shaft prevent a hard cylindrical outline as the camera moves.
  for(let i=0;i<7;i++) {
    const shaft=new THREE.Group();shaft.position.set(-45+i*15,38,-43-i%3*15);shaft.rotation.z=-.27;
    shaft.name='reef-sun-shaft';
    const material=shaftMaterial.clone();material.uniforms['time']=time;material.uniforms['phase'].value=i*2.37;
    for(const angle of [0,Math.PI/2]) {
      const beam=new THREE.Mesh(new THREE.PlaneGeometry(5+i%3*2,115),material);beam.rotation.y=angle;shaft.add(beam);
    }
    group.add(shaft);shafts.push(shaft);
  }
  shaftMaterial.dispose();
  // Broad, softly feathered pools of light create separation between the reef layers.
  const hazeMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 st;void main(){float d=length((st-.5)*2.);float a=exp(-d*d*5.)*(1.-smoothstep(.65,1.,d));gl_FragColor=vec4(.26,.65,.56,a*.11);}',
  });
  for(let i=0;i<5;i++) {
    const haze=new THREE.Mesh(new THREE.PlaneGeometry(120,65),hazeMaterial);
    haze.position.set((i%2?1:-1)*22,-30+i*19,-80-i*15);group.add(haze);
  }
  // A slow, translucent current conceals the roots without painting an opaque sky.
  const mistMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time},
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 st;uniform float time;void main(){
      vec2 p=(st-.5)*2.;float edge=exp(-dot(p,p)*2.4)*(1.-smoothstep(.55,1.,length(p)));
      float current=.72+.18*sin(st.x*9.+sin(st.y*7.+time*.12)+time*.09)
        +.1*sin(st.x*17.-st.y*8.-time*.15);
      gl_FragColor=vec4(.1,.3,.35,edge*current*.34);
    }`,
  });
  for(let i=0;i<4;i++){
    const mist=new THREE.Mesh(new THREE.PlaneGeometry(205,80),mistMaterial);
    mist.name='reef-root-mist';mist.position.set((i%2?1:-1)*15,-18+i*4,-25-i*30);group.add(mist);
  }
  const motesGeometry=new THREE.BufferGeometry(),motes:number[]=[];
  for(let i=0;i<230;i++)motes.push((random()-.5)*115,-18+random()*105,-80+random()*110);
  motesGeometry.setAttribute('position',new THREE.Float32BufferAttribute(motes,3));
  const plankton=new THREE.Points(motesGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time},
    vertexShader:'uniform float time;varying float glow;void main(){vec3 p=position;p.x+=sin(time*.1+p.y)*.4;p.y+=sin(time*.16+p.z)*.5;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(65./max(1.,-mv.z),1.,4.);glow=.35+.25*sin(position.x*2.+time*.4);}',
    fragmentShader:'varying float glow;void main(){float d=length(gl_PointCoord-.5)*2.;float a=exp(-d*d*5.)*(1.-smoothstep(.4,1.,d));gl_FragColor=vec4(1.,.8,.48,a*glow);}',
  }));plankton.frustumCulled=false;group.add(plankton);
  return (elapsed:number)=>{
    time.value=elapsed;
    shafts.forEach((shaft,i)=>{
      const phase=i*2.37;
      shaft.rotation.z=-.27+Math.sin(elapsed*.22+phase)*.035+Math.sin(elapsed*.39+phase)*.012;
      shaft.position.x=-45+i*15+Math.sin(elapsed*.18+phase)*1.4;
    });
  };
}
