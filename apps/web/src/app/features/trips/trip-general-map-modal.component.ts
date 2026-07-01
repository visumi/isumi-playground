import { DatePipe, NgClass } from "@angular/common";
import { ChangeDetectionStrategy, Component, Signal, computed, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  LucideBedDouble,
  LucideCalendarDays,
  LucideMap,
  LucideMapPin,
  LucideX
} from "@lucide/angular";
import { TripDay, TripPlaceCategory } from "../../core/api/api.types";
import {
  IsumiButtonComponent,
  IsumiCheckboxComponent,
  IsumiSelectDirective,
  injectIsumiModalData,
  injectIsumiModalRef
} from "../../shared/ui";
import { TripDayMapComponent, TripMapPoint } from "./trip-day-map.component";

export interface TripGeneralMapModalData {
  points: Signal<TripMapPoint[]>;
  days: TripDay[];
  allocate: (allocation: TripGeneralMapAllocation) => Promise<void>;
}

export interface TripGeneralMapAllocation {
  dayId: string;
  placeIds: string[];
}

const MAP_CATEGORY_CLASSES: Record<TripPlaceCategory, string> = {
  food: "bg-amber-500/15 text-amber-400",
  culture: "bg-violet-500/15 text-violet-400",
  nightlife: "bg-pink-500/15 text-pink-400",
  nature: "bg-emerald-500/15 text-emerald-400",
  shopping: "bg-blue-500/15 text-blue-400",
  other: "bg-cyan-500/15 text-cyan-300"
};

const MAP_CATEGORY_LABELS: Record<TripPlaceCategory, string> = {
  food: "Comer e beber",
  culture: "Cultura",
  nightlife: "Vida noturna",
  nature: "Natureza",
  shopping: "Compras",
  other: "Outro"
};

