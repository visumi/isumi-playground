import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { LucideArrowLeft, LucideArrowRight, LucideReceiptText, LucideShieldCheck, LucideUsers } from "@lucide/angular";
import { ExpensesService } from "../../core/api/expenses.service";
import { IsumiAlertComponent, IsumiButtonComponent, IsumiCardComponent } from "../../shared/ui";

@Component({
  selector: "isumi-expense-invite",
  standalone: true,
  imports: [IsumiAlertComponent, IsumiButtonComponent, IsumiCardComponent, LucideArrowLeft, LucideArrowRight, LucideReceiptText, LucideShieldCheck, LucideUsers, RouterLink],
  template: `
    <section class="grid min-h-[calc(100svh-10rem)] place-items-center py-8" aria-labelledby="invite-title">
      <div class="grid w-full max-w-3xl gap-4">
        <a class="inline-flex w-fit items-center gap-2 text-sm font-extrabold text-muted-foreground no-underline hover:text-foreground" routerLink="/tools/expenses">
          <svg lucideArrowLeft class="size-4" aria-hidden="true"></svg>
          Voltar para salas
        </a>

        <isumi-card padding="xl" class="overflow-hidden">
          <div class="grid grid-cols-[minmax(0,1fr)_180px] gap-8 max-md:grid-cols-1">
            <div class="grid content-start gap-6">
              <span class="grid size-12 place-items-center rounded-md bg-primary text-primary-foreground" aria-hidden="true">
                <svg lucideUsers class="size-6"></svg>
              </span>

              <div class="grid gap-3">
                <p class="m-0 text-sm font-extrabold text-primary">Convite para dividir gastos</p>
                <h1 id="invite-title" class="m-0 max-w-[12ch] text-[2.35rem] font-black leading-[1.04] tracking-[-0.035em] text-balance max-sm:text-[2rem]">
                  Entrar nesta sala?
                </h1>
                <p class="m-0 max-w-[58ch] leading-6 text-muted-foreground">
                  Ao aceitar, seu perfil entra na sala e você poderá ver os gastos, adicionar itens e acompanhar os acertos.
                </p>
              </div>

              @if (error()) {
                <isumi-alert>{{ error() }}</isumi-alert>
              }

              <div class="flex gap-2 max-sm:grid">
                <isumi-button size="lg" mobileFull [loading]="joining()" (click)="acceptInvite()">
                  <svg icon lucideArrowRight class="size-4" aria-hidden="true"></svg>
                  Aceitar convite
                </isumi-button>
                <isumi-button variant="secondary" size="lg" mobileFull routerLink="/tools/expenses">
                  Ver minhas salas
                </isumi-button>
              </div>
            </div>

            <aside class="grid content-start gap-3 rounded-lg bg-secondary p-4 text-sm">
              <div class="flex items-center gap-2 text-secondary-foreground">
                <svg lucideReceiptText class="size-4" aria-hidden="true"></svg>
                <strong>Sala compartilhada</strong>
              </div>
              <p class="m-0 leading-6 text-muted-foreground">
                O link só confirma sua entrada depois do clique. Se você não reconhece esse convite, volte para suas salas.
              </p>
              <div class="rounded-md bg-background p-3 font-mono text-xs text-muted-foreground">
                {{ shortRoomId() }}
              </div>
              <div class="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <svg lucideShieldCheck class="size-4 text-primary" aria-hidden="true"></svg>
                Login necessário para aceitar
              </div>
            </aside>
          </div>
        </isumi-card>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseInviteComponent {
  private readonly expenses = inject(ExpensesService);
  private readonly router = inject(Router);

  readonly roomId = input.required<string>();
  readonly joining = signal(false);
  readonly error = signal<string | null>(null);
  readonly shortRoomId = computed(() => {
    const roomId = this.roomId();
    return roomId.length > 12 ? `${roomId.slice(0, 8)}...${roomId.slice(-4)}` : roomId;
  });

  acceptInvite(): void {
    if (this.joining()) {
      return;
    }

    this.joining.set(true);
    this.error.set(null);

    this.expenses.acceptRoom(this.roomId()).subscribe({
      next: () => void this.router.navigate(["/tools/expenses", this.roomId(), "room"]),
      error: () => {
        this.error.set("Nao foi possivel aceitar este convite. Confira o link ou tente de novo.");
        this.joining.set(false);
      },
      complete: () => this.joining.set(false)
    });
  }
}
