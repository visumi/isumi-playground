import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component } from "@angular/core";
import {
  LucideBedDouble,
  LucideMap,
  LucideMapPin,
  LucideX
} from "@lucide/angular";
import { TripPlaceCategory } from "../../core/api/api.types";
import {
  IsumiButtonComponent,
  injectIsumiModalData,
  injectIsumiModalRef
} from "../../shared/ui";
import { TripDayMapComponent, TripDayMapPoint } from "./trip-day-map.component";

export interface TripDayMapModalData {
  dayNumber: number;
  date: string;
  points: TripDayMapPoint[];
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
  selector: "isumi-trip-day-map-modal",
  standalone: true,
  imports: [
    DatePipe,
    IsumiButtonComponent,
    LucideBedDouble,
    LucideMap,
    LucideMapPin,
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
          <isumi-trip-day-map [points]="mapData.points" />
        </section>

        <aside class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg bg-secondary/55 max-sm:mb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div class="border-b border-border/70 px-4 py-3">
            <strong class="inline-flex items-center gap-2 text-sm font-black">
              <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <svg lucideMap class="size-4" aria-hidden="true"></svg>
              </span>
              Roteiro no mapa
            </strong>
          </div>

          <div class="min-h-0 overflow-y-auto px-3 pb-3 pt-3 max-sm:pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
            @if (mapData.points.length > 0) {
            <ol class="grid gap-2">
              @for (entry of mapData.points; track entry.id) {
              <li class="grid gap-3 rounded-md bg-background/70 px-3 py-2.5 transition-colors duration-150">
                <div class="flex min-w-0 items-start gap-3">
                  <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm text-xs font-black"
                    [class]="entry.kind === 'lodging' ? 'bg-primary/15 text-primary' : categoryVisual(entry.category).classes">
                    @if (entry.kind === "lodging") {
                    <svg lucideBedDouble class="size-4" aria-hidden="true"></svg>
                    } @else {
                    {{ entry.position }}
                    }
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <strong class="block break-words text-sm">{{ entry.name }}</strong>
                      @if (entry.kind === "lodging") {
                      <span class="rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.625rem] font-bold text-primary">
                        Hospedagem
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
              </li>
              }
            </ol>
            } @else {
            <div class="grid min-h-48 place-items-center px-4 text-center">
              <div>
                <strong class="block text-sm">Nenhum ponto localizado</strong>
                <p class="m-0 mt-1 max-w-[28ch] text-xs leading-5 text-muted-foreground">
                  Salve coordenadas na hospedagem ou nos lugares deste dia para montar a legenda do mapa.
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
  readonly data = injectIsumiModalData<TripDayMapModalData>();
  readonly modalRef = injectIsumiModalRef<TripDayMapModalData, void>();

  categoryVisual(category?: TripPlaceCategory): { classes: string } {
    return { classes: MAP_CATEGORY_CLASSES[category || "other"] };
  }

  categoryLabel(category?: TripPlaceCategory): string {
    return MAP_CATEGORY_LABELS[category || "other"];
  }
}
