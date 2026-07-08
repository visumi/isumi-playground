import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { TripDayMapComponent, TripDayMapPoint } from "./trip-day-map.component";

export type TripMiniMapPoint = TripDayMapPoint;

@Component({
  selector: "isumi-trip-mini-map",
  standalone: true,
  imports: [TripDayMapComponent],
  host: {
    class: "block h-full min-h-24"
  },
  template: `
    <div class="relative h-full min-h-24 overflow-hidden rounded-md bg-background">
      <isumi-trip-day-map
        class="h-full"
        [points]="points"
        [compact]="true"
        [interactive]="false" />
      <span class="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-border/75" aria-hidden="true"></span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripMiniMapComponent {
  @Input() points: TripMiniMapPoint[] = [];
}
