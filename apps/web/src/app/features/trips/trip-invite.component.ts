import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { LucideArrowRight, LucideRoute, LucideShieldCheck } from "@lucide/angular";
import { TripsService } from "../../core/api/trips.service";
import { IsumiButtonComponent, IsumiToastService } from "../../shared/ui";

@Component({
  selector: "isumi-trip-invite",
  standalone: true,
  imports: [IsumiButtonComponent, LucideArrowRight, LucideRoute, LucideShieldCheck],
  template: `
    <section class="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground" aria-labelledby="invite-title">
      <div class="grid w-full max-w-140 gap-6">
        <div class="inline-flex items-center justify-center gap-3">
          <span class="relative left-0.5 grid h-10 w-10 place-items-center rounded-sm bg-purple-700 font-slab text-2xl font-bold text-purple-100" aria-hidden="true">泉</span>
          <strong class="font-extrabold font-slab text-2xl text-purple-200">playground.</strong>
        </div>

        <section class="overflow-hidden rounded-lg bg-card p-7 text-card-foreground">
          <div class="grid gap-7">
            <div class="grid justify-items-center gap-4 text-center">
              <span class="grid size-12 place-items-center rounded-md bg-primary text-primary-foreground" aria-hidden="true">
                <svg lucideRoute class="size-6"></svg>
              </span>

              <div class="grid gap-3">
                <p class="m-0 text-sm font-extrabold text-primary">Convite para planejar viagem</p>
                <h1 id="invite-title" class="m-0 text-[2.15rem] font-black leading-tight tracking-[-0.03em] text-balance max-sm:text-[1.9rem]">
                  Entrar nesta sala?
                </h1>
                <p class="m-0 max-w-[46ch] leading-6 text-muted-foreground text-pretty">
                  Aceite o convite para organizar lugares, dias e hospedagens com o grupo.
                </p>
              </div>
            </div>

            <div class="grid gap-3 rounded-md bg-secondary px-4 py-3">
              <div class="flex items-center justify-between gap-4 max-sm:grid max-sm:gap-2">
                <span class="text-sm font-extrabold text-muted-foreground">Nome da sala</span>
                <span class="min-w-0 truncate text-right font-bold text-foreground max-sm:text-left">{{ roomTitle() || "Carregando..." }}</span>
              </div>
              <div class="flex items-center justify-between gap-4 border-t border-border pt-3 max-sm:grid max-sm:gap-2">
              <span class="text-sm font-extrabold text-muted-foreground">ID da sala</span>
              <code class="min-w-0 truncate rounded-sm bg-background px-2.5 py-1.5 font-mono text-sm font-bold text-foreground">
                {{ shortRoomId() }}
              </code>
              </div>
            </div>

            <div class="grid gap-3">
              <isumi-button size="lg" fullWidth [loading]="joining()" (click)="acceptInvite()">
                <svg icon lucideArrowRight class="size-4" aria-hidden="true"></svg>
                Aceitar convite
              </isumi-button>

              <div class="flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
                <svg lucideShieldCheck class="size-4 text-primary" aria-hidden="true"></svg>
                Login necessário para aceitar
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripInviteComponent implements OnInit {
  private readonly trips = inject(TripsService);
  private readonly router = inject(Router);
  private readonly toast = inject(IsumiToastService);

  readonly roomId = input.required<string>();
  readonly joining = signal(false);
  readonly roomTitle = signal<string | null>(null);
  readonly shortRoomId = computed(() => {
    const roomId = this.roomId();
    return roomId.length > 12 ? `${roomId.slice(0, 8)}...${roomId.slice(-4)}` : roomId;
  });

  ngOnInit(): void {
    this.trips.invitePreview(this.roomId()).subscribe({
      next: ({ title }) => this.roomTitle.set(title)
    });
  }

  acceptInvite(): void {
    if (this.joining()) return;

    this.joining.set(true);
    this.trips.acceptRoom(this.roomId()).subscribe({
      next: () => void this.router.navigate(["/tools/trips", this.roomId(), "room"]),
      error: () => {
        this.toast.error("Não foi possível aceitar este convite. Confira o link ou tente de novo.");
        this.joining.set(false);
      },
      complete: () => this.joining.set(false)
    });
  }
}
