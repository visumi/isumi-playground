import { DatePipe, NgClass } from "@angular/common";
import { ChangeDetectionStrategy, Component, Signal, computed, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  LucideBedDouble,
  LucideCalendarDays,
  LucideHourglass,
  LucideMap,
  LucideMapPin,
  LucideX
} from "@lucide/angular";
import { TripDay } from "../../core/api/api.types";
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
  dayId?: string;
  placeIds: string[];
  itemIds: string[];
  removeItemIds?: string[];
}

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
    LucideHourglass,
    LucideMap,
    LucideMapPin,
    LucideX,
    TripDayMapComponent
  ],
  template: `
    @if (data; as mapData) {
    <div class="grid h-[min(660px,calc(100dvh-7rem))] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden overscroll-contain max-sm:h-[calc(100dvh-5rem)]">
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

      <div class="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(19rem,26rem)] gap-4 max-lg:grid-cols-1 max-lg:grid-rows-[minmax(18rem,1fr)_minmax(16rem,0.95fr)] max-sm:grid-rows-[minmax(16rem,1fr)_auto] max-sm:pb-4">
        <section class="min-h-0 overflow-hidden rounded-lg bg-background">
          <isumi-trip-day-map [points]="mapData.points()" [highlightedPlaceIds]="selectedPlaceIds()"
            (pointSelected)="togglePoint($event)" />
        </section>

        <aside class="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-lg bg-secondary/55 max-sm:self-start max-sm:content-start max-sm:grid-rows-[auto_auto]">
          <div class="border-b border-border/70 px-4 py-3">
            <strong class="inline-flex items-center gap-2 text-sm font-black">
              <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <svg lucideMapPin class="size-4" aria-hidden="true"></svg>
              </span>
              Pontos no mapa
            </strong>
          </div>

          <form class="grid gap-3 border-b border-border/70 px-4 py-3 max-sm:border-b-0" (submit)="submitAllocation($event)">
            <label class="grid gap-2">
              <span class="inline-flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
                <svg lucideCalendarDays class="size-3.5" aria-hidden="true"></svg>
                Enviar selecionados para o dia
              </span>
              <select isumiSelect name="generalMapDay" [ngModel]="selectedDayId()"
                [disabled]="busy()"
                (ngModelChange)="selectedDayId.set($event)">
                <option value="">Escolha um dia</option>
                @for (day of mapData.days; track day.id) {
                <option [value]="day.id">Dia {{ day.position + 1 }} · {{ day.date | date:"dd/MM" }}</option>
                }
              </select>
            </label>

            <div class="grid gap-2.5">
              <isumi-button fullWidth variant="primary" size="md" type="submit"
                [disabled]="!canApplyToDay()"
                [loading]="allocating()">
                <svg icon lucideMapPin class="size-4" aria-hidden="true"></svg>
                {{ primaryActionLabel() }}
              </isumi-button>
              <isumi-button fullWidth variant="secondary-destructive" size="md" type="button"
                [disabled]="!canRemoveFromDay()"
                [loading]="removing()"
                (click)="removeSelectedFromDays()">
                <svg icon lucideX class="size-4" aria-hidden="true"></svg>
                {{ removeActionLabel() }}
              </isumi-button>
            </div>
          </form>

          <div class="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 pt-3 max-sm:hidden">
            @if (mapData.points().length > 0) {
            <ol class="grid gap-2">
              @for (entry of mapData.points(); track entry.id) {
              <li class="grid gap-3 rounded-md bg-background/70 px-3 py-2.5 transition-colors duration-150">
                <div class="flex min-w-0 items-start gap-3">
                  @if (entry.kind === "place" && entry.placeId) {
                  <isumi-checkbox class="mt-1" [checked]="isSelected(entry.placeId)"
                    [disabled]="busy()"
                    [ariaLabel]="selectionLabel(entry)"
                    (checkedChange)="togglePlace(entry.placeId!, $event)">
                    <span class="sr-only">Selecionar {{ entry.name }}</span>
                  </isumi-checkbox>
                  }

                  <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm text-xs font-black"
                    [ngClass]="badgeClasses(entry)">
                    @if (entry.kind === "lodging") {
                    <svg lucideBedDouble class="size-4" aria-hidden="true"></svg>
                    } @else if (entry.status === "scheduled") {
                    {{ entry.dayNumber }}
                    } @else {
                    <svg lucideHourglass class="size-4" aria-hidden="true"></svg>
                    }
                  </span>

                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-center">
                      <strong class="block break-words text-sm">{{ entry.name }}</strong>
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
  readonly removing = signal(false);

  readonly selectedEntries = computed(() => {
    const selectedPlaceIds = new Set(this.selectedPlaceIds());
    return this.data?.points().filter((point) => point.kind === "place" && point.placeId && selectedPlaceIds.has(point.placeId)) || [];
  });
  readonly selectedUnscheduledEntries = computed(() => this.selectedEntries().filter((point) => point.status === "unscheduled"));
  readonly selectedScheduledEntries = computed(() => this.selectedEntries().filter((point) => point.status === "scheduled"));
  readonly selectedMovableScheduledEntries = computed(() =>
    this.selectedScheduledEntries().filter((point) => point.dayId !== this.selectedDayId())
  );
  readonly busy = computed(() => this.allocating() || this.removing());
  readonly selectedScheduledCount = computed(() => this.selectedScheduledEntries().length);
  readonly selectedActionCount = computed(() => this.selectedUnscheduledEntries().length + this.selectedMovableScheduledEntries().length);
  readonly canApplyToDay = computed(() => !this.busy() && this.selectedActionCount() > 0 && !!this.selectedDayId());
  readonly canRemoveFromDay = computed(() => !this.busy() && this.selectedScheduledCount() > 0);
  isSelected(placeId: string): boolean {
    return this.selectedPlaceIds().includes(placeId);
  }

  togglePlace(placeId: string, checked: boolean): void {
    if (this.busy()) return;
    this.selectedPlaceIds.update((placeIds) =>
      checked
        ? Array.from(new Set([...placeIds, placeId]))
        : placeIds.filter((selectedPlaceId) => selectedPlaceId !== placeId)
    );
  }

  togglePoint(point: TripMapPoint): void {
    if (this.busy()) return;
    if (point.kind !== "place" || !point.placeId) return;
    this.togglePlace(point.placeId, !this.isSelected(point.placeId));
  }

  async submitAllocation(event: Event): Promise<void> {
    event.preventDefault();
    const dayId = this.selectedDayId();
    const placeIds = this.selectedUnscheduledEntries()
      .map((point) => point.placeId)
      .filter((placeId): placeId is string => !!placeId);
    const itemIds = this.selectedMovableScheduledEntries().map((point) => point.id);
    if (!dayId || (placeIds.length === 0 && itemIds.length === 0) || this.busy()) return;

    this.allocating.set(true);
    try {
      await this.data?.allocate({ dayId, placeIds, itemIds });
      this.selectedPlaceIds.set([]);
    } finally {
      this.allocating.set(false);
    }
  }

  async removeSelectedFromDays(): Promise<void> {
    const removeItemIds = this.selectedScheduledEntries().map((point) => point.id);
    if (removeItemIds.length === 0 || this.busy()) return;

    this.removing.set(true);
    try {
      await this.data?.allocate({ placeIds: [], itemIds: [], removeItemIds });
      this.selectedPlaceIds.set([]);
    } finally {
      this.removing.set(false);
    }
  }

  primaryActionLabel(): string {
    const count = this.selectedActionCount();
    if (count === 0) return "Escolha lugares no mapa";
    if (this.selectedMovableScheduledEntries().length === count) return `Mover ${count} ${count === 1 ? "lugar" : "lugares"}`;
    if (this.selectedUnscheduledEntries().length === count) return `Alocar ${count} ${count === 1 ? "lugar" : "lugares"}`;
    return `Aplicar a ${count} lugares`;
  }

  removeActionLabel(): string {
    const count = this.selectedScheduledCount();
    if (count === 0) return "Remover do roteiro";
    return `Remover ${count} ${count === 1 ? "lugar" : "lugares"} do roteiro`;
  }

  selectionLabel(entry: TripMapPoint): string {
    return `${this.isSelected(entry.placeId || "") ? "Desmarcar" : "Selecionar"} ${entry.name}`;
  }

  badgeClasses(entry: TripMapPoint): string {
    if (entry.kind === "lodging") return "bg-primary/15 text-primary";
    if (entry.status === "unscheduled") return "bg-muted text-muted-foreground";
    return this.dayBadgeClasses(entry.dayNumber || 1);
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
