import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  LucideAlertTriangle,
  LucideClock3,
  LucideMap,
  LucideMapPin,
  LucideSave,
  LucideX
} from "@lucide/angular";
import { firstValueFrom } from "rxjs";
import { TripPlaceCategory, TripSnapshot } from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";
import {
  IsumiButtonComponent,
  IsumiInputDirective,
  IsumiToastService,
  injectIsumiModalData,
  injectIsumiModalRef
} from "../../shared/ui";
import { TripDayMapComponent, TripDayMapPoint } from "./trip-day-map.component";

export interface TripDayMapFailedPlace {
  id: string;
  name: string;
  address: string;
  category: TripPlaceCategory;
  position: number;
  version: number;
  latitude: number | null;
  longitude: number | null;
}

export interface TripDayMapModalData {
  roomId: string;
  dayNumber: number;
  date: string;
  points: TripDayMapPoint[];
  failedPlaces: TripDayMapFailedPlace[];
  pendingCount: number;
  onSnapshot: (snapshot: TripSnapshot) => void;
}

type TripDayMapItineraryEntry =
  | ({ kind: "resolved" } & TripDayMapPoint)
  | ({ kind: "failed" } & TripDayMapFailedPlace);

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
  selector: "isumi-trip-day-map-modal",
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    IsumiButtonComponent,
    IsumiInputDirective,
    LucideAlertTriangle,
    LucideClock3,
    LucideMap,
    LucideMapPin,
    LucideSave,
    LucideX,
    TripDayMapComponent
  ],
  template: `
    @if (data; as mapData) {
    <div class="grid h-[min(660px,calc(100dvh-4rem))] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden overscroll-contain max-sm:h-[calc(100dvh-6rem)]">
      <header class="flex shrink-0 items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="m-0 inline-flex items-center gap-2 text-[1.2rem] font-black">
            <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
              <svg lucideMap class="size-4" aria-hidden="true"></svg>
            </span>
            Mapa do dia {{ mapData.dayNumber }}
          </h2>
          <p class="m-0 mt-1 text-sm leading-6 text-muted-foreground">
            {{ mapData.date | date:"EEEE, dd 'de' MMMM" }}
          </p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar mapa"
          (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <div class="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-4 max-lg:grid-cols-1 max-lg:grid-rows-[minmax(18rem,1fr)_minmax(13rem,0.85fr)]">
        <section class="min-h-0 overflow-hidden rounded-lg bg-background">
          <isumi-trip-day-map [points]="visiblePoints()" />
        </section>

        <aside class="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-lg bg-secondary/55 max-sm:mb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div class="border-b border-border/70 px-4 py-3">
            <div class="min-w-0">
              <strong class="inline-flex items-center gap-2 text-sm font-black">
                <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                  <svg lucideMap class="size-4" aria-hidden="true"></svg>
                </span>
                Roteiro no mapa
              </strong>
            </div>
          </div>

          @if (mapData.pendingCount > 0 || failedPlaces().length > 0) {
          <div class="grid gap-1 border-b border-border/70 bg-background/35 px-4 py-3 text-xs leading-5 text-muted-foreground">
            @if (mapData.pendingCount > 0) {
            <span class="inline-flex items-start gap-2">
              <svg lucideClock3 class="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true"></svg>
              {{ mapData.pendingCount }} {{ mapData.pendingCount === 1 ? "endereço ainda está sendo localizado" : "endereços ainda estão sendo localizados" }}.
            </span>
            }
            @if (failedPlaces().length > 0) {
            <span class="inline-flex items-start gap-2">
              <svg lucideAlertTriangle class="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true"></svg>
              {{ failedPlaces().length }} {{ failedPlaces().length === 1 ? "ponto precisa de coordenadas" : "pontos precisam de coordenadas" }}.
            </span>
            }
          </div>
          }

          <div class="min-h-0 overflow-y-auto px-3 pb-3 pt-3 max-sm:pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
            @if (itineraryEntries().length > 0) {
            <ol class="grid gap-2">
              @for (entry of itineraryEntries(); track entry.kind + '-' + entry.id) {
              <li class="grid gap-3 rounded-md bg-background/70 px-3 py-2.5 transition-colors duration-150"
                [class.bg-destructive/10]="entry.kind === 'failed'">
                <div class="flex min-w-0 items-start gap-3">
                  <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm text-xs font-black"
                    [class]="entry.kind === 'failed' ? 'bg-destructive/15 text-destructive' : categoryVisual(entry.category).classes">
                    {{ entry.position }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <strong class="block break-words text-sm">{{ entry.name }}</strong>
                      @if (entry.kind === "failed") {
                      <span class="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[0.625rem] font-bold text-destructive">
                        <svg lucideAlertTriangle class="size-3" aria-hidden="true"></svg>
                        Localizar
                      </span>
                      } @else {
                      <span class="rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold"
                        [class]="categoryVisual(entry.category).classes">
                        {{ categoryLabel(entry.category) }}
                      </span>
                      }
                    </div>
                    <span class="mt-1 flex min-w-0 items-start gap-1.5 break-words text-xs leading-5 text-muted-foreground">
                      <svg lucideMapPin class="mt-0.5 size-3.5 shrink-0 text-foreground/45" aria-hidden="true"></svg>
                      {{ entry.address }}
                    </span>
                  </div>
                </div>

                @if (entry.kind === "failed") {
                <label class="grid gap-1.5">
                  <span class="text-xs font-extrabold text-muted-foreground">Coordenadas</span>
                  <span class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <input isumiInput size="sm" inputmode="decimal" [name]="'coordinates-' + entry.id"
                      [ngModel]="coordinateInputs()[entry.id] || ''"
                      (ngModelChange)="setCoordinates(entry.id, $event)"
                      placeholder="-22.90074812189194, -47.07999569988155">
                    <isumi-button variant="secondary" size="sm" iconOnly type="button"
                      [loading]="savingPlaceId() === entry.id"
                      [disabled]="!canSaveCoordinates(entry)"
                      [ariaLabel]="'Salvar coordenadas de ' + entry.name"
                      (click)="saveCoordinates(entry)">
                      <svg icon lucideSave class="size-3.5" aria-hidden="true"></svg>
                      Salvar coordenadas
                    </isumi-button>
                  </span>
                </label>
                }
              </li>
              }
            </ol>
            } @else {
            <div class="grid min-h-48 place-items-center px-4 text-center">
              <div>
                <strong class="block text-sm">Nenhuma parada localizada</strong>
                <p class="m-0 mt-1 max-w-[28ch] text-xs leading-5 text-muted-foreground">
                  Salve endereços nos lugares deste dia para montar a legenda do mapa.
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
export class TripDayMapModalComponent {
  private readonly trips = inject(TripsService);
  private readonly toast = inject(IsumiToastService);
  readonly data = injectIsumiModalData<TripDayMapModalData>();
  readonly modalRef = injectIsumiModalRef<TripDayMapModalData, void>();
  readonly savingPlaceId = signal<string | null>(null);
  readonly resolvedPlaceIds = signal<Set<string>>(new Set());
  readonly resolvedManualPoints = signal<TripDayMapPoint[]>([]);
  readonly coordinateInputs = signal<Record<string, string>>(
    Object.fromEntries((this.data?.failedPlaces || []).map((place) => [
      place.id,
      place.latitude === null || place.longitude === null ? "" : `${place.latitude}, ${place.longitude}`
    ]))
  );
  readonly visiblePoints = computed(() => [
    ...(this.data?.points || []),
    ...this.resolvedManualPoints()
  ]);
  readonly failedPlaces = computed(() =>
    (this.data?.failedPlaces || []).filter((place) => !this.resolvedPlaceIds().has(place.id))
  );
  readonly itineraryEntries = computed<TripDayMapItineraryEntry[]>(() => [
    ...this.visiblePoints().map((point) => ({ ...point, kind: "resolved" as const })),
    ...this.failedPlaces().map((place) => ({ ...place, kind: "failed" as const }))
  ].sort((first, second) => first.position - second.position));

  categoryVisual(category: TripPlaceCategory): { classes: string } {
    return { classes: MAP_CATEGORY_CLASSES[category] };
  }

  categoryLabel(category: TripPlaceCategory): string {
    return MAP_CATEGORY_LABELS[category];
  }

  setCoordinates(placeId: string, value: string): void {
    this.coordinateInputs.update((inputs) => ({ ...inputs, [placeId]: value }));
  }

  canSaveCoordinates(place: TripDayMapFailedPlace): boolean {
    if (this.savingPlaceId() !== null) return false;
    return this.parseCoordinatePair(this.coordinateInputs()[place.id] || "") !== null;
  }

  async saveCoordinates(place: TripDayMapFailedPlace): Promise<void> {
    if (!this.data || !this.canSaveCoordinates(place)) return;
    const coordinates = this.parseCoordinatePair(this.coordinateInputs()[place.id] || "");
    if (!coordinates) return;

    this.savingPlaceId.set(place.id);
    try {
      const snapshot = await firstValueFrom(this.trips.updatePlaceCoordinates(this.data.roomId, place.id, {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        version: place.version
      }));
      this.data.onSnapshot(snapshot);
      this.resolvedPlaceIds.update((placeIds) => new Set(placeIds).add(place.id));
      this.resolvedManualPoints.update((points) => [
        ...points,
        {
          id: place.id,
          name: place.name,
          address: place.address,
          category: place.category,
          position: place.position,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude
        }
      ]);
      this.toast.success("Coordenadas salvas no mapa.");
    } catch {
      this.toast.error("Não foi possível salvar as coordenadas.");
    } finally {
      this.savingPlaceId.set(null);
    }
  }

  private parseCoordinatePair(value: string): { latitude: number; longitude: number } | null {
    const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)$/);
    if (!match) return null;
    const latitude = Number(match[1].replace(",", "."));
    const longitude = Number(match[2].replace(",", "."));
    if (
      !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
    ) return null;
    return { latitude, longitude };
  }
}
