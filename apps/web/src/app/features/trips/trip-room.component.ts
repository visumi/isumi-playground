import { DatePipe, NgClass, NgComponentOutlet, NgTemplateOutlet } from "@angular/common";
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
  LucideChevronLeft,
  LucideChevronRight,
  LucideClock3,
  LucideFiles,
  LucideFootprints,
  LucideGripVertical,
  LucideLandmark,
  LucideLink,
  LucideList,
  LucideMap,
  LucideMapPin,
  LucideMapPinned,
  LucideMoonStar,
  LucideMoveRight,
  LucidePencil,
  LucidePlane,
  LucidePlaneLanding,
  LucidePlaneTakeoff,
  LucidePin,
  LucidePlus,
  LucideRoute,
  LucideSave,
  LucideShoppingBag,
  LucideShuffle,
  LucideTicket,
  LucideTicketsPlane,
  LucideTrash2,
  LucideTrees,
  LucideUtensils,
  LucideUsers,
  LucideWifiOff,
  LucideX
} from "@lucide/angular";
import { firstValueFrom } from "rxjs";
import {
  CreateTripFlightRequest,
  TripDay,
  TripDayItem,
  TripFlightSegment,
  TripLodging,
  TripPlace,
  TripPlaceCategory,
  TripRoute,
  TripTransportMode
} from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";
import {
  IsumiAvatarComponent,
  IsumiBreadcrumbComponent,
  IsumiButtonComponent,
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
import { TripDayMapModalComponent, TripDayMapModalData } from "./trip-day-map-modal.component";
import { TripDayMapPoint } from "./trip-day-map.component";
import { TripRoomStore } from "./trip-room.store";

type TrayDragData = { kind: "place"; place: TripPlace };
type ItemDragData = { kind: "item"; item: TripDayItem };
export interface ObservationTextSegment {
  text: string;
  href?: string;
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

function dateOnlyValue(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
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

interface DeleteTripFlightModalData {
  route: string;
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
            Isto remove "{{ data?.roomTitle || "esta viagem" }}", incluindo roteiro, lugares, voos e hospedagens. Esta ação não pode ser desfeita.
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
  selector: "isumi-delete-trip-flight-modal",
  standalone: true,
  imports: [IsumiButtonComponent, LucideTrash2, LucideX],
  template: `
    <div class="grid gap-5">
      <header class="flex items-start justify-between gap-4">
        <div>
          <div class="mb-3 grid size-10 place-items-center rounded-sm bg-destructive/15 text-destructive">
            <svg lucideTrash2 class="size-5" aria-hidden="true"></svg>
          </div>
          <h2 class="m-0 text-[1.2rem] font-black">Excluir voo</h2>
          <p class="m-0 mt-2 max-w-[52ch] text-sm leading-6 text-muted-foreground">
            O trecho {{ data?.route || "selecionado" }} será removido do planejamento. Esta ação não pode ser desfeita.
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
          Excluir voo
        </isumi-button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeleteTripFlightModalComponent {
  readonly data = injectIsumiModalData<DeleteTripFlightModalData>();
  readonly modalRef = injectIsumiModalRef<DeleteTripFlightModalData, boolean>();
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
    DatePipe,
    NgClass,
    NgComponentOutlet,
    FormsModule,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDragPreview,
    CdkDropList,
    CdkDropListGroup,
    IsumiAvatarComponent,
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
    LucideChevronLeft,
    LucideChevronRight,
    LucideClock3,
    LucideFiles,
    LucideFootprints,
    LucideGripVertical,
    LucideLink,
    LucideList,
    LucideMap,
    LucideMapPin,
    LucideMapPinned,
    LucideMoveRight,
    LucidePencil,
    LucidePlane,
    LucidePlaneLanding,
    LucidePlaneTakeoff,
    LucidePin,
    LucidePlus,
    LucideRoute,
    LucideSave,
    LucideShuffle,
    LucideTicket,
    LucideTrash2,
    LucideUsers,
    LucideWifiOff,
    LucideTicketsPlane,
    LucideX
  ],
  providers: [TripRoomStore],
  templateUrl: "./trip-room.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripRoomComponent implements OnInit, OnDestroy {
  private readonly trips = inject(TripsService);
  readonly router = inject(Router);
  private readonly toast = inject(IsumiToastService);
  private readonly modal = inject(IsumiModalService);
  readonly store = inject(TripRoomStore);
  readonly roomId = input.required<string>();
  readonly loading = signal(true);
  readonly deletingRoom = signal(false);
  readonly deletingFlightId = signal<string | null>(null);
  readonly deletingPlaceId = signal<string | null>(null);
  readonly deletingLodgingId = signal<string | null>(null);
  readonly savingPanel = signal(false);
  readonly focusedDayId = signal<string | null>(null);
  readonly dayAnimating = signal(false);
  readonly placeTab = signal<"unscheduled" | "scheduled">("unscheduled");
  readonly panel = signal<"place" | "route" | "flight" | "lodging" | null>(null);
  readonly selectedPlace = signal<TripPlace | null>(null);
  readonly selectedFlight = signal<TripFlightSegment | null>(null);
  readonly selectedLodging = signal<TripLodging | null>(null);
  readonly selectedItemId = signal<string | null>(null);
  readonly selectedRouteFromItemId = signal<string | null>(null);
  readonly selectedRouteFromLodgingId = signal<string | null>(null);
  readonly selectedRouteToItemId = signal<string | null>(null);
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
  readonly breadcrumbItems = computed(() => [
    { label: "Salas", link: "/tools/trips" },
    { label: "Sala" }
  ]);

  readonly placeName = signal("");
  readonly placeCategory = signal<TripPlaceCategory>("other");
  readonly placeAddress = signal("");
  readonly placeNotes = signal("");
  readonly flightDirection = signal<CreateTripFlightRequest["direction"]>("outbound");
  readonly departureAirport = signal("");
  readonly arrivalAirport = signal("");
  readonly departureAt = signal("");
  readonly arrivalAt = signal("");
  readonly airline = signal("");
  readonly flightNumber = signal("");
  readonly lodgingName = signal("");
  readonly lodgingAddress = signal("");
  readonly lodgingNotes = signal("");
  readonly checkInDate = signal("");
  readonly checkOutDate = signal("");

  readonly routeTransportMode = signal<TripTransportMode | "">("");
  readonly routeDurationMinutes = signal<number | null>(null);
  readonly routeNotes = signal("");
  readonly selectedRoute = computed(() => {
    const toItemId = this.selectedRouteToItemId();
    const fromLodgingId = this.selectedRouteFromLodgingId();
    return fromLodgingId
      ? this.routeFromLodging(fromLodgingId, toItemId)
      : this.routeBetween(this.selectedRouteFromItemId(), toItemId);
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

  lodgingForDay(day: TripDay): TripLodging | null {
    return this.store.lodgings().find((lodging) =>
      lodging.checkInDate <= day.date && lodging.checkOutDate >= day.date
    ) || null;
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
      await firstValueFrom(this.trips.deleteItem(this.roomId(), data.item.id));
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

  async addPlaceToDay(place: TripPlace, dayId: string): Promise<void> {
    try {
      const snapshot = await firstValueFrom(this.trips.createItem(this.roomId(), {
        dayId,
        placeId: place.id
      }));
      this.store.setSnapshot(snapshot);
      this.focusDay(dayId);
      this.showDropFeedback(dayId);
    } catch {
      this.toast.error("Não foi possível adicionar o lugar ao dia.");
    }
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
      await panel.animate(
        [
          { opacity: 1, transform: "translateX(0) scale(1)", filter: "blur(0)" },
          { opacity: 0, transform: `translateX(${-18 * direction}px) scale(0.99)`, filter: "blur(1.5px)" }
        ],
        { duration: 120, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
      ).finished;

      this.focusedDayId.set(targetDay.id);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      await panel.animate(
        [
          { opacity: 0, transform: `translateX(${26 * direction}px) scale(0.99)`, filter: "blur(1.5px)" },
          { opacity: 1, transform: "translateX(0) scale(1)", filter: "blur(0)" }
        ],
        { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }
      ).finished;
    } finally {
      panel.getAnimations().forEach((animation) => animation.cancel());
      this.dayAnimating.set(false);
    }
  }

  openCreatePlace(): void {
    this.selectedPlace.set(null);
    this.placeName.set("");
    this.placeCategory.set("other");
    this.placeAddress.set("");
    this.placeNotes.set("");
    this.openEditorModal("place");
  }

  openEditPlace(place: TripPlace, item?: TripDayItem): void {
    this.selectedPlace.set(place);
    this.placeName.set(place.name);
    this.placeCategory.set(place.category);
    this.placeAddress.set(place.address || "");
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
    const selected = this.selectedPlace();
    const payload = {
      name: this.placeName().trim(),
      category: this.placeCategory(),
      address: this.placeAddress(),
      notes: this.placeNotes()
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
    return this.store.routes().find((route) =>
      route.fromLodgingId === fromLodgingId && route.toItemId === toItemId
    ) || null;
  }

  openRoute(fromItem: TripDayItem, toItem: TripDayItem): void {
    const route = this.routeBetween(fromItem.id, toItem.id);
    this.selectedRouteFromItemId.set(fromItem.id);
    this.selectedRouteFromLodgingId.set(null);
    this.selectedRouteToItemId.set(toItem.id);
    this.routeTransportMode.set(route?.transportMode || "");
    this.routeDurationMinutes.set(route?.durationMinutes || null);
    this.routeNotes.set(route?.notes || "");
    this.openEditorModal("route");
  }

  openLodgingRoute(lodging: TripLodging, toItem: TripDayItem): void {
    const route = this.routeFromLodging(lodging.id, toItem.id);
    this.selectedRouteFromItemId.set(null);
    this.selectedRouteFromLodgingId.set(lodging.id);
    this.selectedRouteToItemId.set(toItem.id);
    this.routeTransportMode.set(route?.transportMode || "");
    this.routeDurationMinutes.set(route?.durationMinutes || null);
    this.routeNotes.set(route?.notes || "");
    this.openEditorModal("route");
  }

  async saveRoute(): Promise<void> {
    const fromItemId = this.selectedRouteFromItemId();
    const fromLodgingId = this.selectedRouteFromLodgingId();
    const toItemId = this.selectedRouteToItemId();
    const transportMode = this.routeTransportMode();
    const durationMinutes = Number(this.routeDurationMinutes());
    if ((!fromItemId && !fromLodgingId) || !toItemId || !transportMode || !durationMinutes || this.savingPanel()) return;
    const selected = this.selectedRoute();
    const payload = {
      ...(fromItemId ? { fromItemId } : { fromLodgingId: fromLodgingId! }),
      toItemId,
      transportMode,
      durationMinutes,
      notes: this.routeNotes()
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

  async clearRoute(): Promise<void> {
    const route = this.selectedRoute();
    if (!route || this.savingPanel()) return;
    this.savingPanel.set(true);
    try {
      await firstValueFrom(this.trips.deleteRoute(this.roomId(), route.id));
      await this.reload();
      this.closeRouteEditor();
      this.toast.success("Trajeto limpo.");
    } catch {
      this.toast.error("Não foi possível limpar o trajeto.");
    } finally {
      this.savingPanel.set(false);
    }
  }

  closeRouteEditor(): void {
    this.selectedRouteFromItemId.set(null);
    this.selectedRouteFromLodgingId.set(null);
    this.selectedRouteToItemId.set(null);
    this.closePanel();
  }

  openCreateFlight(): void {
    this.selectedFlight.set(null);
    this.flightDirection.set("outbound");
    this.departureAirport.set("");
    this.arrivalAirport.set("");
    this.departureAt.set("");
    this.arrivalAt.set("");
    this.airline.set("");
    this.flightNumber.set("");
    this.openEditorModal("flight");
  }

  openEditFlight(flight: TripFlightSegment): void {
    this.selectedFlight.set(flight);
    this.flightDirection.set(flight.direction);
    this.departureAirport.set(flight.departureAirport);
    this.arrivalAirport.set(flight.arrivalAirport);
    this.departureAt.set(flight.departureAt.slice(0, 16));
    this.arrivalAt.set(flight.arrivalAt.slice(0, 16));
    this.airline.set(flight.airline || "");
    this.flightNumber.set(flight.flightNumber || "");
    this.openEditorModal("flight");
  }

  async saveFlight(): Promise<void> {
    if (this.savingPanel()) return;
    const selectedFlight = this.selectedFlight();
    const payload: CreateTripFlightRequest = {
      direction: this.flightDirection(),
      departureAirport: this.departureAirport().toUpperCase(),
      arrivalAirport: this.arrivalAirport().toUpperCase(),
      departureAt: this.departureAt(),
      arrivalAt: this.arrivalAt(),
      airline: this.airline(),
      flightNumber: this.flightNumber()
    };

    this.savingPanel.set(true);
    try {
      const snapshot = selectedFlight
        ? await firstValueFrom(this.trips.updateFlight(this.roomId(), selectedFlight.id, {
            ...payload,
            version: selectedFlight.version
          }))
        : await firstValueFrom(this.trips.createFlight(this.roomId(), payload));
      this.store.setSnapshot(snapshot);
      this.closePanel();
      this.selectedFlight.set(null);
      this.toast.success(selectedFlight ? "Voo atualizado." : "Voo adicionado ao planejamento.");
    } catch {
      this.toast.error(selectedFlight
        ? "Não foi possível atualizar o voo. Confira os dados e tente novamente."
        : "Confira os dados do voo.");
    } finally {
      this.savingPanel.set(false);
    }
  }

  async openDeleteFlightModal(flight: TripFlightSegment): Promise<void> {
    this.modal.open<DeleteTripFlightModalComponent, DeleteTripFlightModalData, boolean>(
      DeleteTripFlightModalComponent,
      {
        data: { route: `${flight.departureAirport} → ${flight.arrivalAirport}` },
        ariaLabel: "Confirmar exclusão do voo",
        closeOnBackdrop: false,
        onSubmit: async () => {
          this.deletingFlightId.set(flight.id);
          try {
            await firstValueFrom(this.trips.deleteFlight(this.roomId(), flight.id));
            await this.reload();
            this.toast.success("Voo removido do planejamento.");
          } catch (error) {
            this.toast.error("Não foi possível excluir o voo.");
            throw error;
          } finally {
            this.deletingFlightId.set(null);
          }
        }
      }
    );
  }

  flightDuration(flight: TripFlightSegment): string {
    const durationMinutes = Math.max(
      0,
      Math.round((new Date(flight.arrivalAt).getTime() - new Date(flight.departureAt).getTime()) / 60_000)
    );
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return hours ? `${hours}h${minutes ? ` ${minutes}min` : ""}` : `${minutes}min`;
  }

  openCreateLodging(): void {
    this.selectedLodging.set(null);
    this.lodgingName.set("");
    this.lodgingAddress.set("");
    this.lodgingNotes.set("");
    this.initializeDateForms();
    this.openEditorModal("lodging");
  }

  openCreateLodgingForDay(day: TripDay): void {
    const nextDate = new Date(`${day.date}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    this.selectedLodging.set(null);
    this.lodgingName.set("");
    this.lodgingAddress.set("");
    this.lodgingNotes.set("");
    this.checkInDate.set(day.date);
    this.checkOutDate.set(nextDate.toISOString().slice(0, 10));
    this.openEditorModal("lodging");
  }

  openEditLodging(lodging: TripLodging): void {
    this.selectedLodging.set(lodging);
    this.lodgingName.set(lodging.name);
    this.lodgingAddress.set(lodging.address || "");
    this.lodgingNotes.set(lodging.notes || "");
    this.checkInDate.set(lodging.checkInDate);
    this.checkOutDate.set(lodging.checkOutDate);
    this.openEditorModal("lodging");
  }

  async saveLodging(): Promise<void> {
    if (this.savingPanel()) return;
    const selected = this.selectedLodging();
    const payload = {
      name: this.lodgingName(),
      address: this.lodgingAddress(),
      notes: this.lodgingNotes(),
      checkInDate: this.checkInDate(),
      checkOutDate: this.checkOutDate()
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
        ? "Este período se sobrepõe a outra hospedagem da viagem."
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
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) this.copyWithTextarea(inviteUrl);
      this.toast.success("Link de convite copiado.");
    } catch {
      this.toast.error("Não foi possível copiar o link da sala.");
    }
  }

  async copyPlaceAddress(address: string): Promise<void> {
    const normalizedAddress = address.trim();
    if (!normalizedAddress) return;

    const mapUrl = this.googleMapsUrl(normalizedAddress);

    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(mapUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) this.copyWithTextarea(mapUrl);
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

  private copyWithTextarea(value: string): void {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy command failed");
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
    const placesWithAddress = this.placesWithAddressForDay(day);
    this.modal.open<TripDayMapModalComponent, TripDayMapModalData, void>(
      TripDayMapModalComponent,
      {
        data: {
          roomId: this.roomId(),
          dayNumber: this.dayNumber(day),
          date: day.date,
          points: this.mapPointsForDay(day),
          failedPlaces: this.failedMapPlacesForDay(day),
          pendingCount: placesWithAddress.filter((place) => place.geocodingStatus === "pending").length,
          onSnapshot: (snapshot) => this.store.setSnapshot(snapshot)
        },
        ariaLabel: `Mapa do dia ${this.dayNumber(day)}`,
        panelClass: "sm:!w-[min(calc(100vw-2rem),76rem)]"
      }
    );
  }

  mapAddressCountForDay(day: TripDay): number {
    return this.placesWithAddressForDay(day).length;
  }

  private mapPointsForDay(day: TripDay): TripDayMapPoint[] {
    return this.store.itemsForDay(day.id)
      .map((item, index) => {
        const place = this.placeById(item.placeId);
        if (
          !place?.address
          || place.latitude === null
          || place.longitude === null
          || !Number.isFinite(place.latitude)
          || !Number.isFinite(place.longitude)
        ) return null;
        return {
          id: item.id,
          name: place.name,
          address: place.address,
          category: place.category,
          position: index + 1,
          latitude: place.latitude,
          longitude: place.longitude
        };
      })
      .filter((point): point is TripDayMapPoint => point !== null);
  }

  private placesWithAddressForDay(day: TripDay): TripPlace[] {
    return this.store.itemsForDay(day.id)
      .map((item) => this.placeById(item.placeId))
      .filter((place): place is TripPlace => !!place?.address?.trim());
  }

  private failedMapPlacesForDay(day: TripDay): TripDayMapModalData["failedPlaces"] {
    return this.store.itemsForDay(day.id)
      .map((item, index) => {
        const place = this.placeById(item.placeId);
        if (!place?.address?.trim() || place.geocodingStatus !== "failed") return null;
        return {
          id: place.id,
          name: place.name,
          address: place.address,
          category: place.category,
          position: index + 1,
          version: place.version,
          latitude: place.latitude,
          longitude: place.longitude
        };
      })
      .filter((place): place is TripDayMapModalData["failedPlaces"][number] => place !== null);
  }

  private async reload(): Promise<void> {
    await this.store.load(this.roomId());
  }

  private openEditorModal(panel: "place" | "route" | "flight" | "lodging"): void {
    const template = this.editorModal;
    if (!template) return;

    this.editorModalRef?.close();
    this.panel.set(panel);

    const ref = this.modal.open<TripEditorModalComponent, TripEditorModalData, void>(
      TripEditorModalComponent,
      {
        data: { template },
        ariaLabel: this.editorAriaLabel(panel)
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
      } else if (panel === "flight") {
        this.selectedFlight.set(null);
      } else {
        this.selectedLodging.set(null);
      }
    });
  }

  private editorAriaLabel(panel: "place" | "route" | "flight" | "lodging"): string {
    return {
      place: this.selectedPlace() ? "Editar lugar" : "Adicionar lugar",
      route: this.selectedRoute() ? "Editar trajeto" : "Definir trajeto",
      flight: this.selectedFlight() ? "Editar voo" : "Adicionar voo",
      lodging: this.selectedLodging() ? "Editar hospedagem" : "Adicionar hospedagem"
    }[panel];
  }

  private initializeDateForms(): void {
    const room = this.store.room();
    if (!room) return;
    this.checkInDate.set(room.startDate);
    this.checkOutDate.set(room.endDate);
  }

}
