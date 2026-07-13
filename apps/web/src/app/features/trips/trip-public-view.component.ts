import { NgComponentOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, HostListener, OnInit, Type, computed, inject, input, signal } from "@angular/core";
import {
  LucideAsterisk,
  LucideArrowUp,
  LucideBedDouble,
  LucideBus,
  LucideCalendarDays,
  LucideCar,
  LucideFootprints,
  LucideLandmark,
  LucideLink,
  LucideMap,
  LucideMapPin,
  LucideMapPinned,
  LucideMoonStar,
  LucideRulerDimensionLine,
  LucideShieldCheck,
  LucideShoppingBag,
  LucideShuffle,
  LucideTrees,
  LucideUtensils
} from "@lucide/angular";
import {
  PublicTripDayItem,
  PublicTripLodging,
  PublicTripPlace,
  PublicTripRoute,
  PublicTripSnapshot,
  TripDay,
  TripPlaceCategory,
  TripTransportMode
} from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";
import { IsumiButtonComponent, IsumiClipboardService, IsumiEmptyStateComponent, IsumiModalService, IsumiTagComponent, IsumiToastService, IsumiTooltipComponent } from "../../shared/ui";
import { TripDayTimelineComponent } from "./trip-day-timeline.component";
import { TripGeneralMapModalComponent, TripGeneralMapModalData } from "./trip-general-map-modal.component";
import { TripMiniMapComponent, TripMiniMapPoint } from "./trip-mini-map.component";
import { buildTripGeneralMapPoints } from "./trip-room.component";

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC"
});
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  weekday: "long",
  timeZone: "UTC"
});
const OBSERVATION_URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?]+$/;

interface ObservationTextSegment {
  text: string;
  href?: string;
}

interface CoordinatePair {
  latitude: number;
  longitude: number;
}

const PLACE_CATEGORY_VISUALS: Record<TripPlaceCategory, {
  label: string;
  icon: Type<unknown>;
  classes: string;
}> = {
  food: { label: "Comer e beber", icon: LucideUtensils, classes: "bg-amber-500/15 text-amber-400" },
  culture: { label: "Cultura", icon: LucideLandmark, classes: "bg-violet-500/15 text-violet-400" },
  nightlife: { label: "Vida noturna", icon: LucideMoonStar, classes: "bg-pink-500/15 text-pink-400" },
  nature: { label: "Natureza", icon: LucideTrees, classes: "bg-emerald-500/15 text-emerald-400" },
  shopping: { label: "Compras", icon: LucideShoppingBag, classes: "bg-blue-500/15 text-blue-400" },
  other: { label: "Outro", icon: LucideMapPin, classes: "bg-cyan-500/15 text-cyan-300" }
};

