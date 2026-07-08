import { NgClass } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";
import { LucideChevronLeft, LucideChevronRight, LucideRulerDimensionLine } from "@lucide/angular";
import { TripDay, TripDayItem } from "../../core/api/api.types";
import { IsumiButtonComponent, IsumiTooltipComponent } from "../../shared/ui";

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

function dateOnlyValue(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

@Component({
  selector: "isumi-trip-day-timeline",
  standalone: true,
  imports: [
    NgClass,
    IsumiButtonComponent,
    IsumiTooltipComponent,
    LucideChevronLeft,
    LucideChevronRight,
    LucideRulerDimensionLine
  ],
  template: `
    <div class="grid gap-3 rounded-lg bg-card px-4 py-3" aria-label="Navegação pelos dias da viagem">
      <div class="flex items-center justify-between gap-3">
        <div>
          @if (focusedDay(); as currentDay) {
          <span class="text-xs font-bold text-muted-foreground">Progresso da viagem</span>
          <strong class="mt-0.5 block text-sm">Dia {{ dayNumber(currentDay) }} de {{ days().length }}</strong>
          }
        </div>
        <div class="flex flex-wrap items-center justify-end gap-1">
          @if (!alwaysExpanded()) {
          <isumi-tooltip [label]="expanded() ? 'Ocultar timeline' : 'Exibir timeline'">
            <isumi-button variant="secondary" size="sm" type="button" iconOnly
              [ariaExpanded]="expanded()"
              ariaControls="trip-day-timeline"
              [ariaLabel]="expanded() ? 'Ocultar timeline' : 'Exibir timeline'"
              (mouseleave)="blurTimelineToggle($event)"
              (click)="toggleTimeline()">
              <svg icon lucideRulerDimensionLine class="size-4" aria-hidden="true"></svg>
              {{ expanded() ? "Ocultar timeline" : "Exibir timeline" }}
            </isumi-button>
          </isumi-tooltip>
          }
          <isumi-button variant="secondary" size="sm" iconOnly ariaLabel="Mostrar dia anterior"
            [disabled]="!canShowPreviousDays() || dayAnimating()" (click)="previousDayRequested.emit()">
            <svg icon lucideChevronLeft class="size-4"></svg>
            Dia anterior
          </isumi-button>
          <isumi-button variant="secondary" size="sm" iconOnly ariaLabel="Mostrar próximo dia"
            [disabled]="!canShowNextDays() || dayAnimating()" (click)="nextDayRequested.emit()">
            <svg icon lucideChevronRight class="size-4"></svg>
            Próximo dia
          </isumi-button>
        </div>
      </div>
      @if (focusedDay(); as currentDay) {
      <div class="grid gap-3">
        <div class="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Progresso da viagem"
          [attr.aria-valuenow]="dayNumber(currentDay)" aria-valuemin="1" [attr.aria-valuemax]="days().length">
          <span class="block h-full rounded-full bg-primary transition-[width] duration-300"
            [style.width.%]="dayNumber(currentDay) / days().length * 100"></span>
        </div>

        <div id="trip-day-timeline"
          class="grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none"
          [class.grid-rows-[1fr]]="isExpanded()"
          [class.grid-rows-[0fr]]="!isExpanded()"
          [class.translate-y-0]="isExpanded()"
          [class.-translate-y-1]="!isExpanded()"
          [class.opacity-100]="isExpanded()"
          [class.opacity-0]="!isExpanded()"
          [attr.aria-hidden]="!isExpanded()"
          [attr.inert]="isExpanded() ? null : ''">
          <div class="min-h-0 overflow-hidden">
            <div class="relative min-w-0 overflow-hidden rounded-md bg-background/45 px-2 py-2.5">
              <div class="min-w-0 overflow-x-auto pb-1 pt-0.5">
                <div class="relative grid snap-x gap-1" aria-label="Escolha rápida de dia"
                  [style.grid-template-columns]="gridTemplate()"
                  [style.min-width]="minWidth()">
                  @for (timelineDay of days(); track timelineDay.id) {
                  <button
                    class="relative z-10 grid min-h-[4.75rem] cursor-pointer snap-start content-start justify-items-center gap-1 rounded-md px-2 py-1.5 text-center outline-none transition-[background-color,color,box-shadow] duration-200 hover:bg-accent/70 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-wait disabled:opacity-70"
                    type="button"
                    [class.bg-secondary]="isFocusedDay(timelineDay)"
                    [class.text-foreground]="isFocusedDay(timelineDay)"
                    [class.text-muted-foreground]="!isFocusedDay(timelineDay)"
                    [attr.aria-current]="isFocusedDay(timelineDay) ? 'date' : null"
                    [attr.aria-label]="dayNavigatorLabel(timelineDay)"
                    [disabled]="dayAnimating()"
                    (click)="dayFocused.emit(timelineDay.id)">
                    <span class="relative z-10 grid size-8 place-items-center rounded-full border text-xs font-black tabular-nums transition-[background-color,border-color,color] duration-200"
                      [ngClass]="isFocusedDay(timelineDay) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'">
                      {{ dayNumber(timelineDay) }}
                    </span>
                    <span class="mt-1 text-[0.6875rem] font-black leading-none"
                      [class.text-foreground]="isFocusedDay(timelineDay)">
                      Dia {{ dayNumber(timelineDay) }}
                    </span>
                    <span class="max-w-full truncate text-[0.6875rem] font-bold leading-4 opacity-80">
                      {{ formatDateOnly(timelineDay.date) }}
                    </span>
                    @if (isFocusedDay(timelineDay) || dayStopCount(timelineDay) > 0) {
                    <span class="max-w-full truncate rounded-full px-2 py-0.5 text-[0.625rem] font-black leading-4"
                      [ngClass]="isFocusedDay(timelineDay) ? 'bg-primary/15 text-primary' : 'bg-secondary/70 text-muted-foreground'">
                      {{ dayStopLabel(timelineDay) }}
                    </span>
                    }
                  </button>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripDayTimelineComponent {
  readonly days = input.required<TripDay[]>();
  readonly items = input.required<ReadonlyArray<Pick<TripDayItem, "dayId">>>();
  readonly focusedDay = input.required<TripDay | null>();
  readonly dayAnimating = input(false);
  readonly alwaysExpanded = input(false);
  readonly previousDayRequested = output<void>();
  readonly nextDayRequested = output<void>();
  readonly dayFocused = output<string>();
  readonly expanded = signal(false);
  readonly isExpanded = computed(() => this.alwaysExpanded() || this.expanded());
  readonly focusedDayIndex = computed(() =>
    this.days().findIndex((day) => day.id === this.focusedDay()?.id)
  );
  readonly canShowPreviousDays = computed(() => this.focusedDayIndex() > 0);
  readonly canShowNextDays = computed(() =>
    this.focusedDayIndex() >= 0 && this.focusedDayIndex() < this.days().length - 1
  );
  readonly gridTemplate = computed(() =>
    `repeat(${Math.max(this.days().length, 1)}, minmax(7rem, 1fr))`
  );
  readonly minWidth = computed(() =>
    `max(100%, calc(${Math.max(this.days().length, 1)} * 7rem))`
  );

  toggleTimeline(): void {
    this.expanded.update((expanded) => !expanded);
  }

  blurTimelineToggle(event: MouseEvent): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const button = target.querySelector("button");
    button?.blur();
  }

  dayNumber(day: TripDay): number {
    return day.position + 1;
  }

  isFocusedDay(day: TripDay): boolean {
    return this.focusedDay()?.id === day.id;
  }

  dayStopCount(day: TripDay): number {
    return this.items().filter((item) => item.dayId === day.id).length;
  }

  dayStopLabel(day: TripDay): string {
    const stopCount = this.dayStopCount(day);
    return stopCount === 1 ? "1 parada" : `${stopCount} paradas`;
  }

  dayNavigatorLabel(day: TripDay): string {
    return `Ir para o dia ${this.dayNumber(day)}, ${this.formatDateOnlyLong(day.date)}, ${this.dayStopLabel(day)}`;
  }

  formatDateOnly(date: string): string {
    return SHORT_DATE_FORMATTER.format(dateOnlyValue(date));
  }

  formatDateOnlyLong(date: string): string {
    return LONG_DATE_FORMATTER.format(dateOnlyValue(date));
  }
}
