import { DatePipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { LucideArrowRight, LucideHandCoins, LucideConciergeBell, LucideMinus, LucidePencil, LucidePlus, LucideFiles, LucideReceiptText, LucideSave, LucideScale, LucideTrash2, LucideUserPlus, LucideUsers, LucideX, LucideFrown, LucideRabbit } from "@lucide/angular";
import { ExpensesService } from "../../core/api/expenses.service";
import { ExpenseItem, ExpenseParticipant, ExpenseParticipantTotal, ExpenseRoomDetail, ExpenseSettlement, UpsertExpenseItemRequest } from "../../core/api/api.types";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiBreadcrumbComponent } from "../../shared/ui/breadcrumb.component";
import { IsumiAlertComponent, IsumiAvatarComponent, IsumiBadgeComponent, IsumiButtonComponent, IsumiCheckboxComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiModalService, IsumiSelectDirective, IsumiToastService, injectIsumiModalData, injectIsumiModalRef } from "../../shared/ui";

interface ExpenseItemModalData {
  participants: ExpenseParticipant[];
  item?: ExpenseItem;
}

const MAX_SPLIT_UNITS = 99;
const ESTABLISHMENT_PARTICIPANT_ID = "__isumi_establishment__";

function normalizeDecimalInput(value: string | number, decimalPlaces: number): string {
  const rawValue = String(value).replace(/[^\d,.]/g, "");
  const separatorIndex = rawValue.search(/[,.]/);

  if (separatorIndex === -1) {
    return rawValue;
  }

  const whole = rawValue.slice(0, separatorIndex).replace(/[,.]/g, "");
  const decimal = rawValue.slice(separatorIndex + 1).replace(/[,.]/g, "").slice(0, decimalPlaces);
  return `${whole},${decimal}`;
}

