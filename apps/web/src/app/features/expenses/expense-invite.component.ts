import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { Router } from "@angular/router";
import { LucideArrowRight, LucideUsers } from "@lucide/angular";
import { ExpensesService } from "../../core/api/expenses.service";
import { IsumiAlertComponent, IsumiButtonComponent, IsumiCardComponent } from "../../shared/ui";

@Component({
  selector: "isumi-expense-invite",
  standalone: true,
  imports: [IsumiAlertComponent, IsumiButtonComponent, IsumiCardComponent, LucideArrowRight, LucideUsers],
  template: `
    <section class="grid min-h-[calc(100svh-10rem)] place-items-center py-8" aria-labelledby="invite-title">
      <div class="grid w-full max-w-3xl gap-4">
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
              </div>
            </div>
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

    this.expenses.getRoom(this.roomId()).subscribe({
      next: () => void this.router.navigate(["/tools/expenses", this.roomId(), "room"]),
      error: () => {
        this.error.set("Nao foi possivel aceitar este convite. Confira o link ou tente de novo.");
        this.joining.set(false);
      },
      complete: () => this.joining.set(false)
    });
  }
}
