import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { LucideArrowLeft, LucidePencil, LucidePlus, LucideReceiptText, LucideRefreshCw, LucideSave, LucideScale, LucideTrash2, LucideUsers } from "@lucide/angular";
import { ExpensesService } from "../../core/api/expenses.service";
import { ExpenseItem, ExpenseParticipant, ExpenseRoomDetail, UpsertExpenseItemRequest } from "../../core/api/api.types";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiAlertComponent, IsumiBadgeComponent, IsumiButtonComponent, IsumiCardComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent, IsumiSkeletonComponent } from "../../shared/ui";

@Component({
  selector: "isumi-expense-room",
  standalone: true,
  imports: [DatePipe, FormsModule, IsumiAlertComponent, IsumiBadgeComponent, IsumiButtonComponent, IsumiCardComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent, IsumiSkeletonComponent, LucideArrowLeft, LucidePencil, LucidePlus, LucideReceiptText, LucideRefreshCw, LucideSave, LucideScale, LucideTrash2, LucideUsers, RouterLink],
  templateUrl: "./expense-room.component.html",
  styleUrl: "./expense-room.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseRoomComponent implements OnInit {
  private readonly expenses = inject(ExpensesService);
  readonly auth = inject(AuthService);

  readonly roomId = input.required<string>();
  readonly detail = signal<ExpenseRoomDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly guestName = signal("");
  readonly roomName = signal("");
  readonly editingItemId = signal<string | null>(null);
  readonly itemDescription = signal("");
  readonly itemAmount = signal("");
  readonly payerParticipantId = signal("");
  readonly splitUnits = signal<Record<string, number>>({});
  readonly participants = computed(() => this.detail()?.participants || []);
  readonly isOwner = computed(() => this.detail()?.room.ownerUserId === this.auth.profile()?.uid);

  ngOnInit(): void {
    this.loadRoom();
  }

  loadRoom(): void {
    this.loading.set(true);
    this.error.set(null);

    this.expenses.getRoom(this.roomId()).subscribe({
      next: (detail) => this.setDetail(detail),
      error: () => this.error.set("Nao foi possivel carregar esta sala."),
      complete: () => this.loading.set(false)
    });
  }

  saveRoomName(): void {
    const detail = this.detail();
    if (!detail || !this.isOwner()) {
      return;
    }

    this.saving.set(true);
    this.expenses.updateRoom(detail.room.id, { name: this.roomName().trim() || detail.room.name }).subscribe({
      next: (updated) => this.setDetail(updated),
      error: () => this.error.set("Nao foi possivel renomear a sala."),
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
      error: () => this.error.set("Nao foi possivel adicionar a pessoa."),
      complete: () => this.saving.set(false)
    });
  }

  removeGuest(participant: ExpenseParticipant): void {
    this.expenses.deleteGuest(this.roomId(), participant.id).subscribe({
      next: () => this.loadRoom(),
      error: () => this.error.set("Nao foi possivel remover esta pessoa. Verifique se ela pagou algum item.")
    });
  }

  saveItem(): void {
    const payload = this.buildItemPayload();
    if (!payload) {
      return;
    }

    const editingId = this.editingItemId();
    const request = editingId
      ? this.expenses.updateItem(this.roomId(), editingId, payload)
      : this.expenses.createItem(this.roomId(), payload);

    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (updated) => {
        this.resetItemForm(updated.participants);
        this.setDetail(updated);
      },
      error: () => this.error.set("Nao foi possivel salvar o item. Confira valor, pagador e partes."),
      complete: () => this.saving.set(false)
    });
  }

  editItem(item: ExpenseItem): void {
    const units: Record<string, number> = {};

    for (const participant of this.participants()) {
      units[participant.id] = item.splits.find((split) => split.participantId === participant.id)?.shareUnits || 0;
    }

    this.editingItemId.set(item.id);
    this.itemDescription.set(item.description);
    this.itemAmount.set((item.amountCents / 100).toFixed(2).replace(".", ","));
    this.payerParticipantId.set(item.payerParticipantId);
    this.splitUnits.set(units);
  }

  deleteItem(item: ExpenseItem): void {
    this.expenses.deleteItem(this.roomId(), item.id).subscribe({
      next: () => this.loadRoom(),
      error: () => this.error.set("Nao foi possivel remover o item.")
    });
  }

  cancelEdit(): void {
    this.resetItemForm(this.participants());
  }

  splitUnit(participantId: string): number {
    return this.splitUnits()[participantId] || 0;
  }

  setSplitUnit(participantId: string, value: string | number): void {
    const parsed = Number(value) || 0;
    this.splitUnits.update((units) => ({ ...units, [participantId]: Math.max(0, Math.trunc(parsed)) }));
  }

  participantName(participantId: string): string {
    return this.participants().find((participant) => participant.id === participantId)?.name || "Pessoa";
  }

  money(amountCents: number): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100);
  }

  private setDetail(detail: ExpenseRoomDetail): void {
    this.detail.set(detail);
    this.roomName.set(detail.room.name);

    if (!this.payerParticipantId() || !detail.participants.some((participant) => participant.id === this.payerParticipantId())) {
      this.payerParticipantId.set(detail.participants[0]?.id || "");
    }

    this.ensureSplitDefaults(detail.participants);
  }

  private resetItemForm(participants: ExpenseParticipant[]): void {
    this.editingItemId.set(null);
    this.itemDescription.set("");
    this.itemAmount.set("");
    this.payerParticipantId.set(participants[0]?.id || "");
    this.splitUnits.set(Object.fromEntries(participants.map((participant) => [participant.id, 1])));
  }

  private ensureSplitDefaults(participants: ExpenseParticipant[]): void {
    const current = this.splitUnits();
    const next = Object.fromEntries(participants.map((participant) => [participant.id, current[participant.id] ?? 1]));
    this.splitUnits.set(next);
  }

  private buildItemPayload(): UpsertExpenseItemRequest | null {
    const amountCents = this.parseMoney(this.itemAmount());
    const splits = Object.entries(this.splitUnits())
      .filter(([, shareUnits]) => shareUnits > 0)
      .map(([participantId, shareUnits]) => ({ participantId, shareUnits }));

    if (!amountCents || !this.payerParticipantId() || splits.length === 0) {
      this.error.set("Informe valor, pagador e pelo menos uma pessoa com partes.");
      return null;
    }

    return {
      description: this.itemDescription().trim() || "Gasto",
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
