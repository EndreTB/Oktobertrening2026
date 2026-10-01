import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import type * as THREE from 'three';
import { JourneyWorld, journeyLegs, worldAt, worldProgress } from './worlds';
import type { WorldScene } from './world-scene';

export interface JourneyFrame { world: JourneyWorld; steps: number; moving: boolean; finished: boolean; }
@Component({
  selector: 'app-landscape', standalone: true,
  template: `<div class="landscape-canvas" #host role="img" [attr.aria-label]="'Turfiguren utforsker '+currentWorld().title" [attr.data-world]="currentWorld().id" [attr.data-moving]="moving()"></div>
    <div class="portal-flash" [class.active]="flashing()" aria-hidden="true"></div>
    @if(failed){<div class="scene-fallback"><span>{{currentWorld().icon}}</span><p>{{currentWorld().title}}</p><small>3D er ikke tilgjengelig her. Du kan fortsatt registrere skritt og følge fremdriften.</small></div>}`,
  styles: [`:host{display:block;width:100%;height:100%;position:relative;overflow:hidden}.landscape-canvas{width:100%;height:100%}.portal-flash{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse,#fff5d9c9,transparent 72%);opacity:0;transition:opacity .7s}.portal-flash.active{opacity:1}.scene-fallback{position:absolute;inset:0;display:grid;place-content:center;text-align:center;color:#eedbb4;padding:30px;gap:16px}.scene-fallback>span{font-size:90px}.scene-fallback p{font:28px Georgia,serif}.scene-fallback small{font-size:12px;max-width:300px;line-height:1.8}@media(prefers-reduced-motion:reduce){.portal-flash{display:none}}`],
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
    host.appendChild(renderer.domElement);
    const scene=new THREE.Scene();this.scene=scene;
    const camera=new THREE.PerspectiveCamera(39,1,.1,200);
    const ambient=new THREE.HemisphereLight('#ffefd8','#314640',2.7);scene.add(ambient);
    const sun=new THREE.DirectionalLight('#ffe0b5',2.8);sun.position.set(-14,22,10);scene.add(sun);
    const fill=new THREE.DirectionalLight('#bfdce8',1.2);fill.position.set(15,12,-10);scene.add(fill);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const legs=journeyLegs(this.fromSteps,this.steps);
    let shownId='',lastLeg=-1,elapsed=0,lastTime=0,lastReport=-1,visible=true,mx=0,my=0,flashAge=5,finishedReported=false;
    const legDuration=6.8;
    const cameraTarget=new THREE.Vector3(0,3,0);

    const desiredPosition=new THREE.Vector3(),desiredTarget=new THREE.Vector3();
    const size=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
    this.resize=new ResizeObserver(size);this.resize.observe(host);size();
    const observer=new IntersectionObserver(entries=>visible=entries[0].isIntersecting);observer.observe(host);this.cleanups.push(()=>observer.disconnect());
    const pointer=(event:PointerEvent)=>{const r=host.getBoundingClientRect();mx=(event.clientX-r.left)/r.width-.5;my=(event.clientY-r.top)/r.height-.5;};
    host.addEventListener('pointermove',pointer);this.cleanups.push(()=>host.removeEventListener('pointermove',pointer));
    const sceneKey=(info:JourneyWorld,steps:number)=>`${info.id}:${this.person}:${info.id==='light'?Math.floor((steps-930000)/180000)+':'+Math.floor((steps-930000)/50000):''}`;
    const build=(info:JourneyWorld,flash:boolean,steps:number)=>{
      if(this.built){scene.remove(this.built.group);disposeWorld(this.built.group);}
      this.built=createWorld(info,this.person,steps);scene.add(this.built.group);shownId=sceneKey(info,steps);
      renderer.setClearColor(info.background,this.cinematic?1:0);
      ambient.groundColor.set(info.background);
      this.zone.run(()=>{this.currentWorld.set(info);this.flashing.set(flash&&!reduced.matches);});flashAge=0;
    };
    const animate=(time:number)=>{
      this.frame=requestAnimationFrame(animate);
      const dt=lastTime?Math.min((time-lastTime)/1000,.08):0;lastTime=time;
      if(document.hidden||!visible||this.paused)return;
      elapsed+=dt;flashAge+=dt;
      if(flashAge>.65&&this.flashing())this.zone.run(()=>this.flashing.set(false));
      let info=worldAt(this.steps),amount=worldProgress(this.steps),displayed=this.steps,isMoving=false,done=true;
      if(this.cinematic&&!reduced.matches){
        const index=Math.min(legs.length-1,Math.floor(elapsed/legDuration));
        const leg=legs[index],local=elapsed-index*legDuration;
        const linear=Math.max(0,Math.min(1,(local-.7)/4.8));
        const eased=linear*linear*(3-2*linear);
        amount=THREE.MathUtils.lerp(leg.from,leg.to,eased);info=leg.world;
        displayed=THREE.MathUtils.lerp(leg.startSteps,leg.endSteps,eased);
        isMoving=linear>0&&linear<1&&leg.to>leg.from;
        done=index===legs.length-1&&linear===1;
        if(index!==lastLeg){build(info,lastLeg>=0,leg.startSteps);lastLeg=index;}
      } else if(shownId!==sceneKey(info,this.steps))build(info,false,this.steps);
      const built=this.built!;
      built.trail.setDrawRange(0,Math.floor(amount*240)*7*6);
      const point=built.route.getPoint(Math.max(0,Math.min(1,amount))),tangent=built.route.getTangent(Math.max(0,Math.min(1,amount)));
      built.wanderer.position.copy(point);
      built.wanderer.rotation.y=Math.atan2(tangent.x,tangent.z);
      const gait=isMoving?Math.sin(elapsed*13):0;
      built.wanderer.position.y+=Math.abs(gait)*.07;
      built.limbs.forEach((limb,i)=>limb.rotation.x=gait*(i===0||i===3?1:-1)*.6);
      if(!reduced.matches){
        built.portal.rotation.z=elapsed*.18;built.portal.scale.setScalar(1+Math.sin(elapsed*2)*.025);
        built.floaters.forEach((object,i)=>{
          if(object.userData['pulse']){object.scale.setScalar(object.userData['baseScale']*(1+Math.pow(Math.max(0,Math.sin(elapsed*5)),6)*.045));}
          else {object.position.y=object.userData['baseY']+Math.sin(elapsed*.7+i)*.25;object.rotation.y+=dt*.12;}
        });
        built.particles.rotation.y+=dt*.013;
        if(!this.cinematic){built.group.rotation.y+=(mx*.16-built.group.rotation.y)*.03;built.group.rotation.x+=(my*.04-built.group.rotation.x)*.03;}
      }
      if(this.cinematic){
        const zoom=camera.aspect<.85?1.5:1;
        desiredTarget.copy(point).add(new THREE.Vector3(0,1.2,0));
        desiredPosition.copy(point).add(built.followOffset.clone().multiplyScalar(zoom));
        // End with a wide view so the new surroundings are easy to explore.
        if(done){
          if(info.id==='mountain'||info.id==='light'){desiredPosition.lerp(built.overview,.6);desiredTarget.lerp(built.lookAt,.6);}
          else {desiredPosition.copy(built.overview).multiplyScalar(camera.aspect<.85?1.23:1);desiredTarget.copy(built.lookAt);}
        }
      } else {desiredPosition.copy(built.overview).multiplyScalar(camera.aspect<.85?1.15:1);desiredTarget.copy(built.lookAt);}
      if(elapsed<.05){camera.position.copy(desiredPosition);cameraTarget.copy(desiredTarget);}
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
