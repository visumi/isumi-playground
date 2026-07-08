import { NgClass } from "@angular/common";
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from "@angular/core";
import type * as Leaflet from "leaflet";
import { TripPlaceCategory } from "../../core/api/api.types";

export type TripMapPointStatus = "scheduled" | "unscheduled" | "lodging";

export interface TripMapPoint {
  kind: "place" | "lodging";
  id: string;
  placeId?: string;
  name: string;
  address: string;
  category?: TripPlaceCategory;
  position?: number;
  dayId?: string;
  dayNumber?: number;
  status?: TripMapPointStatus;
  markerClass?: string;
  markerLabel?: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
}

export type TripDayMapPoint = TripMapPoint;

const CATEGORY_MARKER_CLASSES: Record<TripPlaceCategory, string> = {
  food: "trip-map-marker--food",
  culture: "trip-map-marker--culture",
  nightlife: "trip-map-marker--nightlife",
  nature: "trip-map-marker--nature",
  shopping: "trip-map-marker--shopping",
  other: "trip-map-marker--other"
};

const LODGING_MARKER_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
    <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
    <path d="M12 4v6" />
    <path d="M2 18h20" />
  </svg>
`;

const CATEGORY_MARKER_ICONS: Record<TripPlaceCategory, string> = {
  food: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z" />
      <path d="M21 15v7" />
    </svg>
  `,
  culture: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="3" x2="21" y1="22" y2="22" />
      <line x1="6" x2="6" y1="18" y2="11" />
      <line x1="10" x2="10" y1="18" y2="11" />
      <line x1="14" x2="14" y1="18" y2="11" />
      <line x1="18" x2="18" y1="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  `,
  nightlife: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 7.5 9 9 0 1 1-9-7.5Z" />
      <path d="M19 3v4" />
      <path d="M21 5h-4" />
    </svg>
  `,
  nature: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.83V10a3 3 0 0 1 6 0Z" />
      <path d="M7 16v6" />
      <path d="M13 19v3" />
      <path d="M12 19h8.3a3.7 3.7 0 0 0 1.7-7 5 5 0 0 0-9.7-1.5" />
    </svg>
  `,
  shopping: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  `,
  other: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 10c0 4.99-5.5 10.74-7.35 12.48a1 1 0 0 1-1.3 0C9.5 20.74 4 14.99 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  `
};

type LeafletImport = typeof Leaflet | { default: typeof Leaflet };

