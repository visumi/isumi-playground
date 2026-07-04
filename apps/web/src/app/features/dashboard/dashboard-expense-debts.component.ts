import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { LucideArrowRight, LucideScale } from "@lucide/angular";
import { DashboardExpenseDebt } from "../../core/api/api.types";
import { IsumiButtonComponent, IsumiEmptyStateComponent } from "../../shared/ui";
import { DashboardSensitiveValueComponent } from "./dashboard-sensitive-value.component";

@Component({
  selector: "isumi-dashboard-expense-debts",
  standalone: true,
  imports: [DashboardSensitiveValueComponent, IsumiButtonComponent, IsumiEmptyStateComponent, LucideArrowRight, LucideScale, RouterLink],
  template: `
    <section class="grid h-full min-h-[24rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 rounded-lg bg-card p-5 text-card-foreground max-sm:min-h-[22rem] max-sm:p-4" aria-labelledby="dashboard-debts-title">
      <div class="flex items-start justify-between gap-4">
        <div class="grid min-w-0 gap-1">
          <h2 id="dashboard-debts-title" class="m-0 min-w-0 text-[1.2rem] font-black leading-tight">
            Despesas a resolver
          </h2>
          <p class="m-0 text-sm leading-6 text-muted-foreground">Valores em aberto nas salas de dividir gastos.</p>
        </div>
        <span class="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary" aria-hidden="true">
          <svg lucideScale class="size-5"></svg>
        </span>
      </div>

      @if (debts().length > 0) {
        <div class="grid h-[13.75rem] min-h-0 content-start gap-2 overflow-y-auto pr-1">
          @for (debt of debts(); track debt.roomId + debt.toParticipantName) {
            <a class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-secondary/65 px-4 py-3 text-foreground no-underline transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background max-sm:gap-2 max-sm:px-3" [routerLink]="['/tools/expenses', debt.roomId, 'room']">
              <span class="min-w-0">
                <strong class="block truncate text-sm">{{ debt.roomName }}</strong>
                <span class="mt-1 block truncate text-xs font-bold text-muted-foreground">Pagar para {{ debt.toParticipantName }}</span>
              </span>
              <span class="inline-flex shrink-0 items-center justify-end gap-3 max-sm:gap-2">
                <isumi-dashboard-sensitive-value [amountCents]="debt.amountCents" [hidden]="hidden()" tone="negative" />
                <svg lucideArrowRight class="size-4 text-muted-foreground" aria-hidden="true"></svg>
              </span>
            </a>
          }
        </div>

        <div class="grid gap-2 self-end">
          <div class="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/45 px-3 py-2.5">
            <span class="min-w-0 text-sm font-bold text-muted-foreground">Total em aberto</span>
            <span class="shrink-0 text-right">
              <isumi-dashboard-sensitive-value [amountCents]="totalCents()" [hidden]="hidden()" size="xs" tone="negative" />
            </span>
          </div>
          <isumi-button variant="ghost" size="sm" routerLink="/tools/expenses">
            <svg icon lucideArrowRight class="size-4" aria-hidden="true"></svg>
            Ver salas
          </isumi-button>
        </div>
      } @else {
        <isumi-empty-state class="h-full justify-center" title="Tudo resolvido" description="Pendências de salas aparecem aqui.">
          <svg icon lucideScale class="size-5" aria-hidden="true"></svg>
        </isumi-empty-state>
        <isumi-button variant="ghost" size="sm" routerLink="/tools/expenses">
          <svg icon lucideArrowRight class="size-4" aria-hidden="true"></svg>
          Ver salas
        </isumi-button>
      }

    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardExpenseDebtsComponent {
  readonly debts = input<DashboardExpenseDebt[]>([]);
  readonly hidden = input(false);
  readonly totalCents = computed(() => this.debts().reduce((sum, debt) => sum + debt.amountCents, 0));
}
