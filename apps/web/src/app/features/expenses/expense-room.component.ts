import { DatePipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { LucideArrowLeft, LucideArrowRight, LucideHandCoins, LucideConciergeBell, LucidePencil, LucidePlus, LucideReceiptText, LucideRefreshCw, LucideSave, LucideScale, LucideTrash2, LucideUserPlus, LucideUsers, LucideX } from "@lucide/angular";
import { ExpensesService } from "../../core/api/expenses.service";
import { ExpenseItem, ExpenseParticipant, ExpenseParticipantTotal, ExpenseRoomDetail, ExpenseSettlement, UpsertExpenseItemRequest } from "../../core/api/api.types";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiAlertComponent, IsumiAvatarComponent, IsumiBadgeComponent, IsumiButtonComponent, IsumiCheckboxComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiModalService, injectIsumiModalData, injectIsumiModalRef } from "../../shared/ui";

interface ExpenseItemModalData {
  participants: ExpenseParticipant[];
  item?: ExpenseItem;
}

@Component({
  selector: "isumi-expense-item-modal",
  standalone: true,
  imports: [FormsModule, IsumiButtonComponent, IsumiInputDirective, LucideSave, LucideX],
  template: `
    <form class="grid gap-5" (ngSubmit)="submit()">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 class="m-0 text-[1.2rem] font-black">{{ data?.item ? "Editar item" : "Adicionar item" }}</h2>
          <p class="m-0 mt-1 max-w-[52ch] text-sm leading-6 text-muted-foreground">Informe quem pagou e como o valor entra na divisao.</p>
        </div>
        <isumi-button variant="ghost" size="sm" iconOnly ariaLabel="Fechar modal" (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      @if (error()) {
        <p class="m-0 rounded-md bg-destructive/15 px-3 py-2 text-sm font-bold text-red-200">{{ error() }}</p>
      }

      <div class="grid grid-cols-[minmax(0,1fr)_150px] gap-3 max-sm:grid-cols-1">
        <label class="grid gap-2">
          <span class="text-sm font-extrabold text-muted-foreground">Descricao</span>
          <input
            isumiInput
            name="description"
            [ngModel]="description()"
            (ngModelChange)="description.set($event)"
            maxlength="160"
            autocomplete="off"
            placeholder="Mercado, hospedagem, ingresso..."
          >
        </label>
        <label class="grid gap-2">
          <span class="text-sm font-extrabold text-muted-foreground">Valor</span>
          <input
            isumiInput
            name="amount"
            inputmode="decimal"
            [ngModel]="amount()"
            (ngModelChange)="amount.set($event)"
            placeholder="0,00"
          >
        </label>
      </div>

      <label class="grid gap-2">
        <span class="text-sm font-extrabold text-muted-foreground">Quem pagou</span>
        <select
          class="w-full rounded-sm border border-input bg-background px-3 py-3 text-foreground transition-colors hover:border-ring/60 focus-visible:border-primary/70 focus-visible:outline-none"
          name="payer"
          [ngModel]="payerParticipantId()"
          (ngModelChange)="payerParticipantId.set($event)"
        >
          @for (participant of participants(); track participant.id) {
            <option [value]="participant.id">{{ participant.name }}</option>
          }
        </select>
      </label>

      <div class="grid gap-2">
        <span class="text-sm font-extrabold text-muted-foreground">Partes de cada pessoa</span>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          @for (participant of participants(); track participant.id) {
            <label class="grid gap-1 rounded-md bg-secondary p-3">
              <span class="truncate text-sm font-bold">{{ participant.name }}</span>
              <input
                isumiInput
                size="sm"
                type="number"
                min="0"
                step="1"
                [name]="'split-' + participant.id"
                [ngModel]="splitUnit(participant.id)"
                (ngModelChange)="setSplitUnit(participant.id, $event)"
                aria-label="Partes de {{ participant.name }}"
              >
            </label>
          }
        </div>
      </div>

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-2">
        <isumi-button variant="secondary" type="button" (click)="modalRef.close()">Cancelar</isumi-button>
        <isumi-button type="submit">
          <svg icon lucideSave class="size-4" aria-hidden="true"></svg>
          {{ data?.item ? "Salvar item" : "Adicionar item" }}
        </isumi-button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseItemModalComponent {
  readonly data = injectIsumiModalData<ExpenseItemModalData>();
  readonly modalRef = injectIsumiModalRef<ExpenseItemModalData, UpsertExpenseItemRequest>();
  readonly participants = computed(() => this.data?.participants || []);
  readonly description = signal(this.data?.item?.description || "");
  readonly amount = signal(this.data?.item ? (this.data.item.amountCents / 100).toFixed(2).replace(".", ",") : "");
  readonly payerParticipantId = signal(this.data?.item?.payerParticipantId || this.participants()[0]?.id || "");
  readonly splitUnits = signal<Record<string, number>>(this.initialSplitUnits());
  readonly error = signal<string | null>(null);

  splitUnit(participantId: string): number {
    return this.splitUnits()[participantId] || 0;
  }

  setSplitUnit(participantId: string, value: string | number): void {
    const parsed = Number(value) || 0;
    this.splitUnits.update((units) => ({ ...units, [participantId]: Math.max(0, Math.trunc(parsed)) }));
  }

  submit(): void {
    const payload = this.buildPayload();

    if (payload) {
      this.modalRef.close(payload);
    }
  }

  private initialSplitUnits(): Record<string, number> {
    const item = this.data?.item;

    return Object.fromEntries(this.participants().map((participant) => [
      participant.id,
      item?.splits.find((split) => split.participantId === participant.id)?.shareUnits || 1
    ]));
  }

  private buildPayload(): UpsertExpenseItemRequest | null {
    const amountCents = this.parseMoney(this.amount());
    const splits = Object.entries(this.splitUnits())
      .filter(([, shareUnits]) => shareUnits > 0)
      .map(([participantId, shareUnits]) => ({ participantId, shareUnits }));

    if (!amountCents || !this.payerParticipantId() || splits.length === 0) {
      this.error.set("Informe valor, pagador e pelo menos uma pessoa com partes.");
      return null;
    }

    return {
      description: this.description().trim() || "Gasto",
      amountCents,
      payerParticipantId: this.payerParticipantId(),
      splits
    };
  }

  private parseMoney(value: string): number | null {
    const normalized = value.replace(/\./g, "").replace(",", ".").trim();
    const parsed = Number(normalized);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return Math.round(parsed * 100);
  }
}

@Component({
  selector: "isumi-expense-room",
  standalone: true,
  imports: [DatePipe, FormsModule, IsumiAlertComponent, IsumiAvatarComponent, IsumiBadgeComponent, IsumiButtonComponent, IsumiCheckboxComponent, IsumiEmptyStateComponent, IsumiInputDirective, LucideArrowLeft, LucideArrowRight, LucideReceiptText, LucideHandCoins, LucidePencil, LucidePlus, LucideConciergeBell, LucideRefreshCw, LucideScale, LucideTrash2, LucideUserPlus, LucideUsers, RouterLink],
  templateUrl: "./expense-room.component.html",
  styleUrl: "./expense-room.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseRoomComponent implements OnInit, OnDestroy {
  private readonly expenses = inject(ExpensesService);
  private readonly modal = inject(IsumiModalService);
  private readonly autoRefreshMs = 5000;
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshingRoom = false;
  private readonly handleVisibilityChange = (): void => this.syncAutoRefreshWithVisibility();
  readonly auth = inject(AuthService);

  readonly roomId = input.required<string>();
  readonly detail = signal<ExpenseRoomDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly guestName = signal("");
  readonly tipPercent = signal("10");
  readonly savingSettlementKey = signal<string | null>(null);
  readonly participants = computed(() => this.detail()?.participants || []);
  readonly isOwner = computed(() => this.detail()?.room.ownerUserId === this.auth.profile()?.uid);
  readonly unpaidSettlementCents = computed(() =>
    (this.detail()?.settlements || [])
      .filter((settlement) => !settlement.paid)
      .reduce((total, settlement) => total + settlement.amountCents, 0)
  );
  readonly paidSettlementCents = computed(() =>
    (this.detail()?.settlements || [])
      .filter((settlement) => settlement.paid)
      .reduce((total, settlement) => total + settlement.amountCents, 0)
  );
  readonly pendingSettlements = computed(() =>
    (this.detail()?.settlements || []).filter((settlement) => !settlement.paid)
  );
  readonly paidSettlements = computed(() =>
    (this.detail()?.settlements || []).filter((settlement) => settlement.paid)
  );
  readonly settlementProgressLabel = computed(() => {
    const total = this.detail()?.settlements.length || 0;
    const paid = this.paidSettlements().length;

    return `${paid} de ${total} quitados`;
  });

  ngOnInit(): void {
    this.loadRoom();
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.stopAutoRefresh();
  }

  loadRoom(): void {
    this.refreshRoom({ showLoading: true });
  }

  private refreshRoom(options: { showLoading?: boolean; silent?: boolean } = {}): void {
    if (this.saving() || this.refreshingRoom) {
      return;
    }

    const showLoading = options.showLoading ?? false;
    this.refreshingRoom = true;

    if (showLoading) {
      this.loading.set(true);
      this.error.set(null);
    }

    this.expenses.getRoom(this.roomId()).subscribe({
      next: (detail) => this.setDetail(detail),
      error: (error: unknown) => this.handleRoomLoadError(error, { showLoading, silent: options.silent ?? false }),
      complete: () => {
        if (showLoading) {
          this.loading.set(false);
        }
        this.refreshingRoom = false;
      }
    });
  }

  saveTipPercent(): void {
    const detail = this.detail();
    const tipPercent = this.parsePercent(this.tipPercent());

    if (!detail || tipPercent === null) {
      this.error.set("Informe uma gorjeta entre 0 e 100%.");
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.expenses.updateTip(detail.room.id, { tipPercent }).subscribe({
      next: (updated) => this.setDetail(updated),
      error: () => {
        this.error.set("Nao foi possivel atualizar a gorjeta.");
        this.saving.set(false);
      },
      complete: () => this.saving.set(false)
    });
  }

  addGuest(): void {
    const name = this.guestName().trim();
    if (!name) {
      return;
    }

    this.saving.set(true);
    this.expenses.createGuest(this.roomId(), { name }).subscribe({
      next: (updated) => {
        this.guestName.set("");
        this.setDetail(updated);
      },
      error: () => {
        this.error.set("Nao foi possivel adicionar a pessoa.");
        this.saving.set(false);
      },
      complete: () => this.saving.set(false)
    });
  }

  removeParticipant(participant: ExpenseParticipant): void {
    this.saving.set(true);
    this.error.set(null);
    this.expenses.deleteParticipant(this.roomId(), participant.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.loadRoom();
      },
      error: () => {
        this.error.set("Nao foi possivel remover esta pessoa. Ela ja esta em gastos, divisoes ou acertos.");
        this.saving.set(false);
      },
      complete: () => this.saving.set(false)
    });
  }

  canRemoveParticipant(participant: ExpenseParticipant): boolean {
    return this.isOwner() && participant.role !== "owner";
  }

  openNewItemModal(): void {
    const ref = this.modal.open<ExpenseItemModalComponent, ExpenseItemModalData, UpsertExpenseItemRequest>(ExpenseItemModalComponent, {
      data: { participants: this.participants() },
      ariaLabel: "Adicionar item da divisao"
    });

    ref.afterClosed().subscribe((payload) => {
      if (payload) {
        this.saveItemPayload(payload);
      }
    });
  }

  editItem(item: ExpenseItem): void {
    const ref = this.modal.open<ExpenseItemModalComponent, ExpenseItemModalData, UpsertExpenseItemRequest>(ExpenseItemModalComponent, {
      data: { participants: this.participants(), item },
      ariaLabel: "Editar item da divisao"
    });

    ref.afterClosed().subscribe((payload) => {
      if (payload) {
        this.saveItemPayload(payload, item.id);
      }
    });
  }

  deleteItem(item: ExpenseItem): void {
    this.expenses.deleteItem(this.roomId(), item.id).subscribe({
      next: () => this.loadRoom(),
      error: () => this.error.set("Nao foi possivel remover o item.")
    });
  }

  updateSettlementPaid(settlement: ExpenseSettlement, paid: boolean): void {
    const key = this.settlementKey(settlement);
    this.saving.set(true);
    this.savingSettlementKey.set(key);
    this.error.set(null);
    this.expenses.updateSettlement(this.roomId(), {
      fromParticipantId: settlement.fromParticipantId,
      toParticipantId: settlement.toParticipantId,
      paid
    }).subscribe({
      next: (updated) => this.setDetail(updated),
      error: () => {
        this.error.set("Nao foi possivel atualizar o acerto.");
        this.finishSavingSettlement();
      },
      complete: () => this.finishSavingSettlement()
    });
  }

  isSettlementSaving(settlement: ExpenseSettlement): boolean {
    return this.savingSettlementKey() === this.settlementKey(settlement);
  }

  participantName(participantId: string): string {
    return this.participants().find((participant) => participant.id === participantId)?.name || "Pessoa";
  }

  money(amountCents: number): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100);
  }

  participantTotal(participantId: string): ExpenseParticipantTotal {
    return this.detail()?.participantTotals.find((total) => total.participantId === participantId) || {
      participantId,
      subtotalCents: 0,
      tipAmountCents: 0,
      totalCents: 0
    };
  }

  private setDetail(detail: ExpenseRoomDetail): void {
    this.detail.set(detail);
    this.tipPercent.set(this.formatPercent(detail.tipPercent));
  }

  private handleRoomLoadError(error: unknown, options: { showLoading: boolean; silent: boolean }): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.detail.set(null);
      this.error.set("Voce nao participa mais desta sala. Aceite um novo convite para entrar de novo.");
      this.stopAutoRefresh();
    } else if (!options.silent) {
      this.error.set("Nao foi possivel carregar esta sala.");
    }

    if (options.showLoading) {
      this.loading.set(false);
    }

    this.refreshingRoom = false;
  }

  private settlementKey(settlement: ExpenseSettlement): string {
    return `${settlement.fromParticipantId}:${settlement.toParticipantId}`;
  }

  private finishSavingSettlement(): void {
    this.saving.set(false);
    this.savingSettlementKey.set(null);
  }

  private startAutoRefresh(): void {
    if (document.visibilityState !== "visible" || this.autoRefreshTimer) {
      return;
    }

    this.autoRefreshTimer = setInterval(() => {
      this.refreshRoom({ silent: true });
    }, this.autoRefreshMs);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  private syncAutoRefreshWithVisibility(): void {
    if (document.visibilityState === "visible") {
      this.refreshRoom({ silent: true });
      this.startAutoRefresh();
      return;
    }

    this.stopAutoRefresh();
  }

  private saveItemPayload(payload: UpsertExpenseItemRequest, itemId?: string): void {
    const request = itemId
      ? this.expenses.updateItem(this.roomId(), itemId, payload)
      : this.expenses.createItem(this.roomId(), payload);

    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (updated) => this.setDetail(updated),
      error: () => {
        this.error.set("Nao foi possivel salvar o item. Confira valor, pagador e partes.");
        this.saving.set(false);
      },
      complete: () => this.saving.set(false)
    });
  }

  private parsePercent(value: string): number | null {
    const parsed = Number(value.replace(",", ".").trim());

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return null;
    }

    return Math.round(parsed * 100) / 100;
  }

  private formatPercent(value: number): string {
    return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
  }
}
