import { DatePipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { LucideArrowRight, LucideConciergeBell, LucideDollarSign, LucideMinus, LucidePencil, LucidePlus, LucideFiles, LucideReceiptText, LucideSave, LucideScale, LucideTrash2, LucideUserPlus, LucideUserRound, LucideUsers, LucideX, LucideFrown } from "@lucide/angular";
import { ExpensesService } from "../../core/api/expenses.service";
import { ExpenseItem, ExpenseParticipant, ExpenseParticipantTotal, ExpenseRoomDetail, ExpenseSettlement, UpsertExpenseItemRequest } from "../../core/api/api.types";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiBreadcrumbComponent } from "../../shared/ui/breadcrumb.component";
import { IsumiAvatarComponent, IsumiButtonComponent, IsumiCheckboxComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiModalService, IsumiSelectDirective, IsumiTagComponent, IsumiToastService, IsumiTooltipComponent, injectIsumiModalData, injectIsumiModalRef } from "../../shared/ui";
import { formatBrl, formatMoneyInput, normalizeDecimalInput, parseMoneyCents } from "../../shared/utils/money";

interface ExpenseItemModalData {
  participants: ExpenseParticipant[];
  item?: ExpenseItem;
}

interface DeleteExpenseRoomModalData {
  roomName: string;
}

const MAX_SPLIT_UNITS = 99;