function dateOnlyValue(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

function googleMapsUrlForAddress(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

function hasValidCoordinates<T extends { latitude: number | null; longitude: number | null }>(point: T): point is T & CoordinatePair {
  return point.latitude !== null
    && point.longitude !== null
    && Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude);
}

@Component({
  selector: "isumi-trip-public-view",
  standalone: true,
  imports: [
    IsumiEmptyStateComponent,
    IsumiTagComponent,
    NgComponentOutlet,
    LucideAsterisk,
    LucideBedDouble,
    LucideBus,
    LucideCalendarDays,
    LucideCar,
    LucideFootprints,
    LucideLink,
    LucideMap,
    LucideMapPin,
    LucideMapPinned,
    LucideRulerDimensionLine,
    LucideShieldCheck,
    LucideShuffle,
    LucideArrowUp,
    IsumiButtonComponent,
    IsumiTooltipComponent,
    TripDayTimelineComponent,
    TripMiniMapComponent
  ],
  template: `
    <section class="public-trip-page relative min-h-screen overflow-hidden px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div class="relative z-10 mx-auto grid w-full max-w-7xl gap-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <a class="inline-flex items-center gap-3 text-foreground no-underline" href="/" aria-label="Ir para o Playground">
            <span class="grid h-10 w-10 place-items-center rounded-sm bg-purple-700 font-slab text-2xl font-bold text-purple-100" aria-hidden="true">泉</span>
            <strong class="font-slab text-2xl font-extrabold text-purple-200">playground.</strong>
          </a>

        </header>

        @if (loading()) {
        <div class="grid animate-pulse gap-5" aria-label="Carregando visão pública da viagem" aria-busy="true">
          <section class="rounded-lg bg-card">
            <div class="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-6">
              <div class="grid min-w-0 flex-1 gap-3">
                <span class="h-9 w-[min(28rem,78vw)] rounded-sm bg-secondary"></span>
                <div class="flex flex-wrap gap-3">
                  <span class="h-5 w-36 rounded-sm bg-muted"></span>
                  <span class="h-5 w-44 rounded-sm bg-muted"></span>
                </div>
              </div>
              <div class="flex shrink-0 gap-2">
                <span class="size-9 rounded-sm bg-secondary"></span>
                <span class="size-9 rounded-sm bg-secondary"></span>
              </div>
            </div>
          </section>
          <section class="min-w-0 max-w-full rounded-lg bg-card p-5 sm:p-6" aria-label="Carregando lugares pendentes">
            <div class="grid gap-2">
              <span class="h-5 w-36 rounded-sm bg-secondary"></span>
              <span class="h-4 w-28 rounded-sm bg-muted"></span>
            </div>
            <div class="mt-3 w-full max-w-full min-w-0 overflow-hidden pb-1">
              <div class="flex gap-2">
                @for (pendingSkeleton of [1, 2, 3]; track pendingSkeleton) {
                <article class="flex w-64 max-w-[76vw] shrink-0 items-center gap-2.5 rounded-md bg-secondary/70 px-3 py-2">
                  <span class="size-8 shrink-0 rounded-md bg-muted"></span>
                  <div class="grid min-w-0 flex-1 gap-2">
                    <span class="h-4 w-36 max-w-full rounded-sm bg-muted"></span>
                    <span class="h-3.5 w-44 max-w-full rounded-sm bg-muted/70"></span>
                  </div>
                </article>
                }
              </div>
            </div>
          </section>
          <main class="grid gap-4">
            @for (daySkeleton of [1, 2]; track daySkeleton) {
            <section class="rounded-lg bg-card">
              <header class="flex items-start justify-between gap-4 border-b border-dashed border-border px-4 py-4">
                <div class="flex min-w-0 items-start gap-3.5">
                  <span class="size-10 rounded-md bg-secondary"></span>
                  <div class="grid min-w-0 gap-2">
                    <span class="h-5 w-20 rounded-sm bg-secondary"></span>
                    <span class="h-4 w-32 rounded-sm bg-muted"></span>
                  </div>
                </div>
                <span class="h-6 w-20 rounded-full bg-secondary"></span>
              </header>

              <div class="grid gap-3 px-4 py-4">
                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-[minmax(0,1fr)_11rem]">
                  <article class="grid gap-2 rounded-lg bg-secondary/65 p-3">
                    <div class="flex min-w-0 items-start gap-3">
                      <span class="size-8 rounded-md bg-muted"></span>
                      <div class="grid min-w-0 flex-1 gap-2">
                        <span class="h-4 w-48 max-w-full rounded-sm bg-muted"></span>
                        <span class="h-3.5 w-36 rounded-sm bg-muted/70"></span>
                      </div>
                      <span class="size-9 rounded-sm bg-muted"></span>
                    </div>
                    <span class="h-4 w-[min(26rem,72vw)] rounded-sm bg-muted/70"></span>
                  </article>
                  <aside class="order-first h-24 rounded-lg bg-secondary/45 md:order-none"></aside>
                </div>

                <div class="grid gap-2 rounded-lg bg-background/65 p-2">
                  @for (itemSkeleton of [1, 2]; track itemSkeleton) {
                  <article class="grid gap-3 rounded-lg bg-secondary/85 p-3.5">
                    <div class="flex min-w-0 items-start gap-3">
                      <span class="size-11 rounded-md bg-muted"></span>
                      <div class="grid min-w-0 flex-1 gap-2">
                        <span class="h-4 w-56 max-w-full rounded-sm bg-muted"></span>
                        <span class="h-5 w-24 rounded-full bg-muted/70"></span>
                      </div>
                      <span class="size-9 rounded-sm bg-muted"></span>
                    </div>
                    <span class="h-4 w-[min(30rem,74vw)] rounded-sm bg-muted/70"></span>
                  </article>
                  }
                </div>
              </div>
            </section>
            }
          </main>
        </div>
        } @else if (error()) {
        <isumi-empty-state
          class="min-h-[28rem] justify-center"
          title="Link de viagem indisponível"
          description="Não foi possível abrir esta visão pública. Confira se o link está completo ou peça um novo link para quem está organizando a viagem.">
          <svg icon lucideShieldCheck class="size-5"></svg>
        </isumi-empty-state>
        } @else if (snapshot(); as trip) {
        <div class="grid gap-5">
          <section class="overflow-visible rounded-lg bg-card">
            <div class="grid gap-5 p-5 sm:p-6">
              <div class="flex flex-wrap items-start justify-between gap-5">
                <div class="min-w-0">
                  <h1 class="m-0 max-w-4xl text-3xl font-black leading-tight text-balance sm:text-4xl">
                    {{ trip.room.title }}
                  </h1>
                  <p class="m-0 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <span class="inline-flex items-center gap-1.5">
                      <svg lucideMapPin class="size-4" aria-hidden="true"></svg>
                      {{ trip.room.destination }}
                    </span>
                    <span class="inline-flex items-center gap-1.5">
                      <svg lucideCalendarDays class="size-4" aria-hidden="true"></svg>
                      {{ formatDateOnly(trip.room.startDate) }} - {{ formatDateOnly(trip.room.endDate) }}
                    </span>
                  </p>
                </div>
                <div class="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                  <isumi-tooltip [label]="timelineVisible() ? 'Ocultar timeline' : 'Exibir timeline'">
                  <isumi-button variant="secondary" size="sm" iconOnly type="button"
                    [ariaExpanded]="timelineVisible()"
                    ariaControls="public-trip-timeline"
                    [ariaLabel]="timelineVisible() ? 'Ocultar timeline da viagem' : 'Exibir timeline da viagem'"
                    (click)="toggleTimeline()">
                    <svg icon lucideRulerDimensionLine class="size-4" aria-hidden="true"></svg>
                    {{ timelineVisible() ? "Ocultar timeline" : "Exibir timeline" }}
                  </isumi-button>
                  </isumi-tooltip>
                  <isumi-tooltip [label]="generalMapAddressCount() > 0 ? 'Visualizar mapa geral' : 'Adicione coordenadas para ver o mapa geral'">
                  <isumi-button variant="secondary" size="sm" iconOnly type="button"
                    ariaLabel="Visualizar mapa geral"
                    [disabled]="generalMapAddressCount() === 0"
                    (click)="openGeneralMap()">
                    <svg icon lucideMap class="size-4" aria-hidden="true"></svg>
                    Visualizar mapa geral
                  </isumi-button>
                  </isumi-tooltip>
                </div>
              </div>
            </div>
          </section>

          @if (pendingPlaces().length > 0) {
          <section class="min-w-0 max-w-full rounded-lg bg-card p-5 sm:p-6" aria-label="Lugares pendentes fora dos dias">
            <div>
              <strong class="block text-sm font-black leading-5">Lugares pendentes</strong>
              <span class="text-xs font-semibold leading-5 text-muted-foreground">
                {{ pendingPlaces().length }} {{ pendingPlaces().length === 1 ? "item fora dos dias" : "itens fora dos dias" }}
              </span>
            </div>

            <div class="mt-3 w-full max-w-full min-w-0 overflow-x-auto pb-1">
              <div class="flex min-w-max gap-2">
                @for (place of pendingPlaces(); track place.id) {
                <article class="flex w-64 max-w-[76vw] shrink-0 items-center gap-2.5 rounded-md bg-secondary/70 px-3 py-2 text-secondary-foreground">
                  <span class="grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4" [class]="categoryVisual(place.category).classes" aria-hidden="true">
                    <ng-container *ngComponentOutlet="categoryVisual(place.category).icon" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <strong class="block truncate text-[0.8125rem] font-extrabold leading-5 text-foreground/90">
                      {{ place.name }}
                    </strong>
                    @if (place.address) {
                    <span class="block truncate text-[0.6875rem] font-bold leading-4 text-muted-foreground">
                      {{ place.address }}
                    </span>
                    }
                  </div>
                </article>
                }
              </div>
            </div>
          </section>
          }

          @if (timelineRendered()) {
          <div id="public-trip-timeline"
            class="public-trip-timeline-shell"
            [class.public-trip-timeline-shell--visible]="timelineVisible()"
            [class.public-trip-timeline-shell--after-pending]="pendingPlaces().length > 0 && timelineVisible()"
            [attr.aria-hidden]="!timelineVisible()"
            [attr.inert]="timelineVisible() ? null : ''">
            <div class="min-h-0 overflow-hidden">
              <isumi-trip-day-timeline
                [days]="days()"
                [items]="trip.items"
                [focusedDay]="focusedDay()"
                [alwaysExpanded]="true"
                (previousDayRequested)="scrollToPreviousDay()"
                (nextDayRequested)="scrollToNextDay()"
              (dayFocused)="scrollToDay($event)" />
            </div>
          </div>
          }

          <main class="grid min-w-0 gap-4" aria-label="Roteiro público da viagem">
            @for (day of days(); track day.id) {
            <section class="overflow-visible rounded-lg bg-card" [id]="dayElementId(day.id)" [attr.aria-labelledby]="'public-day-' + day.id">
                @let mapPoints = mapPointsForDay(day);
                <header class="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border px-4 py-4">
                  <div class="flex min-w-0 items-start gap-3.5">
                    <span class="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-base font-black text-primary-foreground">
                      {{ day.position + 1 }}
                    </span>
                    <div class="grid min-w-0 gap-0.5">
                      <div class="grid min-w-0 gap-0.5">
                        <h2 [id]="'public-day-' + day.id" class="m-0 text-xl font-black leading-none tracking-normal">
                          Dia {{ day.position + 1 }}
                        </h2>
                        <p class="m-0 text-sm leading-5 text-muted-foreground">{{ formatDateLong(day.date) }}</p>
                      </div>
                    </div>
                  </div>
                  <isumi-tag tone="primary" size="small">{{ itemsForDay(day.id).length }} paradas</isumi-tag>
                </header>

                <div class="grid gap-3 px-4 py-4">
                  @if (departureLodgingForDay(day); as lodging) {
                  <section class="grid gap-0" aria-label="Hospedagem de partida">
                    <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-[minmax(0,1fr)_11rem]">
                      <article class="grid w-full rounded-lg bg-secondary/65 p-3 text-secondary-foreground">
                        <div class="flex min-w-0 items-start gap-3">
                          <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                            <svg lucideBedDouble class="size-4" aria-hidden="true"></svg>
                          </span>
                          <div class="min-w-0 flex-1">
                            <strong class="block break-words text-[0.9375rem] font-extrabold leading-5 text-foreground/85">
                              {{ lodging.name }}
                            </strong>
                            <span class="mt-0.5 block text-xs font-semibold leading-5 text-muted-foreground">
                              {{ formatDateOnly(lodging.checkInDate) }} → {{ formatDateOnly(lodging.checkOutDate) }}
                            </span>
                          </div>
                          @if (lodging.address) {
                          <isumi-tooltip class="shrink-0" label="Copiar link do mapa">
                          <isumi-button class="shrink-0" variant="ghost" size="sm" iconOnly ariaLabel="Copiar link do mapa"
                            (click)="copyPlaceAddress(lodging.address)">
                            <svg icon lucideMapPinned class="size-4"></svg>
                            Copiar link do mapa
                          </isumi-button>
                          </isumi-tooltip>
                          }
                        </div>

                        @if (lodging.address) {
                        <p class="m-0 mt-1.5 flex min-w-0 items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                          <svg lucideMapPin class="mt-0.5 size-3.5 shrink-0 text-foreground/45" aria-hidden="true"></svg>
                          <span class="min-w-0 break-words">{{ lodging.address }}</span>
                        </p>
                        }
                        @if (lodging.notes) {
                        <p class="m-0 mt-1.5 flex min-w-0 items-start gap-2 rounded-md bg-background/45 px-2.5 py-2 text-xs leading-5 text-foreground/80">
                          <svg lucideAsterisk class="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true"></svg>
                          <span class="min-w-0 break-words text-pretty">
                            @for (segment of observationTextSegments(lodging.notes); track $index) {
                            @if (segment.href) {
                            <a class="font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" [href]="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.text }}</a>
                            } @else {
                            <span>{{ segment.text }}</span>
                            }
                            }
                          </span>
                        </p>
                        }
                      </article>

                      @if (mapPoints.length > 0) {
                      <aside class="order-first min-h-24 min-w-0 overflow-hidden md:order-none">
                        <isumi-trip-mini-map [points]="mapPoints" />
                      </aside>
                      }
                    </div>

                    @if (itemsForDay(day.id)[0]) {
                    @let lodgingRoute = routeBeforeItem(day, 0);
                    <div class="relative mx-4 mt-3 flex min-h-11 items-center gap-2.5 rounded-md px-3 pl-10 text-left text-xs font-bold text-muted-foreground">
                      <span class="pointer-events-none absolute -bottom-5 -top-3 left-[1.375rem] w-px -translate-x-1/2 bg-border" aria-hidden="true"></span>
                      @switch (lodgingRoute?.transportMode) {
                      @case ("walk") { <svg lucideFootprints class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("car") { <svg lucideCar class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("transit") { <svg lucideBus class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("other") { <svg lucideShuffle class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @default { <svg lucideLink class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      }
                      <span>{{ routeDisplayLabel(lodgingRoute) }}</span>
                    </div>
                    }
                  </section>
                  }

                  <div class="relative grid gap-2 overflow-visible rounded-lg bg-background/65 p-2">
                    @for (item of itemsForDay(day.id); track item.id; let itemIndex = $index) {
                    @if (itemIndex > 0) {
                    @let route = routeBeforeItem(day, itemIndex);
                    <div class="relative mx-2 flex min-h-10 items-center gap-2.5 rounded-md px-3 pl-10 text-left text-xs font-bold text-muted-foreground">
                      <span class="pointer-events-none absolute -bottom-2 -top-2 left-[1.375rem] w-px -translate-x-1/2 bg-border" aria-hidden="true"></span>
                      @switch (route?.transportMode) {
                      @case ("walk") { <svg lucideFootprints class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-background p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("car") { <svg lucideCar class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-background p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("transit") { <svg lucideBus class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-background p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("other") { <svg lucideShuffle class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-background p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @default { <svg lucideLink class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-background p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      }
                      <span>{{ routeDisplayLabel(route) }}</span>
                    </div>
                    }

                    @if (placeById(item.placeId); as place) {
                    <article class="relative min-w-0 overflow-visible rounded-lg bg-secondary/85 text-secondary-foreground">
                      <div class="grid min-w-0 gap-2 p-3.5 md:gap-3">
                        <div class="flex min-w-0 items-start gap-3">
                          <span class="grid size-11 shrink-0 place-items-center rounded-md [&_svg]:size-5" [class]="categoryVisual(place.category).classes" aria-hidden="true">
                            <ng-container *ngComponentOutlet="categoryVisual(place.category).icon" />
                          </span>

                          <div class="min-w-0 flex-1">
                            <div class="grid min-w-0 gap-1">
                              <strong class="min-w-0 truncate text-[0.9375rem] font-extrabold leading-5">
                                {{ place.name }}
                              </strong>
                              <span class="inline-flex w-fit shrink-0 items-center justify-self-start rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold leading-4" [class]="categoryVisual(place.category).classes">
                                {{ categoryLabel(place.category) }}
                              </span>
                            </div>
                          </div>

                          @if (place.address) {
                          <isumi-tooltip class="shrink-0" label="Copiar link do mapa">
                          <isumi-button class="shrink-0" variant="ghost" size="sm" iconOnly ariaLabel="Copiar link do mapa"
                            (click)="copyPlaceAddress(place.address)">
                            <svg icon lucideMapPinned class="size-4"></svg>
                            Copiar link do mapa
                          </isumi-button>
                          </isumi-tooltip>
                          }
                        </div>

                        @if (place.address) {
                        <span class="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                          <svg lucideMapPin class="mt-0.5 size-3.5 shrink-0 text-foreground/55" aria-hidden="true"></svg>
                          <span class="min-w-0 break-words">{{ place.address }}</span>
                        </span>
                        }

                        @if (place.notes) {
                        <p class="m-0 flex items-start gap-2 rounded-md bg-background/45 px-3 py-2 text-xs leading-5 text-foreground/80">
                          <svg lucideAsterisk class="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true"></svg>
                          <span class="min-w-0 break-words text-pretty">
                            @for (segment of observationTextSegments(place.notes); track $index) {
                            @if (segment.href) {
                            <a class="font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" [href]="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.text }}</a>
                            } @else {
                            <span>{{ segment.text }}</span>
                            }
                            }
                          </span>
                        </p>
                        }
                      </div>
                    </article>
                    }
                    } @empty {
                    <isumi-empty-state
                      class="min-h-44 justify-center"
                      title="Este dia está livre"
                      description="Nenhuma parada foi adicionada a este dia ainda.">
                      <svg icon lucideFootprints class="size-5"></svg>
                    </isumi-empty-state>
                    }
                  </div>

                  @if (arrivalLodgingForDay(day); as lodging) {
                  <section class="grid gap-0" aria-label="Hospedagem de chegada">
                    @let route = routeToArrivalLodging(day, lodging);
                    <div class="relative mx-4 mb-3 mt-3 flex min-h-11 items-center gap-2.5 rounded-md px-3 pl-10 text-left text-xs font-bold text-muted-foreground">
                      <span class="pointer-events-none absolute -bottom-3 -top-8 left-[1.375rem] w-px -translate-x-1/2 bg-border" aria-hidden="true"></span>
                      @switch (route?.transportMode) {
                      @case ("walk") { <svg lucideFootprints class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("car") { <svg lucideCar class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("transit") { <svg lucideBus class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @case ("other") { <svg lucideShuffle class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      @default { <svg lucideLink class="absolute left-2.5 z-10 box-content size-4 rounded-full bg-card p-1 text-muted-foreground" aria-hidden="true"></svg> }
                      }
                      <span>{{ routeDisplayLabel(route) }}</span>
                    </div>

                    <article class="grid w-full rounded-lg bg-secondary/65 p-3 text-secondary-foreground">
                      <div class="flex min-w-0 items-start gap-3">
                        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                          <svg lucideBedDouble class="size-4" aria-hidden="true"></svg>
                        </span>
                        <div class="min-w-0 flex-1">
                          <strong class="block break-words text-[0.9375rem] font-extrabold leading-5 text-foreground/85">
                            {{ lodging.name }}
                          </strong>
                          <span class="mt-0.5 block text-xs font-semibold leading-5 text-muted-foreground">
                            {{ formatDateOnly(lodging.checkInDate) }} → {{ formatDateOnly(lodging.checkOutDate) }}
                          </span>
                        </div>
                        @if (lodging.address) {
                        <isumi-tooltip class="shrink-0" label="Copiar link do mapa">
                        <isumi-button class="shrink-0" variant="ghost" size="sm" iconOnly ariaLabel="Copiar link do mapa"
                          (click)="copyPlaceAddress(lodging.address)">
                          <svg icon lucideMapPinned class="size-4"></svg>
                          Copiar link do mapa
                        </isumi-button>
                        </isumi-tooltip>
                        }
                      </div>

                        @if (lodging.address) {
                        <p class="m-0 mt-1.5 flex min-w-0 items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                          <svg lucideMapPin class="mt-0.5 size-3.5 shrink-0 text-foreground/45" aria-hidden="true"></svg>
                          <span class="min-w-0 break-words">{{ lodging.address }}</span>
                        </p>
                        }
                        @if (lodging.notes) {
                        <p class="m-0 mt-1.5 flex min-w-0 items-start gap-2 rounded-md bg-background/45 px-2.5 py-2 text-xs leading-5 text-foreground/80">
                          <svg lucideAsterisk class="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true"></svg>
                          <span class="min-w-0 break-words text-pretty">
                            @for (segment of observationTextSegments(lodging.notes); track $index) {
                            @if (segment.href) {
                            <a class="font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" [href]="segment.href" target="_blank" rel="noopener noreferrer">{{ segment.text }}</a>
                            } @else {
                            <span>{{ segment.text }}</span>
                            }
                            }
                          </span>
                        </p>
                        }
                    </article>
                  </section>
                  }
                </div>
            </section>
            }
          </main>
        </div>
        }
      </div>
      @if (showBackToTop()) {
      <div class="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 md:bottom-6 md:right-6">
        <isumi-tooltip label="Voltar ao topo">
        <isumi-button variant="secondary" iconOnly ariaLabel="Voltar ao topo" (click)="scrollToTop()">
          <svg icon lucideArrowUp class="size-5" aria-hidden="true"></svg>
          Voltar ao topo
        </isumi-button>
        </isumi-tooltip>
      </div>
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }

    .public-trip-page {
      background:
        linear-gradient(180deg, rgb(15 12 22) 0%, rgb(10 8 15) 44%, rgb(8 7 12) 100%);
      isolation: isolate;
    }

    .public-trip-page::before {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      content: "";
      background:
        linear-gradient(rgb(216 180 254 / 0.1) 1px, transparent 1px),
        linear-gradient(90deg, rgb(216 180 254 / 0.1) 1px, transparent 1px);
      background-position: -1px -1px;
      background-size: 72px 72px;
      opacity: 0.18;
      mask-image: radial-gradient(circle at 50% 42%, black, transparent 72%);
    }

    .public-trip-page::after {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      content: "";
      background:
        linear-gradient(180deg, rgb(8 7 12 / 0.08), rgb(8 7 12 / 0.46)),
        radial-gradient(ellipse at center, transparent 0%, transparent 54%, rgb(8 7 12 / 0.52) 100%);
    }

    .public-trip-timeline-shell {
      display: grid;
      grid-template-rows: 0fr;
      opacity: 0;
      transform: translateY(-0.5rem);
      transition:
        grid-template-rows 240ms cubic-bezier(0.22, 1, 0.36, 1),
        opacity 180ms ease-out,
        transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
      pointer-events: none;
    }

    .public-trip-timeline-shell--visible {
      grid-template-rows: 1fr;
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    .public-trip-timeline-shell--after-pending {
      margin-top: -0.5rem;
    }

    @media (prefers-reduced-motion: reduce) {
      .public-trip-timeline-shell {
        transform: none;
        transition: opacity 80ms linear;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripPublicViewComponent implements OnInit {
  private readonly trips = inject(TripsService);
  private readonly clipboard = inject(IsumiClipboardService);
  private readonly toast = inject(IsumiToastService);
  private readonly modal = inject(IsumiModalService);
  private readonly backToTopThreshold = 640;

  readonly shareToken = input.required<string>();
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly snapshot = signal<PublicTripSnapshot | null>(null);
  readonly focusedDayId = signal<string | null>(null);
  readonly timelineVisible = signal(false);
  readonly timelineRendered = signal(false);
  readonly showBackToTop = signal(false);
  readonly days = computed(() => [...(this.snapshot()?.days || [])].sort((first, second) => first.position - second.position));
  readonly focusedDay = computed(() =>
    this.days().find((day) => day.id === this.focusedDayId()) || this.days()[0] || null
  );
  readonly focusedDayIndex = computed(() =>
    this.days().findIndex((day) => day.id === this.focusedDay()?.id)
  );
  readonly generalMapPoints = computed(() => buildTripGeneralMapPoints(
    this.days(),
    this.snapshot()?.places || [],
    this.snapshot()?.items || [],
    this.snapshot()?.lodgings || []
  ));
  readonly generalMapAddressCount = computed(() => this.generalMapPoints().length);
  readonly pendingPlaces = computed(() => {
    const scheduledPlaceIds = new Set((this.snapshot()?.items || []).map((item) => item.placeId));
    return [...(this.snapshot()?.places || [])]
      .filter((place) => !scheduledPlaceIds.has(place.id))
      .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  });

  ngOnInit(): void {
    this.updateBackToTopVisibility();
    this.trips.publicSnapshot(this.shareToken()).subscribe({
      next: (snapshot) => {
        this.snapshot.set(snapshot);
        this.focusedDayId.set([...snapshot.days].sort((first, second) => first.position - second.position)[0]?.id || null);
        this.error.set(false);
      },
      error: () => {
        this.error.set(true);
        this.snapshot.set(null);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false)
    });
  }

  @HostListener("window:scroll")
  onWindowScroll(): void {
    this.updateBackToTopVisibility();
  }

  toggleTimeline(): void {
    if (this.timelineVisible()) {
      this.timelineVisible.set(false);
      window.setTimeout(() => {
        if (!this.timelineVisible()) {
          this.timelineRendered.set(false);
        }
      }, 240);
    } else {
      this.timelineRendered.set(true);
      window.requestAnimationFrame(() => this.timelineVisible.set(true));
    }
    if (!this.focusedDayId()) {
      this.focusedDayId.set(this.days()[0]?.id || null);
    }
  }

  scrollToPreviousDay(): void {
    const index = this.focusedDayIndex();
    const previousDay = index > 0 ? this.days()[index - 1] : null;
    if (previousDay) this.scrollToDay(previousDay.id);
  }

  scrollToNextDay(): void {
    const index = this.focusedDayIndex();
    const nextDay = index >= 0 ? this.days()[index + 1] : null;
    if (nextDay) this.scrollToDay(nextDay.id);
  }

  scrollToDay(dayId: string): void {
    const day = this.days().find((candidate) => candidate.id === dayId);
    if (!day) return;

    this.focusedDayId.set(day.id);
    document.getElementById(this.dayElementId(day.id))?.scrollIntoView({
      behavior: this.preferredScrollBehavior(),
      block: "start"
    });
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: this.preferredScrollBehavior() });
  }

  openGeneralMap(): void {
    if (this.generalMapAddressCount() === 0) return;

    this.modal.open<TripGeneralMapModalComponent, TripGeneralMapModalData, void>(
      TripGeneralMapModalComponent,
      {
        data: {
          points: this.generalMapPoints,
          days: this.days(),
          readOnly: true
        },
        ariaLabel: "Mapa geral da viagem",
        panelClass: "sm:!w-[min(calc(100vw-2rem),82rem)]"
      }
    );
  }

  dayElementId(dayId: string): string {
    return `public-trip-day-${dayId}`;
  }

  formatDateOnly(date: string): string {
    return SHORT_DATE_FORMATTER.format(dateOnlyValue(date));
  }

  formatDateLong(date: string): string {
    return LONG_DATE_FORMATTER.format(dateOnlyValue(date));
  }

  itemsForDay(dayId: string): PublicTripDayItem[] {
    return (this.snapshot()?.items || [])
      .filter((item) => item.dayId === dayId)
      .sort((first, second) => first.position - second.position);
  }

  placeById(placeId: string): PublicTripPlace | undefined {
    return this.snapshot()?.places.find((place) => place.id === placeId);
  }

  departureLodgingForDay(day: TripDay): PublicTripLodging | null {
    const lodgings = this.snapshot()?.lodgings || [];
    return lodgings.find((lodging) => lodging.checkOutDate === day.date)
      || lodgings.find((lodging) => lodging.checkInDate <= day.date && lodging.checkOutDate >= day.date)
      || null;
  }

  arrivalLodgingForDay(day: TripDay): PublicTripLodging | null {
    const departure = this.departureLodgingForDay(day);
    if (!departure || departure.checkOutDate !== day.date) return null;
    return (this.snapshot()?.lodgings || []).find((lodging) => lodging.id !== departure.id && lodging.checkInDate === day.date) || null;
  }

  routeBeforeItem(day: TripDay, itemIndex: number): PublicTripRoute | null {
    const items = this.itemsForDay(day.id);
    const current = items[itemIndex];
    if (!current) return null;
    if (itemIndex > 0) {
      return this.routeForEndpoints(items[itemIndex - 1].id, null, current.id, null);
    }
    const lodging = this.departureLodgingForDay(day);
    return lodging ? this.routeForEndpoints(null, lodging.id, current.id, null) : null;
  }

  routeToArrivalLodging(day: TripDay, lodging: PublicTripLodging): PublicTripRoute | null {
    const items = this.itemsForDay(day.id);
    const lastItem = items[items.length - 1];
    if (lastItem) return this.routeForEndpoints(lastItem.id, null, null, lodging.id);
    const departure = this.departureLodgingForDay(day);
    return departure ? this.routeForEndpoints(null, departure.id, null, lodging.id) : null;
  }

  transportLabel(mode: TripTransportMode): string {
    return { walk: "Caminhada", car: "Carro", transit: "Transporte público", other: "Outro" }[mode];
  }

  routeDisplayLabel(route: PublicTripRoute | null): string {
    return route ? this.transportLabel(route.transportMode) : "Trajeto não informado";
  }

  mapPointsForDay(day: TripDay): TripMiniMapPoint[] {
    const lodging = this.departureLodgingForDay(day);
    const lodgingPoint: TripMiniMapPoint[] = lodging && hasValidCoordinates(lodging)
      ? [{
          kind: "lodging",
          id: `lodging-${lodging.id}`,
          name: lodging.name,
          address: lodging.address || "Endereço não informado",
          markerLabel: "H",
          position: 0,
          latitude: lodging.latitude,
          longitude: lodging.longitude
        }]
      : [];
    const arrival = this.arrivalLodgingForDay(day);
    const arrivalPoint: TripMiniMapPoint[] = arrival && hasValidCoordinates(arrival)
      ? [{
          kind: "lodging",
          id: `lodging-${arrival.id}`,
          name: arrival.name,
          address: arrival.address || "Endereço não informado",
          markerLabel: "H",
          position: this.itemsForDay(day.id).length + 1,
          latitude: arrival.latitude,
          longitude: arrival.longitude
        }]
      : [];
    const placePoints = this.itemsForDay(day.id)
      .map((item, index): TripMiniMapPoint | null => {
        const place = this.placeById(item.placeId);
        if (!place || !hasValidCoordinates(place)) return null;
        return {
          kind: "place",
          id: item.id,
          placeId: place.id,
          name: place.name,
          address: place.address || "Endereço não informado",
          category: place.category,
          markerLabel: String(index + 1),
          position: index + 1,
          latitude: place.latitude,
          longitude: place.longitude
        };
      })
      .filter((point): point is TripMiniMapPoint => point !== null);
    return [...lodgingPoint, ...placePoints, ...arrivalPoint];
  }

  categoryLabel(category: TripPlaceCategory): string {
    return PLACE_CATEGORY_VISUALS[category].label;
  }

  categoryVisual(category: TripPlaceCategory) {
    return PLACE_CATEGORY_VISUALS[category];
  }

  observationTextSegments(text: string): ObservationTextSegment[] {
    const segments: ObservationTextSegment[] = [];
    let cursor = 0;

    for (const match of text.matchAll(OBSERVATION_URL_PATTERN)) {
      const rawUrl = match[0];
      const matchIndex = match.index ?? 0;
      const trimmedUrl = rawUrl.replace(TRAILING_URL_PUNCTUATION, "");
      const trailingText = rawUrl.slice(trimmedUrl.length);

      if (matchIndex > cursor) {
        segments.push({ text: text.slice(cursor, matchIndex) });
      }

      segments.push({
        text: trimmedUrl,
        href: trimmedUrl.startsWith("www.") ? `https://${trimmedUrl}` : trimmedUrl
      });

      if (trailingText) {
        segments.push({ text: trailingText });
      }

      cursor = matchIndex + rawUrl.length;
    }

    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor) });
    }

    return segments.length > 0 ? segments : [{ text }];
  }

  async copyPlaceAddress(address: string): Promise<void> {
    const normalizedAddress = address.trim();
    if (!normalizedAddress) return;

    const mapUrl = this.googleMapsUrl(normalizedAddress);

    try {
      await this.clipboard.copyText(mapUrl);
      this.toast.success(this.shouldOfferGoogleMapsOpen()
        ? "Link copiado. Abrindo o Google Maps..."
        : "Link do mapa copiado.");
      this.openGoogleMapsOnMobile(mapUrl);
    } catch {
      this.toast.error("Não foi possível copiar o link do mapa.");
    }
  }

  googleMapsUrl(address: string): string {
    return googleMapsUrlForAddress(address);
  }

  private routeForEndpoints(
    fromItemId: string | null,
    fromLodgingId: string | null,
    toItemId: string | null,
    toLodgingId: string | null
  ): PublicTripRoute | null {
    return (this.snapshot()?.routes || []).find((route) =>
      route.fromItemId === fromItemId
      && route.fromLodgingId === fromLodgingId
      && route.toItemId === toItemId
      && route.toLodgingId === toLodgingId
    ) || null;
  }

  private openGoogleMapsOnMobile(mapUrl: string): void {
    if (!this.shouldOfferGoogleMapsOpen()) return;
    window.setTimeout(() => {
      window.location.href = mapUrl;
    }, 250);
  }

  private preferredScrollBehavior(): ScrollBehavior {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  private updateBackToTopVisibility(): void {
    const shouldShow = window.scrollY > this.backToTopThreshold;
    if (this.showBackToTop() !== shouldShow) {
      this.showBackToTop.set(shouldShow);
    }
  }

  private shouldOfferGoogleMapsOpen(): boolean {
    return window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 768px)").matches;
  }
}
