import { DatePipe } from "@angular/common";
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, OnInit, inject, signal, viewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { LucideArrowRight, LucideCalendarDays, LucideMapPin, LucidePlus, LucideRoute, LucideSave, LucideX } from "@lucide/angular";
import { firstValueFrom } from "rxjs";
import { CreateTripRequest, TripRoom } from "../../core/api/api.types";
import { TripsService } from "../../core/api/trips.service";
import {
  IsumiButtonComponent,
  IsumiEmptyStateComponent,
  IsumiInputDirective,
  IsumiModalService,
  IsumiPageHeaderComponent,
  IsumiTagComponent,
  IsumiToastService,
  injectIsumiModalRef
} from "../../shared/ui";

@Component({
  selector: "isumi-create-trip-modal",
  standalone: true,
  imports: [
    FormsModule,
    IsumiButtonComponent,
    IsumiInputDirective,
    LucideCalendarDays,
    LucideMapPin,
    LucideRoute,
    LucideSave,
    LucideX
  ],
  template: `
    <form class="flex flex-col gap-5" (ngSubmit)="submit()">
      <header class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="m-0 inline-flex items-center gap-2 text-[1.2rem] font-black">
            <span class="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
              <svg lucideRoute class="size-4" aria-hidden="true"></svg>
            </span>
            Nova viagem
          </h2>
          <p class="m-0 mt-1 max-w-[52ch] text-sm leading-6 text-muted-foreground">
            Defina o destino e o período para preparar os dias do roteiro.
          </p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar modal" type="button" (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <div class="grid gap-4 rounded-lg bg-secondary/55 p-3.5">
        <label class="grid gap-2">
          <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
            <svg lucideRoute class="size-4" aria-hidden="true"></svg>
            Nome da viagem
          </span>
          <input
            #titleInput
            isumiInput
            name="title"
            [ngModel]="title()"
            (ngModelChange)="title.set($event.slice(0, 120))"
            maxlength="120"
            autocomplete="off"
            placeholder="Férias em Buenos Aires"
            required
          >
        </label>

        <label class="grid gap-2">
          <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
            <svg lucideMapPin class="size-4" aria-hidden="true"></svg>
            Destino
          </span>
          <input
            isumiInput
            name="destination"
            [ngModel]="destination()"
            (ngModelChange)="destination.set($event.slice(0, 160))"
            maxlength="160"
            autocomplete="off"
            placeholder="Buenos Aires, Argentina"
            required
          >
        </label>

        <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <label class="grid gap-2">
            <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
              <svg lucideCalendarDays class="size-4" aria-hidden="true"></svg>
              Primeiro dia
            </span>
            <input isumiInput type="date" name="startDate" [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" required>
          </label>

          <label class="grid gap-2">
            <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
              <svg lucideCalendarDays class="size-4" aria-hidden="true"></svg>
              Último dia
            </span>
            <input isumiInput type="date" name="endDate" [ngModel]="endDate()" (ngModelChange)="endDate.set($event)" required>
          </label>
        </div>
      </div>

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-1">
        <isumi-button mobileFull variant="secondary" type="button" (click)="modalRef.close()">Cancelar</isumi-button>
        <isumi-button mobileFull type="submit">
          <svg icon lucideSave class="size-4" aria-hidden="true"></svg>
          Criar viagem
        </isumi-button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateTripModalComponent {
  readonly modalRef = injectIsumiModalRef<unknown, CreateTripRequest>();
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>("titleInput");
  readonly title = signal("");
  readonly destination = signal("");
  readonly startDate = signal(new Date().toISOString().slice(0, 10));
  readonly endDate = signal(new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10));

  constructor() {
    afterNextRender(() => this.titleInput()?.nativeElement.focus());
  }

  submit(): void {
    const title = this.title().trim();
    const destination = this.destination().trim();

    if (!title || !destination || !this.startDate() || !this.endDate()) {
      return;
    }

    this.modalRef.close({
      title,
      destination,
      startDate: this.startDate(),
      endDate: this.endDate(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo"
    });
  }
}

@Component({
  selector: "isumi-trips",
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    IsumiButtonComponent,
    IsumiEmptyStateComponent,
    IsumiPageHeaderComponent,
    IsumiTagComponent,
    LucideArrowRight,
    LucideCalendarDays,
    LucideMapPin,
    LucidePlus,
    LucideRoute
  ],
  templateUrl: "./trips.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripsComponent implements OnInit {
  private readonly trips = inject(TripsService);
  private readonly router = inject(Router);
  private readonly toast = inject(IsumiToastService);
  private readonly modal = inject(IsumiModalService);
  readonly rooms = signal<TripRoom[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async openCreateModal(): Promise<void> {
    const ref = this.modal.open<CreateTripModalComponent, unknown, CreateTripRequest>(CreateTripModalComponent, {
      ariaLabel: "Criar viagem",
      panelClass: "sm:w-[min(100%,600px)]"
    });
    const payload = await ref.closed;

    if (!payload) {
      return;
    }

    this.creating.set(true);
    try {
      const snapshot = await firstValueFrom(this.trips.create(payload));
      await this.router.navigate(["/tools/trips", snapshot.room.id, "room"]);
    } catch {
      this.toast.error("Não foi possível criar a viagem.");
    } finally {
      this.creating.set(false);
    }
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.rooms.set(await firstValueFrom(this.trips.list()));
    } catch {
      this.toast.error("Não foi possível carregar suas viagens.");
    } finally {
      this.loading.set(false);
    }
  }
}
