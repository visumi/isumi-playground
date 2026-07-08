import { NgComponentOutlet, NgTemplateOutlet } from "@angular/common";
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDropList,
  CdkDropListGroup
} from "@angular/cdk/drag-drop";
import { HttpErrorResponse } from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  TemplateRef,
  Type,
  ViewChild,
  computed,
  inject,
  input,
  signal
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import {
  LucideAsterisk,
  LucideArrowDown,
  LucideArrowUp,
  LucideBedDouble,
  LucideBus,
  LucideCalendarDays,
  LucideCar,
  LucideClock3,
  LucideFiles,
  LucideFootprints,
  LucideGripVertical,
  LucideLandmark,
  LucideLink,
  LucideList,
  LucideLocateFixed,
  LucideMap,
  LucideMapPin,
  LucideMapPinned,
  LucideMaximize2,
  LucideMinimize2,
  LucideMoonStar,
  LucideMoveRight,
  LucidePencil,
  LucidePin,
  LucidePlus,
  LucideRoute,
  LucideSave,
  LucideShare2,
  LucideShoppingBag,
  LucideShuffle,
  LucideTrash2,
  LucideTrees,
  LucideUtensils,
  LucideUsers,
  LucideWeightTilde,
  LucideWifiOff,
  LucideX
} from "@lucide/angular";
import { firstValueFrom } from "rxjs";
import {
  TripDay,
  TripDayItem,
  TripLodging,
  TripPlace,
  TripPlaceCategory,
  TripRoom,
  TripRoute,
  TripSnapshot,
  TripTransportMode,
  UpsertTripRouteRequest
} from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";
import {
  IsumiAvatarGroupComponent,
  IsumiBreadcrumbComponent,
  IsumiButtonComponent,
  IsumiClipboardService,
  IsumiEmptyStateComponent,
  IsumiInputDirective,
  IsumiModalRef,
  IsumiModalService,
  IsumiSelectDirective,
  IsumiTabComponent,
  IsumiTagComponent,
  IsumiToastService,
  IsumiTooltipComponent,
  injectIsumiModalData,
  injectIsumiModalRef
} from "../../shared/ui";
import {
  TripGeneralMapAllocation,
  TripGeneralMapModalComponent,
  TripGeneralMapModalData
} from "./trip-general-map-modal.component";
import { TripDayMapModalComponent, TripDayMapModalData } from "./trip-day-map-modal.component";
import { TripDayMapPoint, TripMapPoint } from "./trip-day-map.component";
import { TripDayTimelineComponent } from "./trip-day-timeline.component";
import { TripRoomStore } from "./trip-room.store";

type TrayDragData = { kind: "place"; place: TripPlace };
type ItemDragData = { kind: "item"; item: TripDayItem };
type TripDayOrderMode = "near-first" | "far-first" | "distance-curve";
type RouteEndpoint =
  | { kind: "item"; itemId: string }
  | { kind: "lodging"; lodgingId: string };
type RouteDraft = {
  from: RouteEndpoint;
  to: RouteEndpoint;
};
export interface ObservationTextSegment {
  text: string;
  href?: string;
}

export interface CoordinatePair {
  latitude: number;
  longitude: number;
}

const OBSERVATION_URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?]+$/;
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