@Component({
  selector: "isumi-expense-item-modal",
  standalone: true,
  imports: [FormsModule, IsumiAvatarComponent, IsumiButtonComponent, IsumiInputDirective, IsumiSelectDirective, LucideMinus, LucidePlus, LucideSave, LucideX],
  template: `
    <form class="expense-item-form" (ngSubmit)="submit()">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 class="m-0 text-[1.2rem] font-black">{{ data?.item ? "Editar item" : "Adicionar item" }}</h2>
          <p class="m-0 mt-1 max-w-[52ch] text-sm leading-6 text-muted-foreground">Informe quem pagou e como o valor entra na divisao.</p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar modal" (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <div class="grid grid-cols-[minmax(0,1fr)_150px] gap-3 max-sm:grid-cols-1">
        <label class="grid gap-2">
          <span class="text-sm font-extrabold text-muted-foreground">Item</span>
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
          <span class="text-sm font-extrabold text-muted-foreground">Valor</span>
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
        <span class="text-sm font-extrabold text-muted-foreground">Quem pagou</span>
        <select
          isumiSelect
          name="payer"
          [ngModel]="payerParticipantId()"
          (ngModelChange)="payerParticipantId.set($event)"
        >
          @for (participant of payerOptions(); track participant.id) {
            <option [value]="participant.id">{{ participant.name }}</option>
          }
        </select>
      </label>

      <section class="grid min-h-0 gap-3" aria-labelledby="split-title">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h3 id="split-title" class="m-0 text-sm font-extrabold text-muted-foreground">Partes de cada pessoa</h3>
            <p class="m-0 mt-1 text-xs leading-5 text-muted-foreground">Use 0 para tirar alguem desta divisao.</p>
          </div>
          <span class="rounded-full bg-primary/10 px-2.5 py-1.5 text-xs font-black text-primary">
            {{ totalSplitUnits() }} parte(s)
          </span>
        </div>

        <div class="expense-item-splits-scroll grid min-h-0 gap-2 rounded-lg bg-secondary p-2">
          @for (participant of participants(); track participant.id) {
            <div class="grid gap-2 rounded-md bg-background/70 p-3">
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <isumi-avatar size="md" [src]="participant.picture" [name]="participant.name" />
                  <div class="min-w-0">
                    <strong class="block truncate text-sm">{{ participant.name }}</strong>
                    <span class="text-xs text-muted-foreground">{{ splitPercent(participant.id) }}% da divisao</span>
                  </div>
                </div>

                <div class="grid grid-cols-[32px_64px_32px] items-center gap-1">
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

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-2">
        <isumi-button variant="secondary" type="button" (click)="modalRef.close()">Cancelar</isumi-button>
        <isumi-button type="submit" [disabled]="!canSubmit()">
          <svg icon lucideSave class="size-4" aria-hidden="true"></svg>
          {{ data?.item ? "Salvar item" : "Adicionar item" }}
        </isumi-button>
      </footer>
    </form>
  `,
  styles: [`
    :host {
      display: block;
    }

    .expense-item-form {
      display: flex;
      max-height: calc(min(720px, calc(100dvh - 32px)) - 40px);
      min-height: 0;
      flex-direction: column;
      gap: 1.25rem;
      overflow: hidden;
    }

    .expense-item-splits-scroll {
      max-height: min(340px, 38dvh);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    @media (max-width: 640px) {
      .expense-item-form {
        max-height: calc(100dvh - 112px);
      }

      .expense-item-splits-scroll {
        max-height: min(320px, 34dvh);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseItemModalComponent {
  readonly data = injectIsumiModalData<ExpenseItemModalData>();
  readonly modalRef = injectIsumiModalRef<ExpenseItemModalData, UpsertExpenseItemRequest>();
  private readonly toast = inject(IsumiToastService);
  readonly allParticipants = computed(() => this.data?.participants || []);
  readonly participants = computed(() => this.allParticipants().filter((participant) => !participant.isEstablishment));
  readonly payerOptions = computed(() => {
    const establishment = this.allParticipants().find((participant) => participant.isEstablishment);

    return [
      { id: establishment?.id || ESTABLISHMENT_PARTICIPANT_ID, name: "Pebbles" },
      ...this.participants().map((participant) => ({ id: participant.id, name: participant.name }))
    ];
  });
  readonly description = signal(this.data?.item?.description || "");
  readonly amount = signal(this.data?.item ? (this.data.item.amountCents / 100).toFixed(2).replace(".", ",") : "");
  readonly payerParticipantId = signal(this.data?.item?.payerParticipantId || this.participants()[0]?.id || this.payerOptions()[0]?.id || "");
  readonly splitUnits = signal<Record<string, number>>(this.initialSplitUnits());
  readonly maxSplitUnits = MAX_SPLIT_UNITS;
  readonly totalSplitUnits = computed(() =>
    Object.values(this.splitUnits()).reduce((total, shareUnits) => total + Math.max(0, shareUnits), 0)
  );
  readonly canSubmit = computed(() =>
    Boolean(this.parseMoney(this.amount()) && this.payerParticipantId() && this.totalSplitUnits() > 0)
  );

  splitUnit(participantId: string): number {
    return this.splitUnits()[participantId] || 0;
  }

  setSplitUnit(participantId: string, value: string | number): void {
    const parsed = Number(value) || 0;
    this.splitUnits.update((units) => ({ ...units, [participantId]: Math.min(MAX_SPLIT_UNITS, Math.max(0, Math.trunc(parsed))) }));
  }

  setAmount(value: string | number): void {
    this.amount.set(normalizeDecimalInput(value, 2));
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
  imports: [DatePipe, FormsModule, IsumiAlertComponent, IsumiAvatarComponent, IsumiBadgeComponent, IsumiBreadcrumbComponent, IsumiButtonComponent, IsumiCheckboxComponent, IsumiEmptyStateComponent, IsumiInputDirective, LucideArrowRight, LucideReceiptText, LucideHandCoins, LucidePencil, LucidePlus, LucideConciergeBell, LucideScale, LucideFiles, LucideTrash2, LucideUserPlus, LucideUsers, LucideFrown, LucideRabbit],
  templateUrl: "./expense-room.component.html",
  styleUrl: "./expense-room.component.scss",
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
  readonly copiedInviteUrl = signal(false);
  readonly error = signal<string | null>(null);
  readonly guestName = signal("");
  readonly tipPercent = signal("10");
  readonly savingSettlementKey = signal<string | null>(null);
  readonly canSaveTipPercent = computed(() => this.parsePercent(this.tipPercent()) !== null);
  readonly participants = computed(() => this.detail()?.participants || []);
  readonly displayedParticipants = computed(() => [
    ...this.participants().filter((participant) => participant.isEstablishment),
    ...this.participants().filter((participant) => !participant.isEstablishment)
  ]);
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
        this.toast.error("Nao foi possivel remover este participante. Ele ja esta em gastos, divisoes ou acertos.", {
          id: "expense-remove-participant-error"
        });
        this.saving.set(false);
      },
      complete: () => this.saving.set(false)
    });
  }

  canRemoveParticipant(participant: ExpenseParticipant): boolean {
    if (participant.isEstablishment) {
      return this.isOwner();
    }

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
    if (this.deletingItemId()) {
      return;
    }

    this.deletingItemId.set(item.id);
    this.error.set(null);
    this.expenses.deleteItem(this.roomId(), item.id).subscribe({
      next: () => this.loadRoom(),
      error: () => {
        this.error.set("Nao foi possivel remover o item.");
        this.deletingItemId.set(null);
      },
      complete: () => this.deletingItemId.set(null)
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
      this.error.set("Nao foi possivel copiar o link da sala.");
      this.toast.error("Nao foi possivel copiar o link da sala.", { id: "expense-invite-url-copy-error" });
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

  participantRoleLabel(participant: ExpenseParticipant): string {
    if (participant.isEstablishment) {
      return "Chefão";
    }

    return participant.role === "owner" ? "Dono" : participant.kind === "guest" ? "Convidado" : "Membro";
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

  setTipPercent(value: string | number): void {
    const normalized = normalizeDecimalInput(value, 2);
    const parsed = Number(normalized.replace(",", "."));
    this.tipPercent.set(Number.isFinite(parsed) && parsed > 100 ? "100" : normalized);
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
    this.tipPercent.set(this.formatPercent(detail.tipPercent));
  }

  private handleRoomLoadError(error: unknown, options: { showLoading: boolean; silent: boolean }): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.detail.set(null);
      this.stopAutoRefresh();
      void this.router.navigate(["/tools/expenses", this.roomId()]);
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
    this.savingItemId.set(itemId ?? "new");
    this.error.set(null);
    request.subscribe({
      next: (updated) => this.setDetail(updated),
      error: () => {
        this.toast.error("Nao foi possivel salvar o item. Confira valor, pagador e partes.", {
          id: "expense-save-item-error"
        });
        this.saving.set(false);
        this.savingItemId.set(null);
      },
      complete: () => {
        this.saving.set(false);
        this.savingItemId.set(null);
      }
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
