import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild
} from "@angular/core";
import type * as Leaflet from "leaflet";
import { TripPlaceCategory } from "../../core/api/api.types";

export interface TripDayMapPoint {
  id: string;
  name: string;
  address: string;
  category: TripPlaceCategory;
  position: number;
  latitude: number;
  longitude: number;
}

const CATEGORY_MARKER_CLASSES: Record<TripPlaceCategory, string> = {
  food: "trip-map-marker--food",
  culture: "trip-map-marker--culture",
  nightlife: "trip-map-marker--nightlife",
  nature: "trip-map-marker--nature",
  shopping: "trip-map-marker--shopping",
  other: "trip-map-marker--other"
};

type LeafletImport = typeof Leaflet | { default: typeof Leaflet };

@Component({
  selector: "isumi-trip-day-map",
  standalone: true,
  host: {
    class: "block h-full min-h-[20rem]"
  },
  template: `
    <div class="relative h-full min-h-[20rem] overflow-hidden rounded-lg bg-background">
      <div #mapContainer class="h-full min-h-[20rem] w-full" aria-label="Mapa dos lugares do dia"></div>
      @if (points.length === 0) {
      <div class="absolute inset-0 grid place-items-center bg-background/90 px-5 text-center">
        <div>
          <strong class="block text-sm">Nenhum ponto localizado</strong>
          <p class="m-0 mt-1 max-w-[34ch] text-xs leading-5 text-muted-foreground">
            Salve endereços nos lugares deste dia para exibir pins no mapa.
          </p>
        </div>
      </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripDayMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) points: TripDayMapPoint[] = [];
  @ViewChild("mapContainer") private mapContainer?: ElementRef<HTMLElement>;

  private leaflet: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private markerLayer: Leaflet.LayerGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private refreshTimers: number[] = [];

  async ngAfterViewInit(): Promise<void> {
    this.leaflet = resolveLeafletModule(await import("leaflet"));
    const container = this.mapContainer!.nativeElement;
    this.map = this.leaflet.map(container, {
      zoomControl: true,
      attributionControl: true
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
    const coordinates: Leaflet.LatLngExpression[] = [];

    for (const point of this.points) {
      const position: Leaflet.LatLngExpression = [point.latitude, point.longitude];
      coordinates.push(position);
      this.leaflet.marker(position, {
        icon: this.leaflet.divIcon({
          className: "",
          html: `<span class="trip-map-marker ${CATEGORY_MARKER_CLASSES[point.category]}"><span>${point.position}</span></span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -30]
        })
      })
        .bindPopup(`<strong>${escapeHtml(point.name)}</strong><br><span>${escapeHtml(point.address)}</span>`)
        .addTo(this.markerLayer);
    }

    if (coordinates.length === 0) {
      this.map.setView([-14.235, -51.9253], 4);
    } else if (coordinates.length === 1) {
      this.map.setView(coordinates[0], 15);
    } else {
      this.map.fitBounds(this.leaflet.latLngBounds(coordinates), { padding: [28, 28], maxZoom: 15 });
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