export function googleMapsUrlForAddress(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

export function linkifyObservationText(text: string): ObservationTextSegment[] {
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

export function parseCoordinatePair(value: string): CoordinatePair | null {
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

export function formatCoordinatePair(latitude: number | null, longitude: number | null): string {
  return latitude === null || longitude === null ? "" : `${latitude}, ${longitude}`;
}

export function hasValidCoordinates<T extends { latitude: number | null; longitude: number | null }>(point: T): point is T & {
  latitude: number;
  longitude: number;
} {
  return point.latitude !== null
    && point.longitude !== null
    && Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude);
}

export function haversineDistanceInMeters(from: CoordinatePair, to: CoordinatePair): number {
  const earthRadiusMeters = 6_371_000;
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function dateOnlyValue(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

export function departureLodgingForDate(lodgings: TripLodging[], date: string): TripLodging | null {
  return lodgings.find((lodging) => lodging.checkOutDate === date)
    || lodgings.find((lodging) => lodging.checkInDate <= date && lodging.checkOutDate >= date)
    || null;
}

export function arrivalLodgingForDate(lodgings: TripLodging[], date: string, departure: TripLodging | null): TripLodging | null {
  if (!departure || departure.checkOutDate !== date) return null;
  return lodgings.find((lodging) => lodging.id !== departure.id && lodging.checkInDate === date) || null;
}

export function suggestedLodgingDates(room: TripRoom, lodgings: TripLodging[]): { checkInDate: string; checkOutDate: string } {
  const lastCheckOutDate = lodgings.reduce<string | null>((latest, lodging) =>
    !latest || lodging.checkOutDate > latest ? lodging.checkOutDate : latest
  , null);
  return {
    checkInDate: lastCheckOutDate || room.startDate,
    checkOutDate: room.endDate
  };
}

export function tripDayMapMarkerClass(dayNumber: number): string {
  const classNames = [
    "trip-map-marker--day-1",
    "trip-map-marker--day-2",
    "trip-map-marker--day-3",
    "trip-map-marker--day-4",
    "trip-map-marker--day-5",
    "trip-map-marker--day-6"
  ];
  return classNames[(dayNumber - 1) % classNames.length];
}

export function buildTripGeneralMapPoints(
  days: TripDay[],
  places: TripPlace[],
  items: TripDayItem[],
  lodgings: TripLodging[]
): TripMapPoint[] {
  const daysById = new Map(days.map((day) => [day.id, day]));
  const placesById = new Map(places.map((place) => [place.id, place]));
  const scheduledPlaceIds = new Set(items.map((item) => item.placeId));
  const scheduledPoints = [...items]
    .sort((first, second) => {
      const firstDay = daysById.get(first.dayId);
      const secondDay = daysById.get(second.dayId);
      return (firstDay?.position ?? 0) - (secondDay?.position ?? 0)
        || first.position - second.position;
    })
    .map((item): TripMapPoint | null => {
      const day = daysById.get(item.dayId);
      const place = placesById.get(item.placeId);
      if (!day || !place || !hasValidCoordinates(place)) return null;
      const dayNumber = day.position + 1;
      return {
        kind: "place",
        status: "scheduled",
        id: item.id,
        placeId: place.id,
        dayId: day.id,
        dayNumber,
        markerClass: tripDayMapMarkerClass(dayNumber),
        markerLabel: String(dayNumber),
        subtitle: `Dia ${dayNumber} · Parada ${item.position + 1}`,
        name: place.name,
        address: place.address || "Endereço não informado",
        category: place.category,
        position: item.position + 1,
        latitude: place.latitude,
        longitude: place.longitude
      };
    })
    .filter((point): point is TripMapPoint => point !== null);
  const unscheduledPoints = places
    .map((place): TripMapPoint | null => {
      if (scheduledPlaceIds.has(place.id) || !hasValidCoordinates(place)) return null;
      return {
        kind: "place",
        status: "unscheduled",
        id: `place-${place.id}`,
        placeId: place.id,
        markerClass: "trip-map-marker--unscheduled",
        markerLabel: "",
        subtitle: "Pendente",
        name: place.name,
        address: place.address || "Endereço não informado",
        category: place.category,
        latitude: place.latitude,
        longitude: place.longitude
      };
    })
    .filter((point): point is TripMapPoint => point !== null);
  const lodgingPoints = lodgings
    .filter(hasValidCoordinates)
    .map((lodging): TripMapPoint => ({
      kind: "lodging",
      status: "lodging",
      id: `lodging-${lodging.id}`,
      subtitle: "Hospedagem",
      name: lodging.name,
      address: lodging.address || "Endereço não informado",
      latitude: lodging.latitude,
      longitude: lodging.longitude
    }));

  return [...lodgingPoints, ...scheduledPoints, ...unscheduledPoints];
}

export const PLACE_CATEGORY_VISUALS: Record<TripPlaceCategory, {
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

interface DeleteTripRoomModalData {
  roomTitle: string;
}

interface DeleteTripPlaceModalData {
  placeName: string;
}

interface TripEditorModalData {
  template: TemplateRef<unknown>;
}

@Component({
  selector: "isumi-trip-editor-modal",
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `<ng-container *ngTemplateOutlet="data?.template || null" />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripEditorModalComponent {
  readonly data = injectIsumiModalData<TripEditorModalData>();
}

@Component({
  selector: "isumi-delete-trip-room-modal",
  standalone: true,
  imports: [IsumiButtonComponent, LucideTrash2, LucideX],
  template: `
    <div class="grid gap-5">
      <header class="flex items-start justify-between gap-4">
        <div>
          <div class="mb-3 grid size-10 place-items-center rounded-sm bg-destructive/15 text-destructive">
            <svg lucideTrash2 class="size-5" aria-hidden="true"></svg>
          </div>
          <h2 class="m-0 text-[1.2rem] font-black">Excluir viagem</h2>
          <p class="m-0 mt-2 max-w-[52ch] text-sm leading-6 text-muted-foreground">
            Isto remove "{{ data?.roomTitle || "esta viagem" }}", incluindo roteiro, lugares e hospedagens. Esta ação não pode ser desfeita.
          </p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar confirmação" (click)="modalRef.close(false)">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-1">
        <isumi-button mobileFull variant="secondary" type="button" [disabled]="modalRef.processing()" (click)="modalRef.close(false)">Cancelar</isumi-button>
        <isumi-button mobileFull variant="destructive" type="button" [loading]="modalRef.processing()" (click)="modalRef.submit(true)">
          <svg icon lucideTrash2 class="size-4" aria-hidden="true"></svg>
          Excluir viagem
        </isumi-button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeleteTripRoomModalComponent {
  readonly data = injectIsumiModalData<DeleteTripRoomModalData>();
  readonly modalRef = injectIsumiModalRef<DeleteTripRoomModalData, boolean>();
}

@Component({
  selector: "isumi-delete-trip-place-modal",
  standalone: true,
  imports: [IsumiButtonComponent, LucideTrash2, LucideX],
  template: `
    <div class="grid gap-5">
      <header class="flex items-start justify-between gap-4">
        <div>
          <div class="mb-3 grid size-10 place-items-center rounded-sm bg-destructive/15 text-destructive">
            <svg lucideTrash2 class="size-5" aria-hidden="true"></svg>
          </div>
          <h2 class="m-0 text-[1.2rem] font-black">Excluir lugar</h2>
          <p class="m-0 mt-2 max-w-[52ch] text-sm leading-6 text-muted-foreground">
            "{{ data?.placeName || "Este lugar" }}" será removido da biblioteca.
            Esta ação não pode ser desfeita.
          </p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly
          ariaLabel="Fechar confirmação" (click)="modalRef.close(false)">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-1">
        <isumi-button mobileFull variant="secondary" type="button" [disabled]="modalRef.processing()"
          (click)="modalRef.close(false)">Cancelar</isumi-button>
        <isumi-button mobileFull variant="destructive" type="button" [loading]="modalRef.processing()"
          (click)="modalRef.submit(true)">
          <svg icon lucideTrash2 class="size-4" aria-hidden="true"></svg>
          Excluir lugar
        </isumi-button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeleteTripPlaceModalComponent {
  readonly data = injectIsumiModalData<DeleteTripPlaceModalData>();
  readonly modalRef = injectIsumiModalRef<DeleteTripPlaceModalData, boolean>();
}

@Component({
  selector: "isumi-trip-room",
  standalone: true,
  imports: [
    NgComponentOutlet,
    FormsModule,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDragPreview,
    CdkDropList,
    CdkDropListGroup,
    IsumiAvatarGroupComponent,
    IsumiBreadcrumbComponent,
    IsumiButtonComponent,
    IsumiEmptyStateComponent,
    IsumiInputDirective,
    IsumiSelectDirective,
    IsumiTabComponent,
    IsumiTagComponent,
    IsumiTooltipComponent,
    LucideAsterisk,
    LucideArrowDown,
    LucideArrowUp,
    LucideBedDouble,
    LucideBus,
    LucideCalendarDays,
    LucideCar,
    LucideClock3,
    LucideFiles,
    LucideFootprints,
    LucideGripVertical,
    LucideLink,
    LucideList,
    LucideLocateFixed,
    LucideMap,
    LucideMapPin,
    LucideMapPinned,
    LucideMaximize2,
    LucideMinimize2,
    LucideMoveRight,
    LucidePencil,
    LucidePin,
    LucidePlus,
    LucideRoute,
    LucideSave,
    LucideShare2,
    LucideShuffle,
    LucideTrash2,
    LucideUsers,
    LucideWeightTilde,
    LucideWifiOff,
    LucideX,
    TripDayTimelineComponent
  ],
  providers: [TripRoomStore],
  templateUrl: "./trip-room.component.html",
  styles: [`
    .trip-order-menu {
      animation: trip-order-menu-in 150ms cubic-bezier(0.22, 1, 0.36, 1);
      transform-origin: top right;
    }

    @keyframes trip-order-menu-in {
      from {
        opacity: 0;
        transform: translateY(-0.375rem) scale(0.98);
        filter: blur(2px);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .trip-order-menu {
        animation: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripRoomComponent implements OnInit, OnDestroy {
  private readonly trips = inject(TripsService);
  readonly router = inject(Router);
  private readonly toast = inject(IsumiToastService);
  private readonly modal = inject(IsumiModalService);
  private readonly clipboard = inject(IsumiClipboardService);
  readonly store = inject(TripRoomStore);
  readonly roomId = input.required<string>();
  readonly loading = signal(true);
  readonly deletingRoom = signal(false);
  readonly deletingPlaceId = signal<string | null>(null);
  readonly deletingLodgingId = signal<string | null>(null);
  readonly sharingPublicLink = signal(false);
  readonly savingPanel = signal(false);
  readonly focusedDayId = signal<string | null>(null);
  readonly dayAnimating = signal(false);
  readonly placeTab = signal<"unscheduled" | "scheduled">("unscheduled");
  readonly panel = signal<"place" | "route" | "lodging" | null>(null);
  readonly selectedPlace = signal<TripPlace | null>(null);
  readonly selectedLodging = signal<TripLodging | null>(null);
  readonly selectedItemId = signal<string | null>(null);
  readonly selectedRouteFromItemId = signal<string | null>(null);
  readonly selectedRouteFromLodgingId = signal<string | null>(null);
  readonly selectedRouteToItemId = signal<string | null>(null);
  readonly selectedRouteToLodgingId = signal<string | null>(null);
  readonly dragKind = signal<"place" | "item" | null>(null);
  readonly draggingEntityId = signal<string | null>(null);
  readonly draggingSourceDayId = signal<string | null>(null);
  readonly draggingItemLeftSourceDay = signal(false);
  readonly dayDragLayoutActive = signal(false);
  readonly activeDropTarget = signal<string | null>(null);
  readonly placeDragPlaceholderHeight = signal(96);
  readonly itemDragPlaceholderHeight = signal(96);
  readonly libraryDropPlaceholderHeight = signal(128);
  readonly dropPlaceholderHeight = 96;
  readonly dragPreviewWidth = signal(304);
  readonly dropFeedbackDayId = signal<string | null>(null);
  @ViewChild("placeLibrary") private placeLibrary?: ElementRef<HTMLElement>;
  @ViewChild("dayPanel") private dayPanel?: ElementRef<HTMLElement>;
  @ViewChild("editorModal") private editorModal?: TemplateRef<unknown>;
  private editorModalRef: IsumiModalRef<TripEditorModalData, void> | null = null;

  @HostListener("document:click", ["$event"])
  closeDayOrderMenuOnOutsideClick(event: MouseEvent): void {
    if (!this.dayOrderMenuDayId()) return;
    const target = event.target;
    if (target instanceof Element && target.closest("[data-trip-order-picker]")) return;
    this.closeDayOrderMenu();
  }

  readonly breadcrumbItems = computed(() => [
    { label: "Salas", link: "/tools/trips" },
    { label: "Sala" }
  ]);

  readonly placeName = signal("");
  readonly placeCategory = signal<TripPlaceCategory>("other");
  readonly placeAddress = signal("");
  readonly placeCoordinates = signal("");
  readonly placeNotes = signal("");
  readonly lodgingName = signal("");
  readonly lodgingAddress = signal("");
  readonly lodgingCoordinates = signal("");
  readonly lodgingNotes = signal("");
  readonly checkInDate = signal("");
  readonly checkOutDate = signal("");
  readonly sortingDayId = signal<string | null>(null);
  readonly dayOrderMode = signal<TripDayOrderMode>("near-first");
  readonly dayOrderMenuDayId = signal<string | null>(null);

  readonly routeTransportMode = signal<TripTransportMode | "">("");
  readonly routeDurationMinutes = signal<number | null>(null);
  readonly selectedRoute = computed(() => {
    const fromItemId = this.selectedRouteFromItemId();
    const toItemId = this.selectedRouteToItemId();
    const fromLodgingId = this.selectedRouteFromLodgingId();
    const toLodgingId = this.selectedRouteToLodgingId();
    return this.routeForEndpoints(fromItemId, fromLodgingId, toItemId, toLodgingId);
  });
  readonly focusedDay = computed(() =>
    this.store.days().find((day) => day.id === this.focusedDayId()) || this.store.days()[0] || null
  );
  readonly focusedDayIndex = computed(() =>
    this.store.days().findIndex((day) => day.id === this.focusedDay()?.id)
  );
  readonly focusedDayMapAddressCount = computed(() => {
    const day = this.focusedDay();
    return day ? this.mapAddressCountForDay(day) : 0;
  });
  readonly generalMapPoints = computed(() => buildTripGeneralMapPoints(
    this.store.days(),
    this.store.places(),
    this.store.snapshot()?.items || [],
    this.store.lodgings()
  ));
  readonly generalMapAddressCount = computed(() => this.generalMapPoints().length);
  readonly canShowPreviousDays = computed(() => this.focusedDayIndex() > 0);
  readonly canShowNextDays = computed(() =>
    this.focusedDayIndex() >= 0 && this.focusedDayIndex() < this.store.days().length - 1
  );
  readonly unscheduledPlaces = computed(() => {
    const scheduled = new Set(this.store.snapshot()?.items.map((item) => item.placeId) || []);
    return this.store.places().filter((place) => !scheduled.has(place.id));
  });
  readonly scheduledPlaces = computed(() => {
    const scheduled = new Set(this.store.snapshot()?.items.map((item) => item.placeId) || []);
    return this.store.places().filter((place) => scheduled.has(place.id));
  });
  readonly visiblePlaces = computed(() =>
    this.placeTab() === "unscheduled" ? this.unscheduledPlaces() : this.scheduledPlaces()
  );
  readonly libraryVisuallyEmpty = computed(() => {
    const places = this.visiblePlaces();
    if (places.length === 0) return true;
    return this.dragKind() === "place"
      && places.length === 1
      && places[0].id === this.draggingEntityId();
  });
  readonly dropPlaceholderLabel = computed(() => {
    const target = this.activeDropTarget();
    if (!target) return null;
    if (target === "library") {
      return this.dragKind() === "item" ? "Devolver à biblioteca" : "Manter na biblioteca";
    }
    if (this.usesFixedDayEntry(target)) {
      return this.dragKind() === "place" ? "Adicionar ao dia" : "Mover para o dia";
    }
    return "Mover para esta posição";
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.store.load(this.roomId());
      this.initializeDateForms();
      this.focusedDayId.set(this.store.days()[0]?.id || null);
      await this.store.connect();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 403) {
        await this.router.navigate(["/tools/trips", this.roomId()]);
        return;
      }
      this.toast.error("Não foi possível abrir esta viagem.");
      await this.router.navigateByUrl("/tools/trips");
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.setDocumentDragCursor(false);
    this.store.disconnect();
  }

  closePanel(): void {
    this.editorModalRef?.close();
  }

  placeById(placeId: string): TripPlace | undefined {
    return this.store.places().find((place) => place.id === placeId);
  }

  dayNumber(day: TripDay): number {
    return day.position + 1;
  }

  placeDays(placeId: string): TripDay[] {
    const dayIds = new Set(
      (this.store.snapshot()?.items || []).filter((item) => item.placeId === placeId).map((item) => item.dayId)
    );
    return this.store.days().filter((day) => dayIds.has(day.id));
  }

  focusDay(dayId: string): void {
    const dayIndex = this.store.days().findIndex((day) => day.id === dayId);
    if (dayIndex < 0 || dayIndex === this.focusedDayIndex()) return;
    void this.changeFocusedDay(dayIndex);
  }

  departureLodgingForDay(day: TripDay): TripLodging | null {
    return departureLodgingForDate(this.store.lodgings(), day.date);
  }

  arrivalLodgingForDay(day: TripDay): TripLodging | null {
    return arrivalLodgingForDate(this.store.lodgings(), day.date, this.departureLodgingForDay(day));
  }

  canOrderDayByProximity(day: TripDay): boolean {
    const lodging = this.departureLodgingForDay(day);
    const items = this.store.itemsForDay(day.id);
    return !!lodging
      && hasValidCoordinates(lodging)
      && items.length >= 2
      && items.every((item) => {
        const place = this.placeById(item.placeId);
        return !!place && hasValidCoordinates(place);
      });
  }

  formatDateOnly(date: string): string {
    return SHORT_DATE_FORMATTER.format(dateOnlyValue(date));
  }

  formatDateOnlyLong(date: string): string {
    return LONG_DATE_FORMATTER.format(dateOnlyValue(date));
  }

  editorForItem(itemId: string): string | null {
    const entry = Object.entries(this.store.editing()).find(([, selectedItemId]) => selectedItemId === itemId);
    if (!entry) return null;
    return this.store.presence().find((person) => person.userId === entry[0])?.name || "Outra pessoa";
  }

  drop(event: CdkDragDrop<TripDayItem[], TripDayItem[] | TripPlace[]>, day: TripDay): void {
    this.focusDay(day.id);
    const data = event.item.data as TrayDragData | ItemDragData;
    if (data.kind === "place") {
      void this.addPlaceToDay(data.place, day.id);
      return;
    }
    const targetPosition = this.usesFixedDayEntry(day.id) ? 0 : event.currentIndex;
    this.store.moveItem(data.item, day.id, targetPosition);
    this.showDropFeedback(day.id);
  }

  async dropInPlaceLibrary(event: CdkDragDrop<TripPlace[], TripDayItem[] | TripPlace[]>): Promise<void> {
    const data = event.item.data as TrayDragData | ItemDragData;
    if (data.kind !== "item") return;

    const hasAnotherAssociation = (this.store.snapshot()?.items || []).some(
      (item) => item.id !== data.item.id && item.placeId === data.item.placeId
    );
    try {
      const removed = await this.store.removeItem(data.item.id);
      if (!removed) throw new Error("remove_item_failed");
      await this.reload();
      if (!hasAnotherAssociation) this.placeTab.set("unscheduled");
      this.toast.success("Lugar devolvido à biblioteca.");
    } catch {
      this.toast.error("Não foi possível devolver o lugar à biblioteca.");
    }
  }

  startPlaceDrag(place: TripPlace): void {
    this.store.beginLocalDrag();
    this.dayDragLayoutActive.set(true);
    this.dragKind.set("place");
    this.draggingEntityId.set(place.id);
    this.draggingSourceDayId.set(null);
    this.draggingItemLeftSourceDay.set(false);
    this.libraryDropPlaceholderHeight.set(this.placeDragPlaceholderHeight());
    this.activeDropTarget.set("library");
    this.setDocumentDragCursor(true);
  }

  preparePlaceDrag(event: PointerEvent): void {
    const dragElement = (event.currentTarget as HTMLElement).closest<HTMLElement>(".cdk-drag");
    if (dragElement) {
      const dragBounds = dragElement.getBoundingClientRect();
      this.placeDragPlaceholderHeight.set(dragBounds.height);
      this.dragPreviewWidth.set(this.clampPreviewWidth(dragBounds.width));
      this.libraryDropPlaceholderHeight.set(this.placeDragPlaceholderHeight());
      this.activeDropTarget.set("library");
    }
  }

  cancelPreparedPlaceDrag(): void {
    if (this.dragKind() === null && this.activeDropTarget() === "library") {
      this.activeDropTarget.set(null);
    }
  }

  prepareItemDrag(event: PointerEvent): void {
    this.dayDragLayoutActive.set(true);
    const dragElement = (event.currentTarget as HTMLElement).closest<HTMLElement>(".cdk-drag");
    if (dragElement) {
      const dragBounds = dragElement.getBoundingClientRect();
      this.itemDragPlaceholderHeight.set(dragBounds.height);
      this.dragPreviewWidth.set(this.clampPreviewWidth(dragBounds.width));
    }
  }

  cancelPreparedItemDrag(): void {
    if (this.dragKind() === null) this.dayDragLayoutActive.set(false);
  }

  startItemDrag(item: TripDayItem): void {
    this.store.beginLocalDrag();
    this.dragKind.set("item");
    this.draggingEntityId.set(item.id);
    this.draggingSourceDayId.set(item.dayId);
    this.draggingItemLeftSourceDay.set(false);
    this.activeDropTarget.set(null);
    this.setDocumentDragCursor(true);
  }

  activateDropTarget(target: string): void {
    if (target === "library") {
      const libraryCard = this.placeLibrary?.nativeElement.querySelector<HTMLElement>("[data-place-card]");
      this.libraryDropPlaceholderHeight.set(
        this.dragKind() === "place"
          ? this.placeDragPlaceholderHeight()
          : libraryCard?.getBoundingClientRect().height || 128
      );
      this.updatePreviewWidth(this.placeLibrary?.nativeElement);
    } else {
      this.updatePreviewWidth(
        this.dayPanel?.nativeElement.querySelector<HTMLElement>(".trip-drop-list")
      );
    }
    this.activeDropTarget.set(target);
  }

  deactivateDropTarget(target: string): void {
    if (
      this.dragKind() === "item"
      && target === this.draggingSourceDayId()
    ) {
      this.draggingItemLeftSourceDay.set(true);
    }
    if (this.activeDropTarget() === target) this.activeDropTarget.set(null);
  }

  finishDrag(): void {
    this.store.endLocalDrag();
    this.dragKind.set(null);
    this.draggingEntityId.set(null);
    this.draggingSourceDayId.set(null);
    this.draggingItemLeftSourceDay.set(false);
    this.activeDropTarget.set(null);
    this.setDocumentDragCursor(false);
    window.setTimeout(() => this.dayDragLayoutActive.set(false), 180);
  }

  private setDocumentDragCursor(active: boolean): void {
    document.documentElement.classList.toggle("cursor-grabbing", active);
    document.body.classList.toggle("cursor-grabbing", active);
  }

  private updatePreviewWidth(container?: HTMLElement | null): void {
    if (!container) return;
    const styles = getComputedStyle(container);
    const innerWidth = container.getBoundingClientRect().width
      - Number.parseFloat(styles.paddingLeft)
      - Number.parseFloat(styles.paddingRight)
      - 16;
    this.dragPreviewWidth.set(this.clampPreviewWidth(innerWidth));
  }

  private clampPreviewWidth(width: number): number {
    return Math.max(240, Math.min(width, window.innerWidth - 32));
  }

  usesFixedDayEntry(dayId: string): boolean {
    return this.dragKind() === "place"
      || (
        this.dragKind() === "item"
        && (
          this.draggingSourceDayId() !== dayId
          || this.draggingItemLeftSourceDay()
        )
      );
  }

  async addPlaceToDay(place: TripPlace, dayId: string, showErrorToast = true): Promise<boolean> {
    this.focusDay(dayId);
    this.showDropFeedback(dayId);

    const added = await this.store.addItem(dayId, place.id);
    if (!added) {
      if (showErrorToast) this.toast.error("Não foi possível adicionar o lugar ao dia.");
      return false;
    }
    return true;
  }

  private showDropFeedback(dayId: string): void {
    this.dropFeedbackDayId.set(dayId);
    window.setTimeout(() => {
      if (this.dropFeedbackDayId() === dayId) this.dropFeedbackDayId.set(null);
    }, 500);
  }

  moveRelative(item: TripDayItem, delta: number): void {
    this.store.moveItem(item, item.dayId, Math.max(0, item.position + delta));
  }

  moveToDay(item: TripDayItem, dayId: string): void {
    this.store.moveItem(item, dayId, this.store.itemsForDay(dayId).length);
    this.focusDay(dayId);
  }

  toggleDayOrderMenu(day: TripDay, event?: Event): void {
    if (!this.canOrderDayByProximity(day) || this.sortingDayId()) return;
    this.dayOrderMenuDayId.update((openDayId) => openDayId === day.id ? null : day.id);
    const target = event?.target;
    if (target instanceof Element) {
      const button = target.closest("button");
      if (button instanceof HTMLButtonElement) button.blur();
    }
  }

  closeDayOrderMenu(): void {
    this.dayOrderMenuDayId.set(null);
  }

  isDayOrderMenuOpen(day: TripDay): boolean {
    return this.dayOrderMenuDayId() === day.id;
  }

  async orderDayByProximity(day: TripDay, mode: TripDayOrderMode = this.dayOrderMode()): Promise<void> {
    if (!this.canOrderDayByProximity(day) || this.sortingDayId()) return;
    const lodging = this.departureLodgingForDay(day);
    if (!lodging || !hasValidCoordinates(lodging)) return;

    this.dayOrderMode.set(mode);
    this.closeDayOrderMenu();

    const orderedItemIds = this.orderItemsFrom(
      { latitude: lodging.latitude, longitude: lodging.longitude },
      this.store.itemsForDay(day.id),
      mode
    ).map((item) => item.id);

    this.sortingDayId.set(day.id);
    try {
      const snapshot = await firstValueFrom(this.trips.reorderDayItems(this.roomId(), day.id, {
        itemIds: orderedItemIds
      }));
      this.store.setSnapshot(snapshot);
      this.toast.success(`Roteiro ordenado: ${this.orderModeLabel(mode).toLowerCase()}.`);
    } catch {
      this.toast.error("Não foi possível ordenar o roteiro.");
    } finally {
      this.sortingDayId.set(null);
    }
  }

  orderModeLabel(mode: TripDayOrderMode = this.dayOrderMode()): string {
    switch (mode) {
      case "far-first":
        return "Longe primeiro";
      case "distance-curve":
        return "Perto, longe, perto";
      default:
        return "Perto primeiro";
    }
  }

  showPreviousDays(): void {
    if (!this.canShowPreviousDays()) return;
    void this.changeFocusedDay(this.focusedDayIndex() - 1);
  }

  showNextDays(): void {
    if (!this.canShowNextDays()) return;
    void this.changeFocusedDay(this.focusedDayIndex() + 1);
  }

  private async changeFocusedDay(targetIndex: number): Promise<void> {
    if (this.dayAnimating()) return;
    const targetDay = this.store.days()[targetIndex];
    if (!targetDay) return;

    const direction = targetIndex > this.focusedDayIndex() ? 1 : -1;
    const panel = this.dayPanel?.nativeElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!panel || reducedMotion) {
      this.focusedDayId.set(targetDay.id);
      return;
    }

    this.dayAnimating.set(true);
    try {
      this.resetDayPanelAnimations(panel);
      await this.waitForDayAnimation(panel.animate(
        [
          { opacity: 1, transform: "translateX(0) scale(1)", filter: "blur(0)" },
          { opacity: 0, transform: `translateX(${-18 * direction}px) scale(0.99)`, filter: "blur(1.5px)" }
        ],
        { duration: 120, easing: "cubic-bezier(0.4, 0, 1, 1)" }
      ), 180);

      panel.style.opacity = "0";
      panel.style.transform = `translateX(${-18 * direction}px) scale(0.99)`;
      panel.style.filter = "blur(1.5px)";
      this.focusedDayId.set(targetDay.id);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const nextPanel = this.dayPanel?.nativeElement || panel;
      this.resetDayPanelAnimations(panel);
      this.resetDayPanelAnimations(nextPanel);
      await this.waitForDayAnimation(nextPanel.animate(
        [
          { opacity: 0, transform: `translateX(${26 * direction}px) scale(0.99)`, filter: "blur(1.5px)" },
          { opacity: 1, transform: "translateX(0) scale(1)", filter: "blur(0)" }
        ],
        { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      ), 320);
    } finally {
      this.resetDayPanelAnimations(panel);
      const currentPanel = this.dayPanel?.nativeElement;
      if (currentPanel && currentPanel !== panel) this.resetDayPanelAnimations(currentPanel);
      this.dayAnimating.set(false);
    }
  }

  private async waitForDayAnimation(animation: Animation, timeoutMs: number): Promise<void> {
    let timeoutId: number | null = null;
    try {
      await Promise.race([
        animation.finished.catch(() => undefined),
        new Promise<void>((resolve) => {
          timeoutId = window.setTimeout(resolve, timeoutMs);
        })
      ]);
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  }

  private resetDayPanelAnimations(panel: HTMLElement): void {
    panel.getAnimations().forEach((animation) => animation.cancel());
    panel.style.opacity = "";
    panel.style.transform = "";
    panel.style.filter = "";
  }

  openCreatePlace(): void {
    this.selectedPlace.set(null);
    this.placeName.set("");
    this.placeCategory.set("other");
    this.placeAddress.set("");
    this.placeCoordinates.set("");
    this.placeNotes.set("");
    this.openEditorModal("place");
  }

  openEditPlace(place: TripPlace, item?: TripDayItem): void {
    this.selectedPlace.set(place);
    this.placeName.set(place.name);
    this.placeCategory.set(place.category);
    this.placeAddress.set(place.address || "");
    this.placeCoordinates.set(formatCoordinatePair(place.latitude, place.longitude));
    this.placeNotes.set(place.notes || "");
    this.openEditorModal("place");
    if (!item) return;
    this.focusDay(item.dayId);
    this.selectedItemId.set(item.id);
    this.store.selectItem(item.id);
  }

  closePlaceEditor(): void {
    this.selectedItemId.set(null);
    this.selectedPlace.set(null);
    this.store.selectItem(null);
    this.closePanel();
  }

  async savePlace(): Promise<void> {
    if (!this.placeName().trim() || this.savingPanel()) return;
    const coordinates = parseCoordinatePair(this.placeCoordinates());
    if (!coordinates) {
      this.toast.error("Informe as coordenadas no formato latitude, longitude.");
      return;
    }
    const selected = this.selectedPlace();
    const payload = {
      name: this.placeName().trim(),
      category: this.placeCategory(),
      address: this.placeAddress(),
      notes: this.placeNotes(),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    };
    this.savingPanel.set(true);
    try {
      const snapshot = selected
        ? await firstValueFrom(this.trips.updatePlace(this.roomId(), selected.id, {
            ...payload,
            version: selected.version
          }))
        : await firstValueFrom(this.trips.createPlace(this.roomId(), payload));
      this.store.setSnapshot(snapshot);
      this.closePlaceEditor();
      this.toast.success(selected ? "Lugar atualizado." : "Lugar salvo na biblioteca.");
    } catch {
      this.toast.error(selected ? "Não foi possível atualizar o lugar." : "Não foi possível salvar o lugar.");
    } finally {
      this.savingPanel.set(false);
    }
  }

  async openDeletePlaceModal(place: TripPlace): Promise<void> {
    if (this.placeDays(place.id).length > 0) {
      this.toast.error("Remova o lugar do roteiro antes de excluí-lo.");
      return;
    }

    this.modal.open<DeleteTripPlaceModalComponent, DeleteTripPlaceModalData, boolean>(
      DeleteTripPlaceModalComponent,
      {
        data: {
          placeName: place.name
        },
        ariaLabel: "Confirmar exclusão do lugar",
        closeOnBackdrop: false,
        onSubmit: async () => {
          this.deletingPlaceId.set(place.id);
          try {
            await firstValueFrom(this.trips.deletePlace(this.roomId(), place.id));
            await this.reload();
            this.toast.success("Lugar excluído.");
          } catch (error) {
            this.toast.error("Não foi possível excluir o lugar.");
            throw error;
          } finally {
            this.deletingPlaceId.set(null);
          }
        }
      }
    );
  }

  routeBetween(fromItemId: string | null, toItemId: string | null): TripRoute | null {
    if (!fromItemId || !toItemId) return null;
    return this.store.routes().find((route) =>
      route.fromItemId === fromItemId && route.toItemId === toItemId
    ) || null;
  }

  routeFromLodging(fromLodgingId: string | null, toItemId: string | null): TripRoute | null {
    if (!fromLodgingId || !toItemId) return null;
    return this.routeForEndpoints(null, fromLodgingId, toItemId, null);
  }

  routeToLodging(fromItemId: string | null, toLodgingId: string | null): TripRoute | null {
    if (!fromItemId || !toLodgingId) return null;
    return this.routeForEndpoints(fromItemId, null, null, toLodgingId);
  }

  routeBetweenLodgings(fromLodgingId: string | null, toLodgingId: string | null): TripRoute | null {
    if (!fromLodgingId || !toLodgingId) return null;
    return this.routeForEndpoints(null, fromLodgingId, null, toLodgingId);
  }

  routeForEndpoints(
    fromItemId: string | null,
    fromLodgingId: string | null,
    toItemId: string | null,
    toLodgingId: string | null
  ): TripRoute | null {
    return this.store.routes().find((route) =>
      route.fromItemId === fromItemId
      && route.fromLodgingId === fromLodgingId
      && route.toItemId === toItemId
      && route.toLodgingId === toLodgingId
    ) || null;
  }

  openRoute(fromItem: TripDayItem, toItem: TripDayItem): void {
    this.openRouteDraft({
      from: { kind: "item", itemId: fromItem.id },
      to: { kind: "item", itemId: toItem.id }
    });
  }

  openLodgingRoute(lodging: TripLodging, toItem: TripDayItem): void {
    this.openRouteDraft({
      from: { kind: "lodging", lodgingId: lodging.id },
      to: { kind: "item", itemId: toItem.id }
    });
  }

  openArrivalRoute(fromItem: TripDayItem, lodging: TripLodging): void {
    this.openRouteDraft({
      from: { kind: "item", itemId: fromItem.id },
      to: { kind: "lodging", lodgingId: lodging.id }
    });
  }

  openLodgingTransferRoute(fromLodging: TripLodging, toLodging: TripLodging): void {
    this.openRouteDraft({
      from: { kind: "lodging", lodgingId: fromLodging.id },
      to: { kind: "lodging", lodgingId: toLodging.id }
    });
  }

  private openRouteDraft(draft: RouteDraft): void {
    const endpoints = this.routeEndpointIds(draft);
    const route = this.routeForEndpoints(
      endpoints.fromItemId,
      endpoints.fromLodgingId,
      endpoints.toItemId,
      endpoints.toLodgingId
    );
    this.selectedRouteFromItemId.set(endpoints.fromItemId);
    this.selectedRouteFromLodgingId.set(endpoints.fromLodgingId);
    this.selectedRouteToItemId.set(endpoints.toItemId);
    this.selectedRouteToLodgingId.set(endpoints.toLodgingId);
    this.routeTransportMode.set(route?.transportMode || "");
    this.routeDurationMinutes.set(route?.durationMinutes || null);
    this.openEditorModal("route");
  }

  async saveRoute(): Promise<void> {
    const fromItemId = this.selectedRouteFromItemId();
    const fromLodgingId = this.selectedRouteFromLodgingId();
    const toItemId = this.selectedRouteToItemId();
    const toLodgingId = this.selectedRouteToLodgingId();
    const transportMode = this.routeTransportMode();
    const durationMinutes = Number(this.routeDurationMinutes());
    if (
      (!fromItemId && !fromLodgingId)
      || (!toItemId && !toLodgingId)
      || !transportMode
      || !durationMinutes
      || this.savingPanel()
    ) return;
    const selected = this.selectedRoute();
    const payload = {
      ...this.serializeRouteEndpoints({ fromItemId, fromLodgingId, toItemId, toLodgingId }),
      transportMode,
      durationMinutes
    };
    this.savingPanel.set(true);
    try {
      const snapshot = selected
        ? await firstValueFrom(this.trips.updateRoute(this.roomId(), selected.id, {
            ...payload,
            version: selected.version
          }))
        : await firstValueFrom(this.trips.createRoute(this.roomId(), payload));
      this.store.setSnapshot(snapshot);
      this.closeRouteEditor();
      this.toast.success(selected ? "Trajeto atualizado." : "Trajeto definido.");
    } catch {
      this.toast.error("Não foi possível salvar o trajeto.");
    } finally {
      this.savingPanel.set(false);
    }
  }

  closeRouteEditor(): void {
    this.selectedRouteFromItemId.set(null);
    this.selectedRouteFromLodgingId.set(null);
    this.selectedRouteToItemId.set(null);
    this.selectedRouteToLodgingId.set(null);
    this.closePanel();
  }

  private routeEndpointIds(draft: RouteDraft): {
    fromItemId: string | null;
    fromLodgingId: string | null;
    toItemId: string | null;
    toLodgingId: string | null;
  } {
    return {
      fromItemId: draft.from.kind === "item" ? draft.from.itemId : null,
      fromLodgingId: draft.from.kind === "lodging" ? draft.from.lodgingId : null,
      toItemId: draft.to.kind === "item" ? draft.to.itemId : null,
      toLodgingId: draft.to.kind === "lodging" ? draft.to.lodgingId : null
    };
  }

  private serializeRouteEndpoints(input: {
    fromItemId: string | null;
    fromLodgingId: string | null;
    toItemId: string | null;
    toLodgingId: string | null;
  }): Pick<UpsertTripRouteRequest, "fromItemId" | "fromLodgingId" | "toItemId" | "toLodgingId"> {
    return {
      ...(input.fromItemId ? { fromItemId: input.fromItemId } : { fromLodgingId: input.fromLodgingId! }),
      ...(input.toItemId ? { toItemId: input.toItemId } : { toLodgingId: input.toLodgingId! })
    };
  }

  openCreateLodging(): void {
    this.selectedLodging.set(null);
    this.lodgingName.set("");
    this.lodgingAddress.set("");
    this.lodgingCoordinates.set("");
    this.lodgingNotes.set("");
    this.initializeDateForms();
    this.openEditorModal("lodging");
  }

  openCreateLodgingForDay(_day: TripDay): void {
    this.selectedLodging.set(null);
    this.lodgingName.set("");
    this.lodgingAddress.set("");
    this.lodgingCoordinates.set("");
    this.lodgingNotes.set("");
    this.initializeDateForms();
    this.openEditorModal("lodging");
  }

  openEditLodging(lodging: TripLodging): void {
    this.selectedLodging.set(lodging);
    this.lodgingName.set(lodging.name);
    this.lodgingAddress.set(lodging.address || "");
    this.lodgingCoordinates.set(formatCoordinatePair(lodging.latitude, lodging.longitude));
    this.lodgingNotes.set(lodging.notes || "");
    this.checkInDate.set(lodging.checkInDate);
    this.checkOutDate.set(lodging.checkOutDate);
    this.openEditorModal("lodging");
  }

  async saveLodging(): Promise<void> {
    if (this.savingPanel()) return;
    const coordinates = parseCoordinatePair(this.lodgingCoordinates());
    if (!coordinates) {
      this.toast.error("Informe as coordenadas da hospedagem no formato latitude, longitude.");
      return;
    }
    const selected = this.selectedLodging();
    const payload = {
      name: this.lodgingName(),
      address: this.lodgingAddress(),
      notes: this.lodgingNotes(),
      checkInDate: this.checkInDate(),
      checkOutDate: this.checkOutDate(),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    };
    this.savingPanel.set(true);
    try {
      const snapshot = selected
        ? await firstValueFrom(this.trips.updateLodging(this.roomId(), selected.id, {
            ...payload,
            version: selected.version
          }))
        : await firstValueFrom(this.trips.createLodging(this.roomId(), payload));
      this.store.setSnapshot(snapshot);
      this.closePanel();
      this.selectedLodging.set(null);
      this.toast.success(selected ? "Hospedagem atualizada." : "Hospedagem adicionada à viagem.");
    } catch (error) {
      const code = error instanceof HttpErrorResponse ? error.error?.error : null;
      this.toast.error(code === "lodging_date_conflict"
        ? "As datas podem encostar no check-out, mas não podem compartilhar noites com outra hospedagem."
        : "Confira o nome e as datas da hospedagem.");
    } finally {
      this.savingPanel.set(false);
    }
  }

  async deleteLodging(lodging: TripLodging): Promise<void> {
    this.deletingLodgingId.set(lodging.id);
    try {
      await firstValueFrom(this.trips.deleteLodging(this.roomId(), lodging.id));
      await this.reload();
      this.toast.success("Hospedagem removida.");
    } catch {
      this.toast.error("Não foi possível remover a hospedagem.");
    } finally {
      this.deletingLodgingId.set(null);
    }
  }

  async copyInviteUrl(): Promise<void> {
    const path = this.router.serializeUrl(this.router.createUrlTree(["/tools/trips", this.roomId()]));
    const inviteUrl = `${window.location.origin}${path}`;

    try {
      await this.clipboard.copyText(inviteUrl);
      this.toast.success("Link de convite copiado.");
    } catch {
      this.toast.error("Não foi possível copiar o link da sala.");
    }
  }

  async copyPublicTripUrl(): Promise<void> {
    if (this.sharingPublicLink()) return;
    this.sharingPublicLink.set(true);

    try {
      const { publicShareToken } = await firstValueFrom(this.trips.ensurePublicShareToken(this.roomId()));
      const path = this.router.serializeUrl(this.router.createUrlTree(["/trips/public", publicShareToken]));
      await this.clipboard.copyText(`${window.location.origin}${path}`);
      this.toast.success("Link público da viagem copiado.");
    } catch {
      this.toast.error("Não foi possível copiar o link público da viagem.");
    } finally {
      this.sharingPublicLink.set(false);
    }
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

  observationTextSegments(text: string): ObservationTextSegment[] {
    return linkifyObservationText(text);
  }

  private openGoogleMapsOnMobile(mapUrl: string): void {
    if (!this.shouldOfferGoogleMapsOpen()) return;
    window.setTimeout(() => {
      window.location.href = mapUrl;
    }, 250);
  }

  private shouldOfferGoogleMapsOpen(): boolean {
    return window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 768px)").matches;
  }

  async openDeleteRoomModal(): Promise<void> {
    const room = this.store.room();
    if (!room || this.store.snapshot()?.currentMemberRole !== "owner") return;

    this.modal.open<DeleteTripRoomModalComponent, DeleteTripRoomModalData, boolean>(
      DeleteTripRoomModalComponent,
      {
        data: { roomTitle: room.title },
        ariaLabel: "Confirmar exclusão da viagem",
        closeOnBackdrop: false,
        onSubmit: () => this.deleteRoom()
      }
    );
  }

  private async deleteRoom(): Promise<void> {
    this.deletingRoom.set(true);
    try {
      await firstValueFrom(this.trips.delete(this.roomId()));
      this.toast.success("Viagem excluída.");
      await this.router.navigateByUrl("/tools/trips");
    } catch (error) {
      this.toast.error("Não foi possível excluir a viagem.");
      throw error;
    } finally {
      this.deletingRoom.set(false);
    }
  }

  categoryLabel(category: TripPlaceCategory): string {
    return PLACE_CATEGORY_VISUALS[category].label;
  }

  categoryVisual(category: TripPlaceCategory) {
    return PLACE_CATEGORY_VISUALS[category];
  }

  transportLabel(mode: TripTransportMode | null): string {
    return { walk: "Caminhada", car: "Carro", transit: "Transporte público", other: "Outro" }[mode || "other"];
  }

  openDayMap(day: TripDay): void {
    this.modal.open<TripDayMapModalComponent, TripDayMapModalData, void>(
      TripDayMapModalComponent,
      {
        data: {
          dayNumber: this.dayNumber(day),
          date: day.date,
          points: this.mapPointsForDay(day)
        },
        ariaLabel: `Mapa do dia ${this.dayNumber(day)}`,
        panelClass: "sm:!w-[min(calc(100vw-2rem),76rem)]"
      }
    );
  }

  openGeneralMap(): void {
    this.modal.open<TripGeneralMapModalComponent, TripGeneralMapModalData, void>(
      TripGeneralMapModalComponent,
      {
        data: {
          points: this.generalMapPoints,
          days: this.store.days(),
          allocate: (allocation) => this.allocateGeneralMapPlaces(allocation)
        },
        ariaLabel: "Mapa geral da viagem",
        panelClass: "sm:!w-[min(calc(100vw-2rem),82rem)]"
      }
    );
  }

  private async allocateGeneralMapPlaces(allocation: TripGeneralMapAllocation): Promise<void> {
    const pendingPlaces = new Map(this.unscheduledPlaces().map((place) => [place.id, place]));
    const places = allocation.dayId
      ? allocation.placeIds
        .map((placeId) => pendingPlaces.get(placeId))
        .filter((place): place is TripPlace => !!place)
      : [];
    const scheduledItems = new Map((this.store.snapshot()?.items || []).map((item) => [item.id, item]));
    const itemsToMove = (allocation.itemIds || [])
      .map((itemId) => scheduledItems.get(itemId))
      .filter((item): item is TripDayItem => !!item && !!allocation.dayId && item.dayId !== allocation.dayId);
    const itemsToRemove = (allocation.removeItemIds || [])
      .map((itemId) => scheduledItems.get(itemId))
      .filter((item): item is TripDayItem => !!item);
    if (places.length === 0 && itemsToMove.length === 0 && itemsToRemove.length === 0) return;

    let successCount = 0;
    let failureCount = 0;
    this.store.beginSnapshotBatch();
    try {
      for (const place of places) {
        if (await this.store.addItem(allocation.dayId!, place.id)) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      }

      for (const item of itemsToMove) {
        if (await this.store.moveItemWithRest(item, allocation.dayId!)) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      }

      for (const item of itemsToRemove) {
        if (await this.store.removeItem(item.id)) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      }
      if (itemsToRemove.length > 0 && successCount > 0) {
        await this.reload();
      }
    } finally {
      this.store.endSnapshotBatch();
    }

    if (failureCount === 0) {
      if (itemsToRemove.length > 0 && places.length === 0 && itemsToMove.length === 0) {
        this.toast.success(successCount === 1 ? "Lugar removido do roteiro." : "Lugares removidos do roteiro.");
        return;
      }
      if (itemsToMove.length > 0 && places.length === 0) {
        this.toast.success(successCount === 1 ? "Lugar movido para o dia." : "Lugares movidos para o dia.");
        return;
      }
      this.toast.success(successCount === 1 ? "Lugar alocado no dia." : "Lugares alocados no dia.");
      return;
    }
    if (successCount > 0) {
      this.toast.error("Alguns lugares não foram atualizados.");
      return;
    }
    this.toast.error("Não foi possível atualizar os lugares.");
  }

  mapAddressCountForDay(day: TripDay): number {
    return this.mapPointsForDay(day).length;
  }

  private mapPointsForDay(day: TripDay): TripDayMapPoint[] {
    const lodging = this.departureLodgingForDay(day);
    const lodgingPoint: TripDayMapPoint[] = lodging && hasValidCoordinates(lodging)
      ? [{
          kind: "lodging",
          id: `lodging-${lodging.id}`,
          name: lodging.name,
          address: lodging.address || "Endereço não informado",
          position: 0,
          latitude: lodging.latitude,
          longitude: lodging.longitude
        }]
      : [];
    const arrival = this.arrivalLodgingForDay(day);
    const arrivalPoint: TripDayMapPoint[] = arrival && hasValidCoordinates(arrival)
      ? [{
          kind: "lodging",
          id: `lodging-${arrival.id}`,
          name: arrival.name,
          address: arrival.address || "Endereço não informado",
          position: this.store.itemsForDay(day.id).length + 1,
          latitude: arrival.latitude,
          longitude: arrival.longitude
        }]
      : [];
    const placePoints = this.store.itemsForDay(day.id)
      .map((item, index): TripDayMapPoint | null => {
        const place = this.placeById(item.placeId);
        if (
          !place
          || !hasValidCoordinates(place)
        ) return null;
        return {
          kind: "place" as const,
          id: item.id,
          name: place.name,
          address: place.address || "Endereço não informado",
          category: place.category,
          position: index + 1,
          latitude: place.latitude,
          longitude: place.longitude
        };
      })
      .filter((point): point is TripDayMapPoint => point !== null);
    return [...lodgingPoint, ...placePoints, ...arrivalPoint];
  }

  private orderItemsFrom(start: CoordinatePair, items: TripDayItem[], mode: TripDayOrderMode): TripDayItem[] {
    switch (mode) {
      case "far-first":
        return this.orderItemsByDistanceFrom(start, items, "desc");
      case "distance-curve":
        return this.orderItemsByDistanceCurveFrom(start, items);
      default:
        return this.orderItemsByProximityFrom(start, items);
    }
  }

  private orderItemsByProximityFrom(start: CoordinatePair, items: TripDayItem[]): TripDayItem[] {
    const remaining = [...items];
    const ordered: TripDayItem[] = [];
    let current = start;

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const place = this.placeById(remaining[index].placeId);
        if (!place || !hasValidCoordinates(place)) continue;
        const distance = haversineDistanceInMeters(current, {
          latitude: place.latitude,
          longitude: place.longitude
        });
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }

      const [nextItem] = remaining.splice(nearestIndex, 1);
      const nextPlace = this.placeById(nextItem.placeId);
      if (nextPlace && hasValidCoordinates(nextPlace)) {
        current = { latitude: nextPlace.latitude, longitude: nextPlace.longitude };
      }
      ordered.push(nextItem);
    }

    return ordered;
  }

  private orderItemsByDistanceFrom(start: CoordinatePair, items: TripDayItem[], direction: "asc" | "desc"): TripDayItem[] {
    return items
      .map((item, index) => ({
        item,
        index,
        distance: this.distanceFrom(start, item)
      }))
      .sort((a, b) => {
        const distanceComparison = direction === "asc"
          ? a.distance - b.distance
          : b.distance - a.distance;
        return distanceComparison || a.item.position - b.item.position || a.index - b.index;
      })
      .map(({ item }) => item);
  }

  private orderItemsByDistanceCurveFrom(start: CoordinatePair, items: TripDayItem[]): TripDayItem[] {
    const rankedItems = this.orderItemsByDistanceFrom(start, items, "asc");
    const orderedItems = new Array<TripDayItem>(rankedItems.length);
    let leftIndex = 0;
    let rightIndex = rankedItems.length - 1;

    for (let index = 0; index < rankedItems.length; index += 1) {
      if (index % 2 === 0) {
        orderedItems[leftIndex] = rankedItems[index];
        leftIndex += 1;
      } else {
        orderedItems[rightIndex] = rankedItems[index];
        rightIndex -= 1;
      }
    }

    return orderedItems;
  }

  private distanceFrom(start: CoordinatePair, item: TripDayItem): number {
    const place = this.placeById(item.placeId);
    if (!place || !hasValidCoordinates(place)) return Number.POSITIVE_INFINITY;
    return haversineDistanceInMeters(start, {
      latitude: place.latitude,
      longitude: place.longitude
    });
  }

  private async reload(): Promise<void> {
    await this.store.load(this.roomId());
  }

  private openEditorModal(panel: "place" | "route" | "lodging"): void {
    const template = this.editorModal;
    if (!template) return;

    this.editorModalRef?.close();
    this.panel.set(panel);

    const ref = this.modal.open<TripEditorModalComponent, TripEditorModalData, void>(
      TripEditorModalComponent,
      {
        data: { template },
        ariaLabel: this.editorAriaLabel(panel),
        panelClass: ""
      }
    );

    this.editorModalRef = ref;
    ref.afterClosed().subscribe(() => {
      if (this.editorModalRef !== ref) return;

      this.editorModalRef = null;
      this.panel.set(null);

      if (panel === "place") {
        this.selectedItemId.set(null);
        this.selectedPlace.set(null);
        this.store.selectItem(null);
      } else if (panel === "route") {
        this.selectedRouteFromItemId.set(null);
        this.selectedRouteFromLodgingId.set(null);
        this.selectedRouteToItemId.set(null);
        this.selectedRouteToLodgingId.set(null);
      } else {
        this.selectedLodging.set(null);
      }
    });
  }

  private editorAriaLabel(panel: "place" | "route" | "lodging"): string {
    return {
      place: this.selectedPlace() ? "Editar lugar" : "Adicionar lugar",
      route: this.selectedRoute() ? "Editar trajeto" : "Definir trajeto",
      lodging: this.selectedLodging() ? "Editar hospedagem" : "Adicionar hospedagem"
    }[panel];
  }

  private initializeDateForms(): void {
    const room = this.store.room();
    if (!room) return;
    const dates = suggestedLodgingDates(room, this.store.lodgings());
    this.checkInDate.set(dates.checkInDate);
    this.checkOutDate.set(dates.checkOutDate);
  }

  formatDateTimeForSummary(value: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

}