@Component({
  selector: "isumi-trip-general-map-modal",
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    NgClass,
    IsumiButtonComponent,
    IsumiCheckboxComponent,
    IsumiSelectDirective,
    LucideBedDouble,
    LucideCalendarDays,
    LucideMap,
    LucideMapPin,
    LucideX,
    TripDayMapComponent
  ],
  template: `
    @if (data; as mapData) {
    <div class="grid h-[min(660px,calc(100dvh-7rem))] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden overscroll-contain max-sm:h-[calc(100dvh-8rem)]">
      <header class="flex shrink-0 items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="m-0 inline-flex items-center gap-2 text-[1.2rem] font-black">
            <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
              <svg lucideMap class="size-4" aria-hidden="true"></svg>
            </span>
            Mapa geral da viagem
          </h2>
          <p class="m-0 mt-1 text-sm leading-6 text-muted-foreground">
            Lugares salvos, paradas no roteiro e hospedagens com coordenadas.
          </p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar mapa"
          (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <div class="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(19rem,26rem)] gap-4 max-lg:grid-cols-1 max-lg:grid-rows-[minmax(18rem,1fr)_minmax(16rem,0.95fr)]">
        <section class="min-h-0 overflow-hidden rounded-lg bg-background">
          <isumi-trip-day-map [points]="mapData.points()" [highlightedPlaceIds]="selectedPlaceIds()"
            (placeSelected)="selectPlace($event)" />
        </section>

        <aside class="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-lg bg-secondary/55 max-sm:mb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div class="border-b border-border/70 px-4 py-3">
            <strong class="inline-flex items-center gap-2 text-sm font-black">
              <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <svg lucideMapPin class="size-4" aria-hidden="true"></svg>
              </span>
              Pontos no mapa
            </strong>
            <div class="mt-3 grid grid-cols-3 gap-2 text-center">
              <span class="rounded-md bg-background/65 px-2 py-2">
                <strong class="block text-sm">{{ scheduledCount() }}</strong>
                <span class="block text-[0.625rem] font-bold text-muted-foreground">No roteiro</span>
              </span>
              <span class="rounded-md bg-background/65 px-2 py-2">
                <strong class="block text-sm">{{ unscheduledCount() }}</strong>
                <span class="block text-[0.625rem] font-bold text-muted-foreground">Pendentes</span>
              </span>
              <span class="rounded-md bg-background/65 px-2 py-2">
                <strong class="block text-sm">{{ lodgingCount() }}</strong>
                <span class="block text-[0.625rem] font-bold text-muted-foreground">Hospedagens</span>
              </span>
            </div>
          </div>

          <form class="grid gap-3 border-b border-border/70 px-4 py-3" (submit)="submitAllocation($event)">
            <label class="grid gap-2">
              <span class="inline-flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
                <svg lucideCalendarDays class="size-3.5" aria-hidden="true"></svg>
                Alocar pendentes no dia
              </span>
              <select isumiSelect name="generalMapDay" [ngModel]="selectedDayId()"
                (ngModelChange)="selectedDayId.set($event)">
                <option value="">Escolha um dia</option>
                @for (day of mapData.days; track day.id) {
                <option [value]="day.id">Dia {{ day.position + 1 }} · {{ day.date | date:"dd/MM" }}</option>
                }
              </select>
            </label>

            <isumi-button fullWidth variant="primary" size="sm" type="submit"
              [disabled]="!canAllocate()"
              [loading]="allocating()">
              <svg icon lucideMapPin class="size-4" aria-hidden="true"></svg>
              Alocar {{ selectedCount() || "" }} {{ selectedCount() === 1 ? "lugar" : "lugares" }}
            </isumi-button>
          </form>

          <div class="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 pt-3">
            @if (mapData.points().length > 0) {
            <ol class="grid gap-2">
              @for (entry of mapData.points(); track entry.id) {
              <li class="grid gap-3 rounded-md bg-background/70 px-3 py-2.5 transition-colors duration-150">
                <div class="flex min-w-0 items-start gap-3">
                  @if (entry.status === "unscheduled" && entry.placeId) {
                  <isumi-checkbox class="mt-1" [checked]="isSelected(entry.placeId)"
                    [ariaLabel]="'Selecionar ' + entry.name"
                    (checkedChange)="togglePlace(entry.placeId!, $event)">
                    <span class="sr-only">Selecionar {{ entry.name }}</span>
                  </isumi-checkbox>
                  } @else {
                  <span class="mt-1 grid size-5 shrink-0 place-items-center text-muted-foreground" aria-hidden="true">
                    @if (entry.kind === "lodging") {
                    <svg lucideBedDouble class="size-4"></svg>
                    } @else {
                    <svg lucideMapPin class="size-4"></svg>
                    }
                  </span>
                  }

                  <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm text-xs font-black"
                    [ngClass]="badgeClasses(entry)">
                    @if (entry.kind === "lodging") {
                    <svg lucideBedDouble class="size-4" aria-hidden="true"></svg>
                    } @else if (entry.status === "scheduled") {
                    {{ entry.dayNumber }}
                    } @else {
                    <svg lucideMapPin class="size-4" aria-hidden="true"></svg>
                    }
                  </span>

                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <strong class="block break-words text-sm">{{ entry.name }}</strong>
                      <span class="rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold"
                        [ngClass]="pillClasses(entry)">
                        {{ entryLabel(entry) }}
                      </span>
                    </div>
                    <span class="mt-1 flex min-w-0 items-start gap-1.5 break-words text-xs leading-5 text-muted-foreground">
                      <svg lucideMapPin class="mt-0.5 size-3.5 shrink-0 text-foreground/45" aria-hidden="true"></svg>
                      {{ entry.address }}
                    </span>
                  </div>
                </div>
              </li>
              }
            </ol>
            } @else {
            <div class="grid min-h-48 place-items-center px-4 text-center">
              <div>
                <strong class="block text-sm">Nenhum ponto localizado</strong>
                <p class="m-0 mt-1 max-w-[28ch] text-xs leading-5 text-muted-foreground">
                  Salve coordenadas nos lugares ou hospedagens para montar o mapa geral.
                </p>
              </div>
            </div>
            }
          </div>
        </aside>
      </div>
    </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripGeneralMapModalComponent {
  readonly data = injectIsumiModalData<TripGeneralMapModalData>();
  readonly modalRef = injectIsumiModalRef<TripGeneralMapModalData, void>();
  readonly selectedDayId = signal(this.data?.days[0]?.id || "");
  readonly selectedPlaceIds = signal<string[]>([]);
  readonly allocating = signal(false);

  readonly selectedCount = computed(() => this.selectedPlaceIds().length);
  readonly canAllocate = computed(() => this.selectedCount() > 0 && !!this.selectedDayId());
  readonly scheduledCount = computed(() => this.data?.points().filter((point) => point.status === "scheduled").length || 0);
  readonly unscheduledCount = computed(() => this.data?.points().filter((point) => point.status === "unscheduled").length || 0);
  readonly lodgingCount = computed(() => this.data?.points().filter((point) => point.kind === "lodging").length || 0);

  isSelected(placeId: string): boolean {
    return this.selectedPlaceIds().includes(placeId);
  }

  togglePlace(placeId: string, checked: boolean): void {
    this.selectedPlaceIds.update((placeIds) =>
      checked
        ? Array.from(new Set([...placeIds, placeId]))
        : placeIds.filter((selectedPlaceId) => selectedPlaceId !== placeId)
    );
  }

  selectPlace(placeId: string): void {
    this.selectedPlaceIds.update((placeIds) => Array.from(new Set([...placeIds, placeId])));
  }

  async submitAllocation(event: Event): Promise<void> {
    event.preventDefault();
    const dayId = this.selectedDayId();
    const placeIds = this.selectedPlaceIds();
    if (!dayId || placeIds.length === 0 || this.allocating()) return;

    this.allocating.set(true);
    try {
      await this.data?.allocate({ dayId, placeIds });
      this.selectedPlaceIds.set([]);
    } finally {
      this.allocating.set(false);
    }
  }

  badgeClasses(entry: TripMapPoint): string {
    if (entry.kind === "lodging") return "bg-primary/15 text-primary";
    if (entry.status === "unscheduled") return "bg-muted text-muted-foreground";
    return this.dayBadgeClasses(entry.dayNumber || 1);
  }

  pillClasses(entry: TripMapPoint): string {
    if (entry.kind === "lodging") return "bg-primary/15 text-primary";
    if (entry.status === "unscheduled") return "bg-muted text-muted-foreground";
    return MAP_CATEGORY_CLASSES[entry.category || "other"];
  }

  entryLabel(entry: TripMapPoint): string {
    if (entry.kind === "lodging") return "Hospedagem";
    if (entry.status === "scheduled") return `Dia ${entry.dayNumber}`;
    return `Pendente · ${MAP_CATEGORY_LABELS[entry.category || "other"]}`;
  }

  private dayBadgeClasses(dayNumber: number): string {
    const classes = [
      "bg-emerald-500/15 text-emerald-300",
      "bg-sky-500/15 text-sky-300",
      "bg-violet-500/15 text-violet-300",
      "bg-amber-500/15 text-amber-300",
      "bg-pink-500/15 text-pink-300",
      "bg-cyan-500/15 text-cyan-300"
    ];
    return classes[(dayNumber - 1) % classes.length];
  }
}
