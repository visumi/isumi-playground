import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { LucideArrowRight, LucideCalendarDays, LucideRoute } from "@lucide/angular";
import { DashboardUpcomingTrip } from "../../core/api/api.types";
import { IsumiButtonComponent, IsumiEmptyStateComponent } from "../../shared/ui";

@Component({
  selector: "isumi-dashboard-upcoming-trips",
  standalone: true,
  imports: [IsumiButtonComponent, IsumiEmptyStateComponent, LucideArrowRight, LucideCalendarDays, LucideRoute, RouterLink],
  template: `
    <section class="grid gap-4 rounded-lg bg-card p-5 text-card-foreground max-sm:p-4" aria-labelledby="dashboard-trips-title">
      <div class="flex items-start justify-between gap-4">
        <div class="grid min-w-0 gap-1">
          <h2 id="dashboard-trips-title" class="m-0 min-w-0 text-[1.2rem] font-black leading-tight">
            Suas próximas viagens
          </h2>
          <p class="m-0 text-sm leading-6 text-muted-foreground">Até 3 roteiros mais próximos por data.</p>
        </div>
        <span class="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary" aria-hidden="true">
          <svg lucideRoute class="size-5"></svg>
        </span>
      </div>

      @if (trips().length > 0) {
        <div class="grid gap-2">
          @for (trip of trips(); track trip.roomId) {
            <a class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-secondary/65 px-4 py-3 text-foreground no-underline transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background max-sm:gap-2 max-sm:px-3" [routerLink]="['/tools/trips', trip.roomId, 'room']">
              <span class="grid size-11 place-items-center rounded-md bg-primary/15 text-primary" aria-hidden="true">
                <svg lucideCalendarDays class="size-5"></svg>
              </span>
              <span class="grid min-w-0 gap-1">
                <span class="flex min-w-0 items-center gap-2">
                  <strong class="min-w-0 truncate text-sm">{{ trip.title }}</strong>
                  <span class="shrink-0 rounded-md bg-zinc-950/45 px-2.5 py-1 text-xs font-extrabold text-muted-foreground">{{ trip.daysCount }} dia(s)</span>
                </span>
                <span class="mt-1 block truncate text-xs font-bold text-muted-foreground">{{ trip.destination }} · {{ dateRange(trip.startDate, trip.endDate) }}</span>
              </span>
              <span class="inline-flex shrink-0 items-center justify-end gap-3 max-sm:hidden">
                <svg lucideArrowRight class="size-4 text-muted-foreground max-sm:hidden" aria-hidden="true"></svg>
              </span>
            </a>
          }
        </div>
      } @else {
        <isumi-empty-state title="Sem viagens próximas" description="Roteiros com data aparecem aqui.">
          <svg icon lucideRoute class="size-5" aria-hidden="true"></svg>
        </isumi-empty-state>
      }

      <isumi-button variant="ghost" size="sm" routerLink="/tools/trips">
        <svg icon lucideArrowRight class="size-4" aria-hidden="true"></svg>
        Planejar viagem
      </isumi-button>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardUpcomingTripsComponent {
  readonly trips = input<DashboardUpcomingTrip[]>([]);

  dateRange(startDate: string, endDate: string): string {
    return `${formatDate(startDate)} até ${formatDate(endDate)}`;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00Z`));
}