@Component({
  selector: "isumi-expense-item-modal",
  standalone: true,
  imports: [FormsModule, IsumiAvatarComponent, IsumiButtonComponent, IsumiInputDirective, IsumiSelectDirective, LucideDollarSign, LucideMinus, LucidePlus, LucideReceiptText, LucideSave, LucideUserRound, LucideX, IsumiTagComponent],
  template: `
    <form class="flex max-h-[calc(min(720px,calc(100dvh-32px))-40px)] min-h-0 flex-col gap-5 overflow-hidden max-sm:max-h-[calc(100dvh-112px)]" (ngSubmit)="submit()">
      <header class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="m-0 inline-flex items-center gap-2 text-[1.2rem] font-black">
            <span class="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
              <svg lucideReceiptText class="size-4" aria-hidden="true"></svg>
            </span>
            {{ data?.item ? "Editar item" : "Adicionar item" }}
          </h2>
          <p class="m-0 mt-1 max-w-[52ch] text-sm leading-6 text-muted-foreground">Informe quem pagou e como o valor entra na divisão.</p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar modal" (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <div class="grid gap-4 rounded-lg bg-secondary/55 p-3.5">
        <div class="grid grid-cols-[minmax(0,1fr)_150px] gap-3 max-sm:grid-cols-1">
          <label class="grid gap-2">
            <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
              <svg lucideReceiptText class="size-4" aria-hidden="true"></svg>
              Item
            </span>
            <input
              isumiInput
              name="description"
              [ngModel]="description()"
              (ngModelChange)="description.set($event.slice(0, 160))"
              maxlength="160"
              autocomplete="off"
              placeholder="Mercado, hospedagem, ingresso..."
              required
            >
          </label>
          <label class="grid gap-2">
            <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
              <svg lucideDollarSign class="size-4" aria-hidden="true"></svg>
              Valor
            </span>
            <input
              isumiInput
              name="amount"
              inputmode="decimal"
              maxlength="14"
              pattern="[0-9.,]*"
              autocomplete="off"
              [ngModel]="amount()"
              (ngModelChange)="setAmount($event)"
              placeholder="0,00"
              aria-label="Valor do item em reais"
              required
            >
          </label>
        </div>

        <label class="grid gap-2">
          <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
            <svg lucideUserRound class="size-4" aria-hidden="true"></svg>
            Quem pagou
          </span>
          <select
            isumiSelect
            name="payer"
            [ngModel]="payerParticipantId()"
            (ngModelChange)="payerParticipantId.set($event)"
          >
            @for (participant of participants(); track participant.id) {
              <option [value]="participant.id">{{ participant.name }}</option>
            }
          </select>
        </label>
      </div>

      <section class="grid min-h-0 gap-3 rounded-lg bg-secondary/55 p-3.5" aria-labelledby="split-title">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h3 id="split-title" class="m-0 text-sm font-extrabold text-muted-foreground">Partes de cada pessoa</h3>
            <p class="m-0 mt-1 text-xs leading-5 text-muted-foreground">Use 0 para tirar alguem desta divisão.</p>
          </div>
          <isumi-tag tone="primary">
            {{ totalSplitUnits() }} parte(s)
          </isumi-tag>
        </div>

        <div class="grid min-h-0 max-h-[min(340px,38dvh)] gap-2 overflow-y-auto overscroll-contain rounded-lg bg-background/60 p-2 [scrollbar-gutter:auto] max-sm:max-h-[min(320px,34dvh)]">
          @for (participant of participants(); track participant.id) {
            <div class="grid gap-2 rounded-md bg-background/70 p-3">
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <isumi-avatar size="md" [src]="participant.picture" [name]="participant.name" />
                  <div class="min-w-0">
                    <strong class="block truncate text-sm">{{ participant.name }}</strong>
                    <span class="text-xs text-muted-foreground">{{ splitPercent(participant.id) }}% da divisão</span>
                  </div>
                </div>

                <div class="grid grid-cols-[36px_64px_36px] items-center gap-1.5">
                  <isumi-button type="button" variant="ghost" size="sm" iconOnly ariaLabel="Diminuir partes de {{ participant.name }}" (click)="decrementSplitUnit(participant.id)">
                    <svg icon lucideMinus class="size-4" aria-hidden="true"></svg>
                    Diminuir
                  </isumi-button>
                  <input
                    isumiInput
                    size="sm"
                    class="text-center font-mono font-bold"
                    type="number"
                    min="0"
                    [max]="maxSplitUnits"
                    step="1"
                    [name]="'split-' + participant.id"
                    [ngModel]="splitUnit(participant.id)"
                    (ngModelChange)="setSplitUnit(participant.id, $event)"
                    aria-label="Partes de {{ participant.name }}"
                  >
                  <isumi-button type="button" variant="ghost" size="sm" iconOnly ariaLabel="Aumentar partes de {{ participant.name }}" (click)="incrementSplitUnit(participant.id)">
                    <svg icon lucidePlus class="size-4" aria-hidden="true"></svg>
                    Aumentar
                  </isumi-button>
                </div>
              </div>

              <div class="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div class="h-full rounded-full bg-primary transition-[width]" [style.width.%]="splitPercent(participant.id)"></div>
              </div>
            </div>
          }
        </div>
      </section>

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-1">
        <isumi-button mobileFull variant="secondary" type="button" [disabled]="modalRef.processing()" (click)="modalRef.close()">Cancelar</isumi-button>
        <isumi-button mobileFull type="submit" [disabled]="!canSubmit()" [loading]="modalRef.processing()">
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
  private readonly toast = inject(IsumiToastService);
  readonly participants = computed(() => this.data?.participants || []);
  readonly description = signal(this.data?.item?.description || "");
  readonly amount = signal(this.data?.item ? formatMoneyInput(this.data.item.amountCents) : "");
  readonly payerParticipantId = signal(this.data?.item?.payerParticipantId || this.participants()[0]?.id || "");
  readonly splitUnits = signal<Record<string, number>>(this.initialSplitUnits());
  readonly maxSplitUnits = MAX_SPLIT_UNITS;
  readonly totalSplitUnits = computed(() =>
    Object.values(this.splitUnits()).reduce((total, shareUnits) => total + Math.max(0, shareUnits), 0)
  );
  readonly canSubmit = computed(() =>
    Boolean(parseMoneyCents(this.amount()) && this.payerParticipantId() && this.totalSplitUnits() > 0)
  );

  splitUnit(participantId: string): number {
    return this.splitUnits()[participantId] || 0;
  }

  setSplitUnit(participantId: string, value: string | number): void {
    const parsed = Number(value) || 0;
    this.splitUnits.update((units) => ({ ...units, [participantId]: Math.min(MAX_SPLIT_UNITS, Math.max(0, Math.trunc(parsed))) }));
  }

  setAmount(value: string | number): void {
    this.amount.set(normalizeDecimalInput(value));
  }

  incrementSplitUnit(participantId: string): void {
    this.setSplitUnit(participantId, this.splitUnit(participantId) + 1);
  }

  decrementSplitUnit(participantId: string): void {
    this.setSplitUnit(participantId, this.splitUnit(participantId) - 1);
  }

  splitPercent(participantId: string): number {
    const total = this.totalSplitUnits();

    if (total === 0) {
      return 0;
    }

    return Math.round((this.splitUnit(participantId) / total) * 100);
  }

  submit(): void {
    const payload = this.buildPayload();

    if (payload) {
      void this.modalRef.submit(payload);
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
    const amountCents = parseMoneyCents(this.amount());
    const splits = Object.entries(this.splitUnits())
      .filter(([, shareUnits]) => shareUnits > 0)
      .map(([participantId, shareUnits]) => ({ participantId, shareUnits }));

    if (!amountCents || !this.payerParticipantId() || splits.length === 0) {
      this.toast.error("Informe valor, pagador e pelo menos uma pessoa com partes.", {
        id: "expense-item-validation-error"
      });
      return null;
    }

    return {
      description: this.description().trim() || "Gasto",
      amountCents,
      payerParticipantId: this.payerParticipantId(),
      splits
    };
  }
}

@Component({
  selector: "isumi-delete-expense-room-modal",
  standalone: true,
  imports: [IsumiButtonComponent, LucideTrash2, LucideX],
  template: `
    <div class="grid gap-5">
      <header class="flex items-start justify-between gap-4">
        <div>
          <div class="mb-3 grid size-10 place-items-center rounded-sm bg-destructive/15 text-destructive">
            <svg icon lucideTrash2 class="size-5" aria-hidden="true"></svg>
          </div>
          <h2 class="m-0 text-[1.2rem] font-black">Excluir sala</h2>
          <p class="m-0 mt-2 max-w-[52ch] text-sm leading-6 text-muted-foreground">
            Isto remove a sala "{{ data?.roomName || "esta sala" }}", seus itens, participantes e acertos. Esta ação não pode ser desfeita.
          </p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar confirmacao" (click)="modalRef.close(false)">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-1">
        <isumi-button mobileFull variant="secondary" type="button" [disabled]="modalRef.processing()" (click)="modalRef.close(false)">Cancelar</isumi-button>
        <isumi-button mobileFull variant="destructive" type="button" [loading]="modalRef.processing()" (click)="modalRef.submit(true)">
          <svg icon lucideTrash2 class="size-4" aria-hidden="true"></svg>
          Excluir sala
        </isumi-button>
      </footer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeleteExpenseRoomModalComponent {
  readonly data = injectIsumiModalData<DeleteExpenseRoomModalData>();
  readonly modalRef = injectIsumiModalRef<DeleteExpenseRoomModalData, boolean>();
}

@Component({
  selector: "isumi-expense-room",
  standalone: true,
  imports: [DatePipe, FormsModule, IsumiAvatarComponent, IsumiBreadcrumbComponent, IsumiButtonComponent, IsumiCheckboxComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiTagComponent, IsumiTooltipComponent, LucideArrowRight, LucideReceiptText, LucidePencil, LucidePlus, LucideConciergeBell, LucideScale, LucideFiles, LucideTrash2, LucideUserPlus, LucideUsers, LucideFrown],
  templateUrl: "./expense-room.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseRoomComponent implements OnInit, OnDestroy {
  private readonly expenses = inject(ExpensesService);
  private readonly modal = inject(IsumiModalService);
  private readonly router = inject(Router);
  private readonly toast = inject(IsumiToastService);
  private readonly autoRefreshMs = 5000;
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshingRoom = false;
  private readonly handleVisibilityChange = (): void => this.syncAutoRefreshWithVisibility();
  readonly auth = inject(AuthService);

  readonly roomId = input.required<string>();
  readonly detail = signal<ExpenseRoomDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly savingItemId = signal<string | null>(null);
  readonly deletingItemId = signal<string | null>(null);
  readonly deletingRoom = signal(false);
  readonly copiedInviteUrl = signal(false);
  readonly error = signal<string | null>(null);
  readonly guestName = signal("");
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
  readonly breadcrumbItems = computed(() => [
    { label: "Salas", link: "/tools/expenses" },
    { label: "Sala" }
  ]);
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
    this.clearCopyFeedbackTimer();
  }

  loadRoom(): void {
    this.refreshRoom({ showLoading: true });
  }

  private refreshRoom(options: { showLoading?: boolean; silent?: boolean } = {}): void {
    if (this.saving() || this.deletingRoom() || this.refreshingRoom) {
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
        this.toast.error("Não foi possível adicionar a pessoa.", { id: "expense-add-guest-error" });
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
        this.toast.error("Não foi possível remover este participante. Ele já está em gastos, divisões ou acertos.", {
          id: "expense-remove-participant-error"
        });
        this.saving.set(false);
      },
      complete: () => this.saving.set(false)
    });
  }

  canRemoveParticipant(participant: ExpenseParticipant): boolean {
    return this.isOwner() && participant.role !== "owner";
  }

  openNewItemModal(): void {
    this.modal.open<ExpenseItemModalComponent, ExpenseItemModalData, UpsertExpenseItemRequest>(ExpenseItemModalComponent, {
      data: { participants: this.participants() },
      ariaLabel: "Adicionar item da divisão",
      onSubmit: (payload) => this.saveItemPayload(payload)
    });
  }

  editItem(item: ExpenseItem): void {
    this.modal.open<ExpenseItemModalComponent, ExpenseItemModalData, UpsertExpenseItemRequest>(ExpenseItemModalComponent, {
      data: { participants: this.participants(), item },
      ariaLabel: "Editar item da divisão",
      onSubmit: (payload) => this.saveItemPayload(payload, item.id)
    });
  }

  deleteItem(item: ExpenseItem): void {
    if (this.deletingItemId()) {
      return;
    }

    this.deletingItemId.set(item.id);
    this.error.set(null);
    this.expenses.deleteItem(this.roomId(), item.id).subscribe({
      next: () => this.loadRoom(),
      error: () => {
        this.toast.error("Não foi possível remover o item.", { id: "expense-delete-item-error" });
        this.deletingItemId.set(null);
      },
      complete: () => this.deletingItemId.set(null)
    });
  }

  openDeleteRoomModal(): void {
    const room = this.detail()?.room;

    if (!room || !this.isOwner() || this.deletingRoom()) {
      return;
    }

    this.modal.open<DeleteExpenseRoomModalComponent, DeleteExpenseRoomModalData, boolean>(DeleteExpenseRoomModalComponent, {
      data: { roomName: room.name },
      ariaLabel: "Confirmar exclusão da sala",
      closeOnBackdrop: false,
      onSubmit: () => this.deleteRoom()
    });
  }

  async copyInviteUrl(): Promise<void> {
    const inviteUrl = this.inviteUrl();

    try {
      let copied = false;

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }

      if (!copied) {
        this.copyWithTextarea(inviteUrl);
      }

      this.error.set(null);
      this.copiedInviteUrl.set(true);
      this.toast.success("Link de convite copiado.", { id: "expense-invite-url-copied" });
      this.clearCopyFeedbackTimer();
      this.copyFeedbackTimer = setTimeout(() => this.copiedInviteUrl.set(false), 2500);
    } catch {
      this.toast.error("Não foi possível copiar o link da sala.", { id: "expense-invite-url-copy-error" });
    }
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
        this.toast.error("Não foi possível atualizar o acerto.", { id: "expense-settlement-update-error" });
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

  participantRoleLabel(participant: ExpenseParticipant): string {
    return participant.role === "owner" ? "Dono" : participant.kind === "guest" ? "Convidado" : "Membro";
  }

  money(amountCents: number): string {
    return formatBrl(amountCents);
  }

  participantTotal(participantId: string): ExpenseParticipantTotal {
    return this.detail()?.participantTotals.find((total) => total.participantId === participantId) || {
      participantId,
      subtotalCents: 0,
      totalCents: 0
    };
  }

  private inviteUrl(): string {
    const path = this.router.serializeUrl(this.router.createUrlTree(["/tools/expenses", this.roomId()]));
    return `${window.location.origin}${path}`;
  }

  private copyWithTextarea(value: string): void {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Copy command failed");
    }
  }

  private clearCopyFeedbackTimer(): void {
    if (this.copyFeedbackTimer) {
      clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }
  }

  private setDetail(detail: ExpenseRoomDetail): void {
    this.detail.set(detail);
  }

  private handleRoomLoadError(error: unknown, options: { showLoading: boolean; silent: boolean }): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.detail.set(null);
      this.stopAutoRefresh();
      void this.router.navigate(["/tools/expenses", this.roomId()]);
    } else if (!options.silent) {
      this.error.set("Não foi possível carregar esta sala.");
      this.toast.error("Não foi possível carregar esta sala.", { id: "expense-room-load-error" });
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

  private async deleteRoom(): Promise<void> {
    if (this.deletingRoom()) {
      return;
    }

    this.deletingRoom.set(true);
    this.error.set(null);
    this.stopAutoRefresh();
    try {
      await firstValueFrom(this.expenses.deleteRoom(this.roomId()));
      this.toast.success("Sala excluída.", { id: "expense-delete-room-success" });
      await this.router.navigate(["/tools/expenses"]);
    } catch (error) {
      this.toast.error("Não foi possível excluir esta sala.", { id: "expense-delete-room-error" });
      this.startAutoRefresh();
      throw error;
    } finally {
      this.deletingRoom.set(false);
    }
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

  private async saveItemPayload(payload: UpsertExpenseItemRequest, itemId?: string): Promise<void> {
    const request = itemId
      ? this.expenses.updateItem(this.roomId(), itemId, payload)
      : this.expenses.createItem(this.roomId(), payload);

    this.saving.set(true);
    this.savingItemId.set(itemId ?? "new");
    this.error.set(null);
    try {
      this.setDetail(await firstValueFrom(request));
    } catch (error) {
      this.toast.error("Não foi possível salvar o item. Confira valor, pagador e partes.", {
          id: "expense-save-item-error"
      });
      throw error;
    } finally {
      this.saving.set(false);
      this.savingItemId.set(null);
    }
  }

}
