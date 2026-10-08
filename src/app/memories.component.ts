import { Component, ElementRef, afterEveryRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StepsService } from './steps.service';
import { CAPTION_MAX, Memory, validMemoryDay } from './memories';
import { Photo, preparePhoto } from './photo';
import { Person } from './participants';

/** Bilder deltakerne deler fra turene, om de vil. Bare deltakerne ser dem – andre får en forklaring. */
@Component({
  selector: 'app-memories', standalone: true, imports: [FormsModule],
  template: `
    <section class="calendar-card memories-card" id="minner" aria-labelledby="memories-title">
      <div class="calendar-heading">
        <div><span class="eyebrow">ØYEBLIKK FRA TURENE</span><h3 id="memories-title">Minner fra oktober</h3></div>
        @if (canShare()) {
          <input #file type="file" accept="image/*" hidden (change)="pick($event)">
          <button class="primary-button memory-add" type="button" (click)="file.click()" [disabled]="preparing() || store.sharing()">{{ preparing() ? 'Gjør klar bildet …' : 'Legg til bilde' }} <span>+</span></button>
        }
      </div>
      <p class="memory-intro">{{ intro() }}</p>

      @if (draft(); as photo) {
        <form class="memory-draft" (ngSubmit)="share()">
          <img class="memory-draft-preview" [src]="photo.preview" alt="Bildet du er i ferd med å dele">
          <div>
            <div class="date-row"><label for="memory-day">Dato for minnet</label><input id="memory-day" name="day" type="date" min="2026-10-01" [max]="maxDay()" [(ngModel)]="day" required></div>
            <label class="step-label" for="memory-caption">Noen ord om turen <small>(valgfritt)</small></label>
            <textarea id="memory-caption" name="caption" rows="3" [maxlength]="captionMax" [(ngModel)]="caption" placeholder="Hvor gikk du? Hva så du?" aria-describedby="memory-note"></textarea>
            <div class="input-note" id="memory-note">{{ caption.length }} / {{ captionMax }} tegn · Bildet krympes, og posisjon og annen bildeinfo fjernes før det deles.</div>
            @if (formError() || store.memoryError()) { <p class="error" role="alert">{{ formError() || store.memoryError() }}</p> }
            <div class="memory-actions">
              <button class="text-button" type="button" (click)="cancel()" [disabled]="store.sharing()">Avbryt</button>
              <button class="primary-button save-button" type="submit" [disabled]="store.sharing()">{{ store.sharing() ? 'Deler minnet …' : 'Del med gjengen' }}<span>✓</span></button>
            </div>
          </div>
        </form>
      } @else if (formError() || store.memoryError()) {
        <div class="error global-error" role="alert">{{ formError() || store.memoryError() }}
          @if (!formError() && store.mode() === 'shared') { <button class="text-button" type="button" (click)="store.watchMemories()">Prøv igjen</button> }
        </div>
      }

      @if (store.mode() === 'shared') {
        @if (store.memories().length) {
          <ul class="memory-grid">
            @for (memory of store.memories(); track memory.id) {
              <li>
                <button class="memory-thumb" type="button" (click)="open(memory)" [attr.aria-label]="'Åpne minnet fra ' + memory.name + ', ' + dayLabel(memory.day)">
                  <img [src]="memory.thumb" alt="">
                </button>
                <div class="memory-meta"><span class="mini-avatar" [attr.data-person]="memory.name">{{ memory.name[0] }}</span><span><strong>{{ memory.name }}</strong> · {{ dayLabel(memory.day) }}</span></div>
                @if (memory.caption) { <p class="memory-caption">{{ memory.caption }}</p> }
              </li>
            }
          </ul>
        } @else if (!draft()) {
          <div class="memory-empty"><span aria-hidden="true">◌</span><p>Ingen minner ennå. Det første bildet kan være ditt.</p></div>
        }
      }
    </section>

    @if (current(); as memory) {
      <div class="modal-backdrop" (click)="close()">
        <dialog #viewer class="memory-viewer" aria-modal="true" aria-labelledby="memory-viewer-title" (cancel)="close()" (click)="$event.stopPropagation()" (keydown.arrowleft)="step(-1)" (keydown.arrowright)="step(1)">
          <button class="close-modal" type="button" (click)="close()" aria-label="Lukk minnet">×</button>
          <h2 id="memory-viewer-title" class="visually-hidden">Minne fra {{ memory.name }}, {{ dayLabel(memory.day) }}</h2>
          <figure>
            <div class="memory-photo" [style.aspect-ratio]="memory.width + ' / ' + memory.height">
              <img [src]="full() ?? memory.thumb" [alt]="memory.caption || 'Bilde fra ' + memory.name">
              @if (imageError()) { <span class="memory-loading">Fikk ikke hentet bildet i full størrelse.</span> }
              @else if (!full()) { <span class="memory-loading">Henter bildet …</span> }
            </div>
            <figcaption>
              <span class="eyebrow"><span class="mini-avatar" [attr.data-person]="memory.name">{{ memory.name[0] }}</span>{{ memory.name }} · {{ dayLabel(memory.day) }}</span>
              @if (memory.caption) { <p>{{ memory.caption }}</p> }
            </figcaption>
          </figure>
          <div class="memory-viewer-actions">
            <div class="memory-nav">
              <button type="button" (click)="step(-1)" [disabled]="index() <= 0" aria-label="Forrige minne">←</button>
              <span>{{ index() + 1 }} av {{ viewingMemories().length }}</span>
              <button type="button" (click)="step(1)" [disabled]="index() >= viewingMemories().length - 1" aria-label="Neste minne">→</button>
            </div>
            @if (memory.name === store.name()) {
              @if (confirmDelete()) {
                <span class="memory-confirm" role="group" aria-label="Bekreft sletting">Slette for alle?
                  <button class="text-button danger" type="button" (click)="remove(memory)" [disabled]="deleting()">{{ deleting() ? 'Sletter …' : 'Ja, slett' }}</button>
                  <button class="text-button" type="button" (click)="confirmDelete.set(false)" [disabled]="deleting()">Nei</button>
                </span>
              } @else { <button class="text-button" type="button" (click)="confirmDelete.set(true)">Slett minnet</button> }
            }
          </div>
          @if (store.memoryError()) { <p class="error memory-viewer-error" role="alert">{{ store.memoryError() }}</p> }
        </dialog>
      </div>
    }`,
  styles: [`
    .calendar-heading { gap: 16px; }
    .memory-add { padding: 13px 18px; gap: 6px; flex: none; }
    .memory-add span:last-child { margin-left: 6px; }
    .memory-intro { font-size: 11px; line-height: 1.8; color: #69755f; margin: 14px 0 0; }
    .memory-draft { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 26px; margin-top: 20px; padding: 22px; border: 1px solid #d5dbc9; border-radius: 8px; background: #eef0e5; }
    .memory-draft-preview { width: 100%; max-height: 340px; object-fit: contain; border-radius: 6px; background: #dfe3d4; }
    .memory-draft .date-row { margin-top: 0; }
    .step-label small { color: #89927d; font-size: 10px; }
    textarea { display: block; width: 100%; min-height: 86px; resize: vertical; padding: 12px 14px; border: 1px solid #cbd4bc; border-radius: 5px; background: #fffef8; font: inherit; font-size: 13px; line-height: 1.6; color: var(--ink); }
    textarea:focus-visible { outline: 3px solid #b8b071; outline-offset: 3px; }
    textarea::placeholder { color: #a7b09b; }
    .memory-actions { display: flex; align-items: center; gap: 20px; margin-top: 18px; }
    .memory-actions .save-button { margin-top: 0; flex: 1; }
    .memory-grid { list-style: none; margin: 22px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 24px 18px; }
    .memory-thumb { display: block; width: 100%; aspect-ratio: 4 / 3; padding: 0; border-radius: 6px; overflow: hidden; background: #e4e8da; }
    .memory-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .4s; }
    .memory-thumb:hover img { transform: scale(1.04); }
    .memory-meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 11px; color: #69755f; }
    .memory-meta .mini-avatar, figcaption .mini-avatar { width: 22px; height: 22px; font-size: 10px; flex: none; }
    .memory-meta strong { color: var(--ink); font-weight: 600; }
    .memory-caption { font-size: 12px; line-height: 1.6; margin-top: 6px; color: #3d4f40; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .memory-empty { display: flex; align-items: center; gap: 14px; margin-top: 20px; padding: 22px; border: 1px dashed #cdd5c0; border-radius: 6px; font-size: 12px; color: #69755f; }
    .memory-empty span { font-size: 22px; color: #9aa88a; }
    dialog.memory-viewer { width: min(980px, calc(100vw - 40px)); max-height: 94dvh; padding: 0; overflow: auto; background: #121d16; color: #eeeee0; border-color: #ffffff22; }
    .memory-viewer .close-modal { z-index: 2; right: 12px; top: 12px; width: 38px; height: 38px; display: grid; place-items: center; line-height: 1; color: #eeeee0; background: #0009; border-radius: 50%; }
    figure { margin: 0; }
    .memory-photo { position: relative; width: 100%; max-height: 72dvh; background: #0b120d; }
    .memory-photo img { display: block; width: 100%; height: 100%; max-height: 72dvh; object-fit: contain; }
    .memory-loading { position: absolute; left: 16px; bottom: 14px; font-size: 10px; padding: 6px 11px; border-radius: 20px; background: #000a; color: #e7e7d8; }
    figcaption { padding: 20px 26px 4px; }
    figcaption .eyebrow { display: flex; align-items: center; gap: 9px; color: var(--lime); font-size: 9px; text-transform: uppercase; }
    figcaption p { font-size: 14px; line-height: 1.7; margin-top: 10px; color: #d9ddcd; overflow-wrap: anywhere; }
    .memory-viewer-actions { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; padding: 12px 26px 22px; font-size: 11px; color: #a8b39c; }
    .memory-nav { display: flex; align-items: center; gap: 12px; font-variant-numeric: tabular-nums; }
    .memory-nav button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #ffffff30; background: none; color: #eeeee0; }
    .memory-confirm { display: flex; align-items: center; gap: 14px; }
    .memory-viewer .text-button { color: #c9d3bb; font-size: 11px; }
    .memory-viewer .danger { color: #f3b79d; font-weight: 600; }
    .memory-viewer-error { margin: 0 26px 22px; }
    @media (max-width: 760px) {
      .memory-draft { grid-template-columns: 1fr; padding: 16px; gap: 18px; }
      .memory-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 12px; }
      .memory-add { padding: 12px 16px; }
      dialog.memory-viewer { width: calc(100vw - 20px); }
      figcaption { padding: 16px 18px 2px; }
      .memory-viewer-actions { padding: 10px 18px 18px; }
    }
    @media (prefers-reduced-motion: reduce) { .memory-thumb img { transition: none; } }
  `],
})
export class MemoriesComponent {
  readonly store = inject(StepsService);
  readonly today = input.required<string>();
  readonly peopleLabel = input.required<string>();
  readonly toast = output<string>();
  readonly captionMax = CAPTION_MAX;
  readonly maxDay = computed(() => this.today() > '2026-10-31' ? '2026-10-31' : this.today());
  readonly canShare = computed(() => this.store.mode() === 'shared' && !!this.store.name() && this.today() >= '2026-10-01');
  readonly intro = computed(() => {
    switch (this.store.mode()) {
      case 'shared': return this.today() < '2026-10-01' ? 'Fra 1. oktober kan dere dele bilder fra turene her.' : `Del et bilde fra turen om du har lyst. Bare ${this.peopleLabel()} ser minnene.`;
      case 'readonly': return `Minnene deles bare mellom ${this.peopleLabel()}.`;
      case 'login': return 'Logg inn for å se gjengens minner.';
      case 'local': return 'Bilder kan deles når fellesdatabasen er koblet til. Forhåndsvisningen lagrer ingen bilder.';
      case 'loading': return 'Henter minnene …';
      default: return '';
    }
  });
  readonly preparing = signal(false);
  /** Id-en lages når bildet velges, så et nytt forsøk etter en feil ikke gir duplikat. */
  readonly draft = signal<(Photo & { id: string }) | null>(null);
  readonly formError = signal('');
  day = '';
  caption = '';

