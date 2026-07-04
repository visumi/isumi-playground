import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { LucideArrowRight, LucideCalendarDays, LucideSheet } from "@lucide/angular";
import { DashboardMonthlySummary } from "../../core/api/api.types";
import { IsumiButtonComponent, IsumiEmptyStateComponent, IsumiTagComponent } from "../../shared/ui";
import { DashboardSensitiveValueComponent } from "./dashboard-sensitive-value.component";

const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

@Component({
  selector: "isumi-dashboard-monthly-card",
  standalone: true,
  imports: [DashboardSensitiveValueComponent, IsumiButtonComponent, IsumiEmptyStateComponent, IsumiTagComponent, LucideArrowRight, LucideCalendarDays, LucideSheet, RouterLink],
  template: `
    <section class="flex h-full min-h-[24rem] flex-col rounded-lg bg-card p-5 text-card-foreground max-sm:min-h-[22rem] max-sm:p-4" aria-labelledby="dashboard-monthly-title">
      @if (summary(); as month) {
        <div class="grid gap-5">
        <div class="flex items-start justify-between gap-4">
          <div class="grid min-w-0 gap-2">
            <isumi-tag tone="primary" size="small">
              <svg icon lucideCalendarDays aria-hidden="true"></svg>
              {{ monthLabel() }}
            </isumi-tag>
            <div class="grid gap-1">
              <h2 id="dashboard-monthly-title" class="m-0 text-[1.2rem] font-black">Gastos do mês</h2>
              <p class="m-0 text-sm leading-6 text-muted-foreground">Visão rápida do total e do limite variável.</p>
            </div>
          </div>
          <span class="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary" aria-hidden="true">
            <svg lucideSheet class="size-5"></svg>
          </span>
        </div>

          <div class="grid gap-1.5">
            <span class="text-xs font-extrabold text-muted-foreground">Total lançado</span>
            <isumi-dashboard-sensitive-value [amountCents]="month.monthTotalCents" [hidden]="hidden()" size="lg" />
          </div>

          <div class="grid gap-3 rounded-lg bg-zinc-950/45 p-4">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-extrabold text-muted-foreground">Variável</span>
              <isumi-dashboard-sensitive-value [amountCents]="month.variableRemainingCents" [hidden]="hidden()" size="sm" [tone]="month.variableRemainingCents < 0 ? 'negative' : 'positive'" />
            </div>
            <div class="h-3 overflow-hidden rounded-full bg-secondary" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100" aria-label="Uso do limite variável">
              <div
                class="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                [style.width.%]="animatedProgress()"></div>
            </div>
            <div class="flex items-center justify-between gap-3 text-xs font-bold text-muted-foreground">
              <span>Gasto: <isumi-dashboard-sensitive-value [amountCents]="month.variableSpentCents" [hidden]="hidden()" size="sm" /></span>
              <span>Limite: <isumi-dashboard-sensitive-value [amountCents]="month.variableLimitCents" [hidden]="hidden()" size="sm" /></span>
            </div>
          </div>
        </div>

        <isumi-button class="mt-auto pt-6" variant="ghost" size="sm" routerLink="/tools/monthly-expenses">
          <svg icon lucideArrowRight class="size-4" aria-hidden="true"></svg>
          Abrir gastos mensais
        </isumi-button>
      } @else {
        <isumi-empty-state title="Sem mês criado" description="Crie o mês atual para ver seu resumo.">
          <svg icon lucideSheet class="size-5" aria-hidden="true"></svg>
        </isumi-empty-state>
        <isumi-button variant="ghost" size="sm" routerLink="/tools/monthly-expenses">
          <svg icon lucideArrowRight class="size-4" aria-hidden="true"></svg>
          Criar mês
        </isumi-button>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardMonthlyCardComponent implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly progressStarted = signal(false);

  readonly summary = input<DashboardMonthlySummary | null>(null);
  readonly hidden = input(false);

  readonly progress = computed(() => {
    const month = this.summary();
    if (!month || month.variableLimitCents <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round(month.variableSpentCents / month.variableLimitCents * 100)));
  });
  readonly animatedProgress = computed(() => this.progressStarted() ? this.progress() : 0);
  readonly monthLabel = computed(() => {
    const month = this.summary();
    return month ? `${monthNames[month.month - 1]} ${month.year}` : "Mês atual";
  });
  ngAfterViewInit(): void {
    const frameId = requestAnimationFrame(() => this.progressStarted.set(true));
    this.destroyRef.onDestroy(() => cancelAnimationFrame(frameId));
  }
}
