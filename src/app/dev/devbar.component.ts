import { PEOPLE, TEAM_TARGET } from '../participants';
import { LIGHT_CYCLE } from '../worlds';
import { Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, computed, inject, output, signal } from '@angular/core';
import { StepsService } from '../steps.service';
import { osloDate } from '../challenge';
import { WORLDS } from '../worlds';
import { DevFailure, DevRole, devActive, devState, expireLogin, fillSteps, sampleMemories, setFailure, setRole, setToday, turnOff } from './dev-tools';

/** Verktøylinje nederst på localhost for å hoppe mellom tilstander uten å logge inn. Lastes som egen chunk. */
@Component({
  selector: 'app-devbar',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="devbar" role="region" aria-label="Utviklerverktøy">
      <button class="devbar-toggle" (click)="toggle()" [attr.aria-expanded]="open()">
        <b>DEV</b> {{open() ? '▾' : '▴'}} <span>{{summary()}}</span>
      </button>
      @if (open()) {
        <div class="devbar-rows">
          <div class="devbar-row"><span class="devbar-label">Rolle</span>
            @for (r of roles; track r.id) { <button [class.on]="active() && state().role === r.id" [title]="r.hint" (click)="role(r.id)">{{r.label}}</button> }
          </div>
          <div class="devbar-row"><span class="devbar-label">Dato</span>
            <input type="date" [value]="today()" (change)="day($any($event.target).value || null)" aria-label="Late som det er denne datoen">
            @for (d of dates; track d.label) { <button [class.on]="active() && state().today === d.day" (click)="day(d.day)">{{d.label}}</button> }
          </div>
          <div class="devbar-row"><span class="devbar-label">Skritt</span>
            @for (p of presets; track p.label) { <button [title]="p.hint" (click)="fill(p.total)">{{p.label}}</button> }
            <span class="devbar-sep"></span>
            @for (w of worlds; track w.id) { <button class="devbar-world" [title]="'Midt i ' + w.title" (click)="fill(w.total)">{{w.icon}}</button> }
          </div>
          <div class="devbar-row"><span class="devbar-label">Test</span>
            @for (f of failures; track f.id) { <button [class.on]="active() && state().failure === f.id" [title]="f.hint" (click)="failure(f.id)">{{f.label}}</button> }
            <button title="Som om innloggingen gikk ut i en annen fane" (click)="expire()">Utløpt innlogging</button>
            <button (click)="walk.emit({ from: walkFrom(), to: walkFrom() + 25000 })">Gåtur ↗</button>
            <button (click)="toast.emit('Skrittene er lagret og delt med gjengen!')">Toast</button>
            <button title="Fire eksempelbilder fra deltakerne – borte ved omlasting" (click)="samples()">Minner</button>
            <span class="devbar-sep"></span>
            <button class="devbar-off" title="Glem devtilstanden og koble til Firebase igjen" (click)="off()">Av · ekte Firebase</button>
          </div>
          @if (note()) { <p class="devbar-note" role="status">{{note()}}</p> }
        </div>
      }
    </div>`,
  styles: [`
    :root { --devbar-h: 0px; }
    body { padding-bottom: var(--devbar-h); }
    .toast { bottom: calc(25px + var(--devbar-h)); }
    .devbar { position: fixed; inset: auto 0 0; z-index: 40; background: #0c120ef2; color: #c8d2bd; border-top: 1px solid #d9ecaa40;
      font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; backdrop-filter: blur(6px); }
    .devbar button { font: inherit; }
    .devbar-toggle { display: flex; gap: 8px; align-items: center; width: 100%; padding: 7px 16px; background: none; color: inherit; text-align: left; }
    .devbar-toggle b { color: #0c120e; background: #d9ecaa; border-radius: 3px; padding: 1px 5px; font-weight: 700; }
    .devbar-toggle span { color: #8d9a84; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .devbar-rows { padding: 0 16px 10px; display: grid; gap: 6px; }
    .devbar-row { display: flex; align-items: center; gap: 5px; overflow-x: auto; scrollbar-width: none; }
    .devbar-label { flex: 0 0 52px; color: #6f7c68; text-transform: uppercase; font-size: 9px; letter-spacing: 1px; }
    .devbar-row button, .devbar-row input { flex: none; background: #1c271f; color: #d6dfca; border: 1px solid #2f3d31; border-radius: 4px; padding: 4px 8px; white-space: nowrap; }
    .devbar-row button:hover { border-color: #d9ecaa80; }
    .devbar-row button.on { background: #d9ecaa; color: #18251a; border-color: #d9ecaa; }
    .devbar-row input { color-scheme: dark; padding: 3px 6px; }
    .devbar-world { min-width: 30px; }
    .devbar-sep { flex: 0 0 1px; align-self: stretch; background: #2f3d31; margin: 0 4px; }
    .devbar-off { color: #f1b9a0 !important; }
    .devbar-note { margin: 0; color: #d9ecaa; font-size: 10px; }
    @media (max-width: 760px) { .devbar-label { flex-basis: 42px; } }
  `],
})
export class DevbarComponent {
  readonly store = inject(StepsService);
  /** Datoen eller skrittene er endret utenfra – AppComponent oppdaterer «i dag» og skjemaet. */
  readonly changed = output<void>();
  readonly toast = output<string>();
  readonly walk = output<{ from: number; to: number }>();
  readonly state = devState;
  readonly active = signal(devActive());
  readonly open = signal(remembered());
  readonly note = signal('');
  readonly today = signal(osloDate());
  private readonly total = computed(() => this.store.entries().reduce((sum, e) => sum + e.steps, 0));
  readonly summary = computed(() => !this.active() ? 'Ekte Firebase – velg noe for å bytte til devdata'
    : [this.roles.find(r => r.id === this.state().role)?.label, this.state().today ? `late som ${this.today()}` : 'ekte dato',
      `${new Intl.NumberFormat('nb-NO').format(this.total())} skritt`, this.state().failure !== 'none' ? this.state().failure : ''].filter(Boolean).join(' · '));

  readonly roles: { id: DevRole; label: string; hint: string }[] = [
    { id: 'login', label: 'Utlogget', hint: 'Logg inn-knappen logger inn som Endre' },
    ...PEOPLE.map(id => ({ id, label: id, hint: `${id.toLowerCase()}@dev.localhost` })),
    { id: 'reader', label: 'Leser', hint: 'Innlogget, men ikke med i utfordringen' },
    { id: 'local', label: 'Lokal', hint: 'Uten Firebase-oppsett, lagres i nettleseren' },
    { id: 'loading', label: 'Laster', hint: 'Mens Firebase starter' },
    { id: 'error', label: 'Feil', hint: 'config.json kunne ikke lastes' },
  ];
  readonly dates = [
    { label: 'Ekte', day: null },
    { label: '28. sep', day: '2026-09-28' },
    { label: '1. okt', day: '2026-10-01' },
    { label: '15. okt', day: '2026-10-15' },
    { label: '31. okt', day: '2026-10-31' },
    { label: '3. nov', day: '2026-11-03' },
  ];
  readonly presets: { label: string; hint: string; total: (days: number) => number }[] = [
    { label: 'Tom', hint: 'Ingen registreringer', total: () => 0 },
    { label: 'Henger etter', hint: '~6 300 per person per dag', total: days => days * 6_300 * PEOPLE.length },
    { label: 'I rute', hint: '~10 500 per person per dag', total: days => days * 10_500 * PEOPLE.length },
    { label: 'Halvveis', hint: 'Halve fellesmålet', total: () => TEAM_TARGET / 2 },
    { label: 'Nesten i mål', hint: '5 000 skritt fra fellesmålet', total: () => TEAM_TARGET - 5_000 },
    { label: 'I mål', hint: '5 000 skritt over fellesmålet', total: () => TEAM_TARGET + 5_000 },
    { label: 'Bortenfor', hint: 'En ny lyssti etter målet', total: () => TEAM_TARGET + LIGHT_CYCLE + 10_000 },
  ];
  readonly worlds = WORLDS.map(w => ({ ...w, total: () => Math.round(w.start + (w.id === 'light' ? LIGHT_CYCLE / 3 : (w.end - w.start) * .4)) }));
  readonly failures: { id: DevFailure; label: string; hint: string }[] = [
    { id: 'none', label: 'Alt virker', hint: 'Ingen feil' },
    { id: 'offline', label: 'Nettverksfeil', hint: 'Firestore svarer ikke' },
    { id: 'denied', label: 'Nektet', hint: 'Firestore-reglene avviser lagring' },
  ];

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    const bar = () => host.nativeElement.firstElementChild as HTMLElement | null;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--devbar-h', `${bar()?.offsetHeight ?? 0}px`));
    afterNextRender(() => { const el = bar(); if (el) observer.observe(el); });
    inject(DestroyRef).onDestroy(() => { observer.disconnect(); document.documentElement.style.removeProperty('--devbar-h'); });
  }

  toggle() {
    this.open.update(open => !open);
    try { localStorage.setItem('oktober-2026-devbar-open', String(this.open())); } catch { /* Bare en bekvemmelighet. */ }
  }
  async role(role: DevRole) { this.active.set(true); await setRole(this.store, role); this.done(''); }
  async day(day: string | null) { await this.activate(); setToday(this.store, day); this.done(''); }
  async fill(total: (days: number) => number) {
    await this.activate();
    const moved = fillSteps(this.store, total);
    this.done(moved ? `Datoen ble flyttet til ${moved} for å få plass til skrittene.` : '');
  }
  async failure(failure: DevFailure) { await this.activate(); setFailure(this.store, failure); this.done(''); }
  async expire() { await this.activate(); expireLogin(); this.done(''); }
  async samples() {
    await this.activate();
    await sampleMemories();
    this.done(this.store.mode() === 'shared' ? '' : 'Minnene vises bare for deltakerne – velg Endre, Stine, Lars eller Cathrine.');
  }
  off() { turnOff(); }
  walkFrom() { return Math.max(0, this.total() - 25000); }

  /** Første klikk bytter fra Firebase til devdata (og lar den ekte økten være i fred). */
  private async activate() {
    if (this.active()) return;
    this.active.set(true);
    await setRole(this.store, devState().role);
  }
  private done(note: string) { this.today.set(osloDate()); this.note.set(note); this.changed.emit(); }
}

function remembered() { try { return localStorage.getItem('oktober-2026-devbar-open') !== 'false'; } catch { return true; } }