  private readonly viewingId = signal<string | null>(null);
  private readonly viewingGroup = signal<{ name: Person; day: string } | null>(null);
  readonly viewingMemories = computed(() => {
    const group = this.viewingGroup();
    return this.store.memories().filter(memory => !group || (memory.name === group.name && memory.day === group.day));
  });
  /** Forsvinner minnet (slettet, eller utlogget), lukkes visningen av seg selv. */
  readonly current = computed(() => this.viewingMemories().find(m => m.id === this.viewingId()) ?? null);
  readonly index = computed(() => this.viewingMemories().findIndex(m => m.id === this.viewingId()));
  readonly full = signal<string | null>(null);
  readonly imageError = signal(false);
  readonly confirmDelete = signal(false);
  readonly deleting = signal(false);
  private readonly viewer = viewChild<ElementRef<HTMLDialogElement>>('viewer');

  constructor() {
    afterEveryRender(() => { const dialog = this.viewer()?.nativeElement; if (dialog && !dialog.open) dialog.showModal(); });
  }

  dayLabel(day: string) { return `${Number(day.slice(-2))}. oktober`; }

  async pick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clearDraft(); this.formError.set(''); this.store.memoryError.set('');
    this.preparing.set(true);
    try {
      this.draft.set({ ...await preparePhoto(file), id: crypto.randomUUID() });
      this.day = this.maxDay(); this.caption = '';
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Fikk ikke lest bildet.'); }
    finally { this.preparing.set(false); }
  }

