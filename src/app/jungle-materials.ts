import * as THREE from 'three';

const noise=`
float jHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float jNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(jHash(i),jHash(i+vec3(1,0,0)),f.x),mix(jHash(i+vec3(0,1,0)),jHash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(jHash(i+vec3(0,0,1)),jHash(i+vec3(1,0,1)),f.x),mix(jHash(i+vec3(0,1,1)),jHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float jFbm(vec3 p){return jNoise(p)*.57+jNoise(p*2.1)*.27+jNoise(p*4.3)*.16;}
vec3 jBump(vec3 n,vec3 p,float h){vec3 dx=dFdx(p),dy=dFdy(p),a=cross(dy,n),b=cross(n,dx);float det=dot(dx,a);return normalize(abs(det)*n-sign(det)*(dFdx(h)*a+dFdy(h)*b));}
`;

/** Continuous grain, lichen, veins and microrelief; no flat colour or stretched image textures. */
export function jungleMaterial(kind:'bark'|'moss'|'leaf'|'petal',color:string,vertexColors=false,time={value:0}) {
  const material=new THREE.MeshStandardMaterial({color,vertexColors,roughness:kind==='leaf'?.62:.92,side:THREE.DoubleSide,emissive:color,emissiveIntensity:kind==='petal'?.055:kind==='leaf'?.025:0});
  material.onBeforeCompile=shader=>{
    shader.uniforms['jTime']=time;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 jPosition;varying vec2 jUV;uniform float jTime;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      jUV=uv;
      ${kind==='leaf'?`float phase=0.;
        #ifdef USE_INSTANCING
          phase=instanceMatrix[3].x*.3+instanceMatrix[3].z*.4;
        #endif
        transformed.z+=sin(jTime*.65+phase+position.y*1.3)*.055*pow(clamp(uv.y,0.,1.),2.);`:''}
      vec4 local=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        local=instanceMatrix*local;
      #endif
      jPosition=(modelMatrix*local).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 jPosition;varying vec2 jUV;${noise}`);
    const treatment={
      bark:`float broad=jFbm(jPosition*.42);float grain=jFbm(jPosition*vec3(3.6,.48,3.6));
        float fissure=smoothstep(.55,.78,jFbm(jPosition*vec3(9.,1.2,9.)));
        float speckle=jNoise(jPosition*27.);float moss=jFbm(jPosition*.9);
        diffuseColor.rgb*=.48+broad*.65+grain*.38-fissure*.25;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.20,.25,.10),smoothstep(.60,.79,moss)*.55);
        float relief=grain*.032+fissure*.012+speckle*.003;`,
      moss:`float clump=jFbm(jPosition*3.5);float fine=jNoise(jPosition*43.);
        diffuseColor.rgb*=.6+clump*.65+fine*.22;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.31,.30,.12),smoothstep(.65,.82,clump)*.45);
        float relief=clump*.045+fine*.015;`,
      leaf:`float side=abs(jUV.x-.5)*2.;float midrib=exp(-side*75.);
        float veins=pow(max(0.,cos((jUV.y-side*.16)*100.)),20.)*(1.-side);
        float mottling=jFbm(jPosition*4.);float edge=smoothstep(.84,1.,side);
        diffuseColor.rgb*=.72+mottling*.38;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.35,1.16,.72),midrib*.7+veins*.2+edge*.15);
        float relief=midrib*.018+veins*.006+jNoise(jPosition*65.)*.0015;`,
      petal:`float lateral=abs(jUV.x-.5)*2.;float vein=pow(max(0.,cos(lateral*48.+sin(jUV.y*8.)*.8)),16.);
        float freckle=smoothstep(.75,.9,jNoise(vec3(jUV*150.,2.)))*(1.-jUV.y);
        diffuseColor.rgb*=.86+jFbm(jPosition*3.)*.2-vein*.11-freckle*.25;
        float relief=vein*.014+jNoise(jPosition*55.)*.001;`,
    }[kind];
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${treatment}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=jBump(normal,-vViewPosition,relief);');
  };
  material.customProgramCacheKey=()=>`jungle-${kind}-${vertexColors}-v1`;
  return material;
}

/** A botanical blade with a folded midrib, asymmetric outline and torn banana-leaf margins. */
export function jungleLeafGeometry(fern=false) {
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  const rows=fern?12:24,columns=8;
  for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++) {
    const t=i/rows,u=j/columns*2-1;
    const notch=fern?1:1-.24*Math.pow(Math.max(0,Math.sin(t*93)),16)*Math.abs(u)**8;
    const width=Math.sin(Math.PI*t)**.7*(fern?.25:.78)*(1-t*.2)*notch;
    positions.push(u*width*(1+.07*Math.sin(t*12+u)),t*(fern?1.8:3.8),Math.sin(Math.PI*t)*.24*(1-u*u)-t*t*.45+Math.sin(t*17+u*2)*.04*Math.abs(u));
    uv.push(j/columns,t);
    if(i<rows&&j<columns){const n=i*(columns+1)+j;indices.push(n,n+1,n+columns+1,n+1,n+columns+2,n+columns+1);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

export function jungleAtmosphere(group:THREE.Group,time:{value:number},random:()=>number) {
  const haze=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time},
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 st;uniform float time;${noise}
      void main(){vec2 q=(st-.5)*2.;float edge=exp(-dot(q,q)*2.4)*(1.-smoothstep(.7,1.,length(q)));
      float n=jFbm(vec3(st*5.,time*.025));gl_FragColor=vec4(.23,.38,.32,edge*(.15+n*.26));}`});
  for(let i=0;i<6;i++) {
    const cloud=new THREE.Mesh(new THREE.PlaneGeometry(135,65),haze);cloud.position.set(i%2?-18:18,5+i*4,-25-i*13);group.add(cloud);
  }
  const shaftMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 st;void main(){float side=pow(max(0.,sin(st.x*3.14159)),3.);float end=smoothstep(0.,.25,st.y)*(1.-smoothstep(.8,1.,st.y));gl_FragColor=vec4(.8,.84,.59,side*end*.09);}'});
  for(let i=0;i<5;i++) {
    const shaft=new THREE.Mesh(new THREE.PlaneGeometry(5+i%2*4,80),shaftMaterial);shaft.position.set(-30+i*14,27,-12-i%3*9);shaft.rotation.z=-.3;group.add(shaft);
  }
  const positions:number[]=[];
  for(let i=0;i<140;i++)positions.push((random()-.5)*70,random()*50-6,-25+random()*38);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const pollen=new THREE.Points(geo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time},
    vertexShader:'uniform float time;void main(){vec3 p=position;p.x+=sin(time*.12+p.y)*.5;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(45./max(1.,-mv.z),1.,3.);}',
    fragmentShader:'void main(){float a=1.-smoothstep(.05,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.86,.91,.67,a*.36);}'}));group.add(pollen);
}
