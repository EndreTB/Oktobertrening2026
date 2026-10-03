import * as THREE from 'three';

/** World-space colour and relief stay continuous across the coral's growing surfaces. */
export function coralMaterial(color:string,vertexColors=false) {
  const material=new THREE.MeshStandardMaterial({color,vertexColors,roughness:.88,emissive:color,emissiveIntensity:.018});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 reefPosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 reefLocal=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        reefLocal=instanceMatrix*reefLocal;
      #endif
      reefPosition=(modelMatrix*reefLocal).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 reefPosition;
      float reefHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float reefNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(reefHash(i),reefHash(i+vec3(1,0,0)),f.x),mix(reefHash(i+vec3(0,1,0)),reefHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(reefHash(i+vec3(0,0,1)),reefHash(i+vec3(1,0,1)),f.x),mix(reefHash(i+vec3(0,1,1)),reefHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float reefRelief(vec3 p){return reefNoise(p*3.5)*.085+reefNoise(p*15.)*.035+sin(p.y*5.+reefNoise(p*.9)*5.)*.012;}
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
  };
  material.customProgramCacheKey=()=>`porous-coral-v1:${vertexColors}`;
  return material;
}

/** Soft scattered light and a deep-water gradient, with no opaque backdrop panels. */
export function buildReefAtmosphere(group:THREE.Group,random:()=>number) {
  const time={value:0};
  const water=new THREE.Mesh(new THREE.SphereGeometry(350,32,24),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,
    uniforms:{deep:{value:new THREE.Color('#021a24')},middle:{value:new THREE.Color('#0b5554')},top:{value:new THREE.Color('#72afa0')},sun:{value:new THREE.Color('#ffe3a3')}},
    vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 direction;uniform vec3 deep;uniform vec3 middle;uniform vec3 top;uniform vec3 sun;
      void main(){vec3 d=normalize(direction);float height=smoothstep(-.6,.75,d.y);
        vec3 color=mix(deep,middle,smoothstep(0.,.57,height));color=mix(color,top,pow(height,3.));
        float light=pow(max(0.,dot(d,normalize(vec3(-.4,.72,-.6)))),22.);
        color+=sun*light*.85;gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  water.name='deep-water-atmosphere';water.frustumCulled=false;water.renderOrder=-100;
  water.onBeforeRender=(_renderer,_scene,camera)=>{water.position.copy(camera.position);water.updateMatrixWorld();};group.add(water);

  const shaftMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{time},
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 st;uniform float time;void main(){
      float edge=pow(max(0.,sin(st.x*3.14159265)),3.);
      float end=smoothstep(0.,.16,st.y)*(1.-smoothstep(.82,1.,st.y));
      float shimmer=.8+.2*sin(time*.23+st.y*8.+st.x*4.);
      gl_FragColor=vec4(1.,.82,.5,edge*end*shimmer*.085);
    }`,
  });
  // Two crossed ribbons per shaft prevent a hard cylindrical outline as the camera moves.
  for(let i=0;i<7;i++) {
    const shaft=new THREE.Group();shaft.position.set(-45+i*15,38,-43-i%3*15);shaft.rotation.z=-.27;
    for(const angle of [0,Math.PI/2]) {
      const beam=new THREE.Mesh(new THREE.PlaneGeometry(4+i%3*2,115),shaftMaterial);beam.rotation.y=angle;shaft.add(beam);
    }
    group.add(shaft);
  }
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
  const motesGeometry=new THREE.BufferGeometry(),motes:number[]=[];
  for(let i=0;i<230;i++)motes.push((random()-.5)*115,-18+random()*105,-80+random()*110);
  motesGeometry.setAttribute('position',new THREE.Float32BufferAttribute(motes,3));
  const plankton=new THREE.Points(motesGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time},
    vertexShader:'uniform float time;varying float glow;void main(){vec3 p=position;p.x+=sin(time*.1+p.y)*.4;p.y+=sin(time*.16+p.z)*.5;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(65./max(1.,-mv.z),1.,4.);glow=.2+.3*sin(position.x*2.+time*.4);}',
    fragmentShader:'varying float glow;void main(){float d=length(gl_PointCoord-.5)*2.;float a=exp(-d*d*5.)*(1.-smoothstep(.4,1.,d));gl_FragColor=vec4(1.,.8,.48,a*glow);}',
  }));plankton.frustumCulled=false;group.add(plankton);
  return (elapsed:number)=>{time.value=elapsed;};
}