  async share() {
    const photo = this.draft();
    if (!photo) return;
    if (!validMemoryDay(this.day, this.today())) { this.formError.set('Velg en dato i oktober, til og med i dag.'); return; }
    this.formError.set('');
    const { id, image, thumb, width, height } = photo;
    if (await this.store.shareMemory({ id, day: this.day, caption: this.caption, image, thumb, width, height })) {
      this.clearDraft();
      this.toast.emit('Minnet er delt med gjengen!');
    }
  }

  cancel() { this.clearDraft(); this.formError.set(''); this.store.memoryError.set(''); }
  private clearDraft() { const photo = this.draft(); if (photo) URL.revokeObjectURL(photo.preview); this.draft.set(null); }

  open(memory: Memory) {
    this.viewingGroup.set(null);
    this.view(memory);
  }
  openGroup(name: Person, day: string) {
    const first = this.store.memories().find(memory => memory.name === name && memory.day === day);
    if (!first || this.store.mode() !== 'shared') return;
    this.viewingGroup.set({ name, day });
    this.view(first);
  }
  private view(memory: Memory) {
    this.viewingId.set(memory.id);
    this.full.set(null); this.imageError.set(false); this.confirmDelete.set(false);
    this.store.image(memory.id).then(
      url => { if (this.viewingId() === memory.id) this.full.set(url); },
      () => { if (this.viewingId() === memory.id) this.imageError.set(true); });
  }
  close() { this.viewingId.set(null); this.viewingGroup.set(null); this.full.set(null); this.confirmDelete.set(false); }
  step(direction: 1 | -1) {
    const next = this.viewingMemories()[this.index() + direction];
    if (next && this.index() >= 0) this.view(next);
  }
  async remove(memory: Memory) {
    this.deleting.set(true);
    const deleted = await this.store.deleteMemory(memory).finally(() => this.deleting.set(false));
    if (deleted) { this.close(); this.toast.emit('Minnet er slettet.'); }
  }
}
