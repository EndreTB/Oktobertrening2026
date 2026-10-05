import { TEAM_TARGET } from './participants';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import type * as THREE from 'three';
import { LIGHT_CYCLE, LIGHT_GLINT, JourneyWorld, journeyLegs, worldAt, worldProgress } from './worlds';
import type { WorldScene } from './world-scene';

export interface JourneyFrame { world: JourneyWorld; steps: number; moving: boolean; finished: boolean; }
@Component({
  selector: 'app-landscape', standalone: true,
  host: {'[class.explorable]': 'cinematic'},
  template: `<div class="landscape-canvas" #host role="img" [attr.aria-label]="'Turfiguren utforsker '+currentWorld().title" [attr.data-world]="currentWorld().id" [attr.data-moving]="moving()"></div>
    <div class="portal-flash" [class.active]="flashing()" aria-hidden="true"></div>
    @if(cinematic && !failed){
      <div class="map-controls" [attr.aria-label]="'Utforsk '+currentWorld().title">
        <div class="map-view"><button [class.selected]="mapView()==='overview'" [attr.aria-pressed]="mapView()==='overview'" (click)="setView('overview')">Kartoversikt</button><button [class.selected]="mapView()==='follow'" [attr.aria-pressed]="mapView()==='follow'" (click)="setView('follow')">Følg stien <span>↗</span></button></div>
        <label class="map-explore"><span>UTFORSK STIEN</span><input type="range" min="0" max="100" step="0.5" [value]="exploration() ?? routePosition" [attr.aria-label]="'Utforsk stien i '+currentWorld().title" (input)="explore($any($event.target).value)"><span>{{currentWorld().icon}}</span></label>
      </div>
    }
    @if(failed){<div class="scene-fallback"><span>{{currentWorld().icon}}</span><p>{{currentWorld().title}}</p><small>3D er ikke tilgjengelig her. Du kan fortsatt registrere skritt og følge fremdriften.</small></div>}`,
  styles: [`:host{display:block;width:100%;height:100%;position:relative;overflow:hidden}.landscape-canvas{width:100%;height:100%}.portal-flash{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse,#fff5d9c9,transparent 72%);opacity:0;transition:opacity .7s}.portal-flash.active{opacity:1}.scene-fallback{position:absolute;inset:0;display:grid;place-content:center;text-align:center;color:#eedbb4;padding:30px;gap:16px}.scene-fallback>span{font-size:90px}.scene-fallback p{font:28px Georgia,serif}.scene-fallback small{font-size:12px;max-width:300px;line-height:1.8}
    .map-controls{position:absolute;top:14px;left:24px;z-index:3;display:grid;gap:10px;width:220px;color:#e2d7ba}.map-view{display:flex;padding:3px;border:1px solid #dccba629;border-radius:30px;background:#101e2de0;backdrop-filter:blur(12px)}.map-view button{flex:1;padding:9px 8px;color:#a7b7be;border-radius:25px;background:transparent;font-size:10px}.map-view button.selected{background:#e5d4ad;color:#20323b}.map-view button span{margin-left:4px}.map-explore{display:flex;align-items:center;gap:10px;padding:0 8px}.map-explore span:first-child{font-size:6px;letter-spacing:1.2px;white-space:nowrap}.map-explore input{width:100%;height:16px;accent-color:#e5d4ad;cursor:pointer}.map-explore span:last-child{font-size:18px}@media(max-width:760px){:host(.explorable) .landscape-canvas{position:absolute;inset:52px 0 0;height:calc(100% - 52px)}.map-controls{top:9px;left:12px;width:calc(100% - 24px);display:flex;gap:10px;align-items:center}.map-view{flex:0 0 182px}.map-view button{font-size:9px;padding:8px 6px}.map-explore{flex:1;min-width:0;padding:0;gap:6px}.map-explore input{min-width:0;height:24px}.map-explore span:first-child{display:none}}@media(prefers-reduced-motion:reduce){.portal-flash{display:none}}`],
})
export class LandscapeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', {static:true}) host!: ElementRef<HTMLDivElement>;
  @Input() steps = 0;
  @Input() fromSteps = 0;
  @Input() cinematic = false;
  @Input() paused = false;
  @Input() person = 'Endre';
  @Output() frameChange = new EventEmitter<JourneyFrame>();
  currentWorld = signal(worldAt(0));
  moving = signal(false);
  flashing = signal(false);
  failed = false;
  mapView = signal<'overview'|'follow'>('follow');
  exploration = signal<number|null>(null);
  routePosition = 0;
  private viewTouched = false;
  setView(view: 'overview'|'follow') { this.viewTouched=true;this.mapView.set(view); }
  explore(value: string) { this.exploration.set(Number(value)); this.setView('follow'); }
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private built?: WorldScene;
  private resize?: ResizeObserver;
  private frame = 0;
  private destroyed = false;
  private disposeBuilt?: () => void;
  private cleanups: (() => void)[] = [];
  constructor(private zone: NgZone) {}
  ngAfterViewInit() {
    this.zone.runOutsideAngular(async () => {
      try { await this.create(); }
      catch {
        this.zone.run(() => {
          this.failed = true; this.currentWorld.set(worldAt(this.steps));
          this.frameChange.emit({world:worldAt(this.steps),steps:this.steps,moving:false,finished:true});
        });
      }
    });
  }
  private async create() {
    const [THREE, {createWorld, disposeWorld}] = await Promise.all([import('three'), import('./world-scene')]);
    if(this.destroyed)return;
    this.disposeBuilt=()=>{if(this.built)disposeWorld(this.built.group);};
    const host=this.host.nativeElement;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    this.renderer=renderer;renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const scene=new THREE.Scene();this.scene=scene;
    const camera=new THREE.PerspectiveCamera(39,1,.1,200);
    const ambient=new THREE.HemisphereLight('#ffefd8','#314640',2.7);scene.add(ambient);
    const sun=new THREE.DirectionalLight('#ffe0b5',2.8);sun.position.set(-14,22,10);scene.add(sun);
    sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-25,right:25,top:32,bottom:-22,near:.5,far:85});sun.shadow.normalBias=.06;sun.shadow.bias=-.0002;
    this.cleanups.push(()=>sun.shadow.dispose());
    const fill=new THREE.DirectionalLight('#bfdce8',1.2);fill.position.set(15,12,-10);scene.add(fill);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const legs=journeyLegs(this.fromSteps,this.steps);
    let shownId='',lastLeg=-1,elapsed=0,lastTime=0,lastReport=-1,visible=true,mx=0,my=0,flashAge=5,finishedReported=false;
    let cameraCut=true,overviewBlend=0;
    const legDurations=legs.map(leg=>leg.world.id==='body'?Math.max(12,(leg.to-leg.from)*55):leg.world.id==='forest'?Math.max(12,(leg.to-leg.from)*40):leg.world.id==='cosmos'?18:12);
    const cameraTarget=new THREE.Vector3(0,3,0);

    const desiredPosition=new THREE.Vector3(),desiredTarget=new THREE.Vector3();
    const size=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
    this.resize=new ResizeObserver(size);this.resize.observe(host);size();
    const observer=new IntersectionObserver(entries=>visible=entries[0].isIntersecting);observer.observe(host);this.cleanups.push(()=>observer.disconnect());
    const pointer=(event:PointerEvent)=>{const r=host.getBoundingClientRect();mx=(event.clientX-r.left)/r.width-.5;my=(event.clientY-r.top)/r.height-.5;};
    host.addEventListener('pointermove',pointer);this.cleanups.push(()=>host.removeEventListener('pointermove',pointer));
    const sceneKey=(info:JourneyWorld,steps:number)=>`${info.id}:${this.person}:${info.id==='light'?Math.floor((steps-TEAM_TARGET)/LIGHT_CYCLE)+':'+Math.floor((steps-TEAM_TARGET)/LIGHT_GLINT):''}`;
    const build=(info:JourneyWorld,flash:boolean,steps:number)=>{
      if(this.built){scene.remove(this.built.group);disposeWorld(this.built.group);}
      this.built=createWorld(info,this.person,steps);scene.add(this.built.group);shownId=sceneKey(info,steps);
      camera.far=info.id==='body'?500:200;camera.updateProjectionMatrix();
      cameraCut=true;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=info.id==='light'?1.05:1.15;renderer.shadowMap.enabled=true;sun.castShadow=true;
      ambient.intensity=info.id==='forest'?1.65:1.45;sun.intensity=3.3;fill.intensity=1.8;
      ambient.color.set(info.id==='body'?'#9ec6ae':'#ffefd8');
      sun.color.set(info.id==='body'?'#ffe1a2':'#ffe0b5');
      if(info.id==='body'){ambient.intensity=.85;sun.intensity=4.5;fill.intensity=.95;renderer.toneMappingExposure=1.08;}
      sun.position.set(-18,32,10);
      if(info.id==='body')sun.position.set(-36,88,28);
      Object.assign(sun.shadow.camera,info.id==='body'?{left:-65,right:65,top:85,bottom:-50,far:220}:{left:-25,right:25,top:32,bottom:-22,far:85});sun.shadow.camera.updateProjectionMatrix();
      const fillColors={mountain:'#b8d7d1',forest:'#96d7ba',body:'#50a7a4',micro:'#91b5ed',cosmos:'#8ccedc',light:'#b5bde4'};
      fill.color.set(fillColors[info.id]);
      scene.fog=new THREE.FogExp2(info.background,info.id==='body'?.011:info.id==='forest'?.01:.007);
      renderer.setClearColor(info.background,this.cinematic&&info.id!=='body'?1:0);
      ambient.groundColor.set(info.background);
      this.zone.run(()=>{this.currentWorld.set(info);this.flashing.set(flash&&!reduced.matches);this.exploration.set(null);});flashAge=0;
    };
    const animate=(time:number)=>{
      this.frame=requestAnimationFrame(animate);
      const dt=lastTime?Math.min((time-lastTime)/1000,.08):0;lastTime=time;
      if(document.hidden||!visible||this.paused)return;
      elapsed+=dt;flashAge+=dt;
      if(flashAge>.65&&this.flashing())this.zone.run(()=>this.flashing.set(false));
      let info=worldAt(this.steps),amount=worldProgress(this.steps),displayed=this.steps,isMoving=false,done=true;
      if(this.cinematic&&!reduced.matches){
        let index=0,legStart=0;
        while(index<legs.length-1&&elapsed>=legStart+legDurations[index]){legStart+=legDurations[index];index++;}
        const leg=legs[index],local=elapsed-legStart;
        const linear=Math.max(0,Math.min(1,(local-.7)/(legDurations[index]-2)));
        const eased=linear*linear*(3-2*linear);
        amount=THREE.MathUtils.lerp(leg.from,leg.to,eased);info=leg.world;
        displayed=THREE.MathUtils.lerp(leg.startSteps,leg.endSteps,eased);
        isMoving=linear>0&&linear<1&&leg.to>leg.from;
        done=index===legs.length-1&&linear===1;
        if(index!==lastLeg){build(info,lastLeg>=0,leg.startSteps);lastLeg=index;}
      } else if(shownId!==sceneKey(info,this.steps))build(info,false,this.steps);
      const built=this.built!;
      built.trail.setDrawRange(0,Math.floor(amount*240)*7*6);
      const location=this.exploration()!==null?this.exploration()!/100:amount;
      this.routePosition=location*100;
      if(this.exploration()!==null)isMoving=false;
      const point=built.route.getPoint(Math.max(0,Math.min(1,location))),tangent=built.route.getTangent(Math.max(0,Math.min(1,location)));
      built.wanderer.position.copy(point);
      built.wanderer.rotation.y=Math.atan2(tangent.x,tangent.z);
      const gait=isMoving?Math.sin(elapsed*13):0;
      built.wanderer.position.y+=Math.abs(gait)*.07;
      built.limbs.forEach((limb,i)=>limb.rotation.x=gait*(i===0||i===3?1:-1)*.6);
      if(!reduced.matches){
        built.animate?.(elapsed,dt);
        built.portal.rotation.z=elapsed*.18;built.portal.scale.setScalar((built.portal.userData['baseScale']??1)*(1+Math.sin(elapsed*2)*.025));
        built.floaters.forEach((object,i)=>{
          if(object.userData['pulse']){object.scale.setScalar(object.userData['baseScale']*(1+Math.pow(Math.max(0,Math.sin(elapsed*5)),6)*.045));}
          else {object.position.y=object.userData['baseY']+Math.sin(elapsed*.7+i)*.25;object.rotation.y+=dt*.12;}
        });
        built.particles.rotation.y+=dt*.013;
        if(!this.cinematic&&!built.cameraPose){built.group.rotation.y+=(mx*.16-built.group.rotation.y)*.03;built.group.rotation.x+=(my*.04-built.group.rotation.x)*.03;}
      }
      if(built.cameraPose){
        const overview=!this.cinematic||this.mapView()==='overview'?1:0;
        overviewBlend=cameraCut||reduced.matches?overview:THREE.MathUtils.lerp(overviewBlend,overview,1-Math.exp(-dt*3));
        const pose=built.cameraPose(point,camera.aspect,overviewBlend);
        desiredPosition.copy(pose.position);desiredTarget.copy(pose.target);
        // Keep the immense reef legible when a narrow screen pulls the overview far back.
        if(info.id==='body'&&scene.fog instanceof THREE.FogExp2){
          scene.fog.density=THREE.MathUtils.lerp(.009,.0048,overviewBlend)/THREE.MathUtils.lerp(1,Math.max(1,1.12/camera.aspect),overviewBlend);
        }
      } else if(this.cinematic){
        const zoom=camera.aspect<.85?1.5:1;
        const angle=location*.45;
        desiredPosition.copy(point).add(built.followOffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle).multiplyScalar(zoom));
        desiredTarget.copy(point).add(new THREE.Vector3(0,1.4,0));
        if(done&&!this.viewTouched&&this.mapView()!=='overview')this.zone.run(()=>this.mapView.set('overview'));
        if(this.mapView()==='overview'){
          const framing=Math.max(1,.95/camera.aspect);
          desiredPosition.copy(built.lookAt).add(built.overview.clone().sub(built.lookAt).multiplyScalar(framing));desiredTarget.copy(built.lookAt);
        }
      } else {
        const framing=camera.aspect<.85?1.15:1;
        desiredPosition.copy(built.lookAt).add(built.overview.clone().sub(built.lookAt).multiplyScalar(framing));desiredTarget.copy(built.lookAt);
      }
      // Custom camera paths keep the walker framed even when scrubbing across the scene.
      if(built.cameraPose||cameraCut||elapsed<.05||reduced.matches){
        camera.position.copy(desiredPosition);cameraTarget.copy(desiredTarget);cameraCut=false;
      }
      else {camera.position.lerp(desiredPosition,1-Math.exp(-dt*2));cameraTarget.lerp(desiredTarget,1-Math.exp(-dt*3));}
      camera.lookAt(cameraTarget);
      if(this.cinematic&&(elapsed-lastReport>.15||done&&!finishedReported)){
        lastReport=elapsed;finishedReported=done;
        this.zone.run(()=>{this.moving.set(isMoving);this.frameChange.emit({world:info,steps:Math.round(displayed),moving:isMoving,finished:done});});
      }
      renderer.render(scene,camera);
    };
    this.frame=requestAnimationFrame(animate);
  }
  ngOnDestroy(){cancelAnimationFrame(this.frame);this.resize?.disconnect();this.cleanups.forEach(fn=>fn());this.destroyed=true;this.disposeBuilt?.();this.renderer?.dispose();}
}
