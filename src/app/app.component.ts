import { afterEveryRender, Component, computed, effect, HostListener, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StepsService } from './steps.service';
import { CHAPTERS, PEOPLE, TARGET, TEAM_TARGET, Person, elapsedDays, osloDate, stats, validEntry } from './challenge';
import { JourneyFrame, LandscapeComponent } from './landscape.component';
import { DevbarComponent } from './dev/devbar.component';
import { isDevHost } from './steps.service';

import { JourneyWorld, WORLDS, worldAt, worldProgress } from './worlds';
import { Seen, readSeen, sinceSeen, snapshot, writeSeen } from './away';

interface Playback { id: number; from: number; to: number; name: string; preview: boolean; away?: string; }

@Component({selector:'app-root',standalone:true,imports:[CommonModule,FormsModule,LandscapeComponent,DevbarComponent],templateUrl:'./app.component.html'})
export class AppComponent {
  readonly store = inject(StepsService);
  readonly people = PEOPLE;
  readonly chapters = CHAPTERS;
  readonly worlds = WORLDS;
  readonly currentWorld = computed(()=>worldAt(this.teamTotal()));
  readonly currentWorldProgress = computed(()=>worldProgress(this.teamTotal())*100);
  readonly beyondGoal = computed(()=>Math.max(0,this.teamTotal()-TEAM_TARGET));
  readonly nextLight = computed(()=>50000-this.beyondGoal()%50000);
  readonly playback = signal<Playback|null>(null);
  readonly playbackFrame = signal<JourneyFrame|null>(null);
  private playbackSequence = 0;
  readonly devHost = isDevHost();
  readonly target = TARGET;
  readonly days = Array.from({length:31},(_,i)=>i+1);
  readonly today = signal(osloDate());
  readonly effectiveToday = this.today;
  readonly elapsed = computed(()=>elapsedDays(this.effectiveToday()));
  readonly activeName = computed(()=>this.store.name() || 'Endre');
  readonly mine = computed(()=>stats(this.store.entries(),this.activeName(),this.effectiveToday()));
  readonly teamTotal = computed(()=>this.store.entries().reduce((sum,e)=>sum+e.steps,0));
  readonly teamKm = computed(()=>this.teamTotal()*.00075);
  readonly teamProgress = computed(()=>Math.min(100,this.teamTotal()/TEAM_TARGET*100));
  readonly unlocked = computed(()=>CHAPTERS.filter(c=>this.teamKm()>=c.km).length);
  readonly ranking = computed(()=>PEOPLE.map(name=>({name,...stats(this.store.entries(),name,this.effectiveToday())})).sort((a,b)=>b.total-a.total));
  readonly goalPeople = computed(()=>this.ranking().filter(p=>p.total>=TARGET).length);
  readonly canLog = computed(()=>this.effectiveToday()>='2026-10-01'&&(this.store.mode()==='shared'||this.store.mode()==='local'));
  readonly online = computed(()=>this.store.mode()==='shared'||this.store.mode()==='readonly');
  readonly dateMax = computed(()=>this.effectiveToday()>'2026-10-31'?'2026-10-31':this.effectiveToday());
  selectedDate = '2026-10-01';
  stepValue: number | null = null;
  formError = signal('');
  toast = signal('');
  choosing = signal(false);
  help = signal(false);
  account = signal(false);
  private toastTimer?: ReturnType<typeof setTimeout>;
  /** Det denne nettleseren sist så. Siden er åpen og synlig = du ser skrittene komme. */
  private seen: Seen | null = readSeen();
  /** Satt ved oppstart og når fanen blir synlig igjen: da spilles det du gikk glipp av. */
  private arrived = true;
  private ownSave = false;
  private readonly pageVisible = signal(document.visibilityState !== 'hidden');
  constructor(){void this.store.initialize().then(()=>this.syncToday());this.selectedDate=this.clampedDate();setInterval(()=>this.today.set(osloDate()),60000);effect(()=>this.catchUp());afterEveryRender(()=>{const dialog=document.querySelector<HTMLDialogElement>('dialog');if(dialog&&!dialog.open)dialog.showModal();});}
  @HostListener('window:focus') onFocus(){this.today.set(osloDate());}
  @HostListener('document:visibilitychange') onVisibility(){const visible=document.visibilityState!=='hidden';if(visible&&!this.pageVisible())this.arrived=true;this.pageVisible.set(visible);}
  /**
   * Husker hvor langt gjengen var sist du så siden. Kommer du tilbake (ny økt eller fanen igjen) og de
   * andre har gått videre, spilles turen av derfra – med nye verdener underveis.
   */
  private catchUp(){
    const ready=this.store.mode()==='local'||(this.online()&&this.store.lastSynced()!==null);
    if(!ready||!this.pageVisible())return;
    const now=snapshot(this.store.entries());
    untracked(()=>{
      const seen=this.seen;
      if(this.arrived&&seen&&now.total>seen.total&&!this.ownSave&&!this.playback()){
        const walkers=sinceSeen(seen,now);
        this.openPlayback({id:0,from:seen.total,to:now.total,name:walkers[0]?.name??this.activeName(),preview:false,
          away:walkers.map(p=>`${p.name} +${this.format(p.steps)}`).join(' · ')});
      }
      this.arrived=false;
      this.seen=now;writeSeen(now);
    });
  }
  @HostListener('document:keydown.escape') closeDialogs(){this.help.set(false);this.choosing.set(false);this.account.set(false);this.playback.set(null);}
  profile(){if(this.store.mode()==='login')void this.store.login();else if(this.online())this.account.set(true);else this.choosing.set(true);}
  /** Etter oppstart og når devbaren endrer dato eller skritt. */
  syncToday(){this.today.set(osloDate());this.selectedDate=this.clampedDate();this.loadDay();}
  private clampedDate(){const day=this.effectiveToday();return day<'2026-10-01'?'2026-10-01':day>'2026-10-31'?'2026-10-31':day;}
  format(value:number){return new Intl.NumberFormat('nb-NO',{maximumFractionDigits:0}).format(value);}
  decimal(value:number){return new Intl.NumberFormat('nb-NO',{maximumFractionDigits:1}).format(value);}
  personStats(name:Person){return stats(this.store.entries(),name,this.effectiveToday());}
  dayString(day:number){return `2026-10-${String(day).padStart(2,'0')}`;}
  dayEntry(day:number){return this.store.entries().find(e=>e.name===this.activeName()&&e.day===this.dayString(day));}
  dayLabel(day:number){const entry=this.dayEntry(day);return `${day}. oktober: ${entry?`${this.format(entry.steps)} skritt`:'ikke registrert'}`;}
  selectDay(day:number){this.selectedDate=this.dayString(day);this.loadDay();document.getElementById('registrer')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});setTimeout(()=>document.getElementById('steps')?.focus(),300);}
  loadDay(){this.stepValue=this.store.entries().find(e=>e.name===this.activeName()&&e.day===this.selectedDate)?.steps??null;this.formError.set('');}
  choose(name:Person){this.store.chooseName(name);this.choosing.set(false);this.loadDay();}
  async submit(){
    if(this.stepValue===null||!validEntry(this.selectedDate,this.stepValue,this.effectiveToday())){this.formError.set('Velg en dato i oktober til og med i dag, og et helt tall fra 0 til 100 000.');return;}
    if(!this.store.name()){this.formError.set(this.store.mode()==='readonly'?'Du har bare lesetilgang.':'Velg navnet ditt først.');return;}
    this.formError.set('');
    const before=this.teamTotal();
    const walker=this.activeName();
    this.ownSave=true;
    const saved=await this.store.save(this.selectedDate,this.stepValue).finally(()=>this.ownSave=false);
    if(saved){this.showToast(this.store.mode()==='shared'?'Skrittene er lagret og delt med gjengen!':'Skrittene er lagret på denne enheten.');
      if(this.teamTotal()>before)this.openPlayback({id:0,from:before,to:this.teamTotal(),name:walker,preview:false});
    }
  }
  showToast(message:string){clearTimeout(this.toastTimer);this.toast.set(message);this.toastTimer=setTimeout(()=>this.toast.set(''),5000);}
  async share(){if(this.store.mode()==='local'){this.help.set(true);return;}try{await navigator.clipboard.writeText(this.store.shareLink());this.showToast('Lenken er kopiert. Alle logger inn med sin egen Google-konto.');}catch{this.showToast('Kunne ikke kopiere. Del adressen til siden – alle logger inn med Google.');}}
  openPlayback(walk: Playback) {
    this.playbackFrame.set({world:worldAt(walk.from),steps:walk.from,moving:false,finished:false});
    this.playback.set({...walk,id:++this.playbackSequence});
  }
  /** Verdener oppdages underveis: bare de gjengen har nådd kan utforskes. */
  isOpen(world: JourneyWorld) { return this.teamTotal()>=world.start; }
  previewWorld(world: JourneyWorld) {
    if(!this.isOpen(world))return;
    const length=world.id==='light'?180000:world.end-world.start;
    const fullTour=world.id==='forest'||world.id==='body';
    this.openPlayback({id:0,from:fullTour?world.start:world.start+length*.15,to:fullTour?world.end-1:world.start+length*.48,name:this.activeName(),preview:true});
  }
  nextChapter(){return CHAPTERS.find(c=>this.teamKm()<c.km)||CHAPTERS[CHAPTERS.length-1];}
}
