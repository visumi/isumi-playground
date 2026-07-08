import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { TripDayMapComponent, TripDayMapPoint } from "./trip-day-map.component";

export type TripMiniMapPoint = TripDayMapPoint;

@Component({
  selector: "isumi-trip-mini-map",
  standalone: true,
  imports: [TripDayMapComponent],
  template: `
    <div class="h-24 overflow-hidden rounded-md border border-border/75 bg-background">
      <isumi-trip-day-map
        class="h-full"
        [points]="points"
        [compact]="true"
        [interactive]="false" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripMiniMapComponent {
  @Input() points: TripMiniMapPoint[] = [];
}