@Component({
  selector: "isumi-trip-day-map",
  standalone: true,
  imports: [NgClass],
  host: {
    class: "block h-full"
  },
  template: `
      <div
        class="relative h-full overflow-hidden bg-background"
      [ngClass]="compact ? 'min-h-0 rounded-md' : 'min-h-[14rem] rounded-lg sm:min-h-[20rem]'">
      <div
        #mapContainer
        class="h-full w-full"
        [ngClass]="compact ? 'min-h-0' : 'min-h-[14rem] sm:min-h-[20rem]'"
        aria-label="Mapa dos lugares do dia"></div>
      @if (points.length === 0) {
      <div class="absolute inset-0 grid place-items-center bg-background/90 px-5 text-center">
        <div>
          <strong class="block text-sm">Nenhum ponto localizado</strong>
          <p class="m-0 mt-1 max-w-[34ch] text-xs leading-5 text-muted-foreground">
            Salve coordenadas na hospedagem ou nos lugares deste dia para exibir pins no mapa.
          </p>
        </div>
      </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripDayMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) points: TripMapPoint[] = [];
  @Input() highlightedPlaceIds: string[] = [];
  @Input() compact = false;
  @Input() interactive = true;
  @Output() placeSelected = new EventEmitter<string>();
  @Output() pointSelected = new EventEmitter<TripMapPoint>();
  @ViewChild("mapContainer") private mapContainer?: ElementRef<HTMLElement>;

  private leaflet: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private markerLayer: Leaflet.LayerGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private refreshTimers: number[] = [];
  private readonly markerElementsByPlaceId = new Map<string, HTMLElement[]>();
  private lastBoundsSignature: string | null = null;

  async ngAfterViewInit(): Promise<void> {
    this.leaflet = resolveLeafletModule(await import("leaflet"));
    const container = this.mapContainer!.nativeElement;
    this.map = this.leaflet.map(container, {
      zoomControl: !this.compact,
      attributionControl: !this.compact,
      dragging: this.interactive,
      scrollWheelZoom: this.interactive,
      doubleClickZoom: this.interactive,
      boxZoom: this.interactive,
      keyboard: this.interactive,
      touchZoom: this.interactive
    });
    this.leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19
    }).addTo(this.map);
    this.markerLayer = this.leaflet.layerGroup().addTo(this.map);
    this.renderPoints();
    this.resizeObserver = new ResizeObserver(() => this.scheduleMapRefresh());
    this.resizeObserver.observe(container);
    this.scheduleMapRefresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["points"]) {
      this.renderPoints();
      this.scheduleMapRefresh();
      return;
    }
    if (changes["highlightedPlaceIds"]) {
      this.updateMarkerHighlights();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.refreshTimers.forEach((timer) => window.clearTimeout(timer));
    this.refreshTimers = [];
    this.map?.remove();
    this.map = null;
    this.markerLayer = null;
  }

  private renderPoints(): void {
    if (!this.leaflet || !this.map || !this.markerLayer) return;

    this.markerLayer.clearLayers();
    this.markerElementsByPlaceId.clear();
    const coordinates: Leaflet.LatLngExpression[] = [];
    const coordinateKeys: string[] = [];

    for (const point of this.points) {
      const position: Leaflet.LatLngExpression = [point.latitude, point.longitude];
      coordinates.push(position);
      coordinateKeys.push(`${point.latitude}:${point.longitude}`);
      const markerClass = point.kind === "lodging"
        ? "trip-map-marker--lodging"
        : point.markerClass || CATEGORY_MARKER_CLASSES[point.category || "other"];
      const markerClasses = ["trip-map-marker", markerClass];
      if (this.compact) {
        markerClasses.push("trip-map-marker--compact");
      }
      if (point.placeId && this.highlightedPlaceIds.includes(point.placeId)) {
        markerClasses.push("trip-map-marker--selected");
      }
      const markerContent = this.compact ? "" : this.markerContent(point);
      const markerSubtitle = point.subtitle
        || (point.kind === "lodging" ? "Hospedagem" : `Parada ${point.position || ""}`.trim());
      const iconSize: Leaflet.PointTuple = this.compact
        ? [18, 18]
        : point.kind === "lodging" ? [36, 36] : [32, 32];
      const iconAnchor: Leaflet.PointTuple = this.compact
        ? [9, 18]
        : point.kind === "lodging" ? [18, 36] : [16, 32];
      const popupAnchor: Leaflet.PointTuple = [0, this.compact ? -16 : point.kind === "lodging" ? -34 : -30];
      const marker = this.leaflet.marker(position, {
        icon: this.leaflet.divIcon({
          className: "",
          html: `<span class="${markerClasses.join(" ")}">${markerContent}</span>`,
          iconSize,
          iconAnchor,
          popupAnchor
        })
      });
      if (this.interactive) {
        const popup = this.leaflet.popup({
          autoPan: false,
          closeButton: false,
          offset: popupAnchor
        }).setContent(this.popupContent(point, markerSubtitle));
        marker
          .on("mouseover", () => popup.setLatLng(marker.getLatLng()).openOn(this.map!))
          .on("mouseout", () => this.map?.closePopup(popup));
        if (point.kind === "place" && point.placeId) {
          marker.on("click", () => {
            this.placeSelected.emit(point.placeId);
            this.pointSelected.emit(point);
          });
        }
      }
      marker.addTo(this.markerLayer);
      const markerElement = marker.getElement()?.querySelector<HTMLElement>(".trip-map-marker");
      if (point.placeId && markerElement) {
        const elements = this.markerElementsByPlaceId.get(point.placeId) || [];
        elements.push(markerElement);
        this.markerElementsByPlaceId.set(point.placeId, elements);
      }
    }

    const boundsSignature = coordinateKeys.sort().join("|");
    if (boundsSignature === this.lastBoundsSignature) return;
    this.lastBoundsSignature = boundsSignature;

    if (coordinates.length === 0) {
      this.map.setView([-14.235, -51.9253], 4);
    } else if (coordinates.length === 1) {
      this.map.setView(coordinates[0], 15);
    } else {
      const padding: Leaflet.PointTuple = this.compact ? [18, 18] : [28, 28];
      this.map.fitBounds(this.leaflet.latLngBounds(coordinates), { padding, maxZoom: this.compact ? 14 : 15 });
    }
  }

  private scheduleMapRefresh(): void {
    if (!this.map || !this.leaflet) return;

    const refresh = () => {
      if (!this.map) return;
      this.map.invalidateSize({ pan: false });
      this.renderPoints();
    };

    requestAnimationFrame(() => requestAnimationFrame(refresh));
    for (const delay of [80, 220, 420]) {
      this.refreshTimers.push(window.setTimeout(refresh, delay));
    }
  }

  private markerLabel(point: TripMapPoint): string {
    return point.markerLabel || String(point.dayNumber || point.position || "");
  }

  private markerContent(point: TripMapPoint): string {
    if (point.kind === "lodging") return LODGING_MARKER_ICON;
    if (point.status === "unscheduled") return CATEGORY_MARKER_ICONS[point.category || "other"];
    return `<span>${this.markerLabel(point)}</span>`;
  }

  private popupContent(point: TripMapPoint, subtitle: string): string {
    return `<strong>${escapeHtml(point.name)}</strong><br><span>${escapeHtml(subtitle)}</span><br><span>${escapeHtml(point.address)}</span>`;
  }

  private updateMarkerHighlights(): void {
    const highlightedPlaceIds = new Set(this.highlightedPlaceIds);
    for (const [placeId, elements] of this.markerElementsByPlaceId) {
      for (const element of elements) {
        element.classList.toggle("trip-map-marker--selected", highlightedPlaceIds.has(placeId));
      }
    }
  }
}

function resolveLeafletModule(leaflet: LeafletImport): typeof Leaflet {
  return "default" in leaflet && typeof leaflet.default.map === "function" ? leaflet.default : leaflet as typeof Leaflet;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
