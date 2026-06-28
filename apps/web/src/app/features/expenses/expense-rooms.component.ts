import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { LucideArrowRight, LucideCalendar, LucideHash, LucidePlus, LucideReceiptText, LucideWalletCards } from "@lucide/angular";
import { ExpensesService } from "../../core/api/expenses.service";
import { ExpenseRoomSummary } from "../../core/api/api.types";
import { IsumiAvatarGroupComponent, IsumiButtonComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent, IsumiTagComponent, IsumiToastService } from "../../shared/ui";

@Component({
  selector: "isumi-expense-rooms",
  standalone: true,
  imports: [DatePipe, FormsModule, IsumiAvatarGroupComponent, IsumiButtonComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent, IsumiTagComponent, LucideArrowRight, LucideCalendar, LucideHash, LucidePlus, LucideReceiptText, LucideWalletCards, RouterLink],
  templateUrl: "./expense-rooms.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseRoomsComponent implements OnInit {
  private readonly expenses = inject(ExpensesService);
  private readonly router = inject(Router);
  private readonly toast = inject(IsumiToastService);

  readonly rooms = signal<ExpenseRoomSummary[]>([]);
  readonly roomName = signal("");
  readonly loading = signal(false);
  readonly saving = signal(false);

  ngOnInit(): void {
    this.loadRooms();
  }

  loadRooms(): void {
    this.loading.set(true);

    this.expenses.listRooms().subscribe({
      next: (rooms) => this.rooms.set(rooms),
      error: () => this.toast.error("Não foi possível carregar suas salas.", { id: "expense-rooms-load-error" }),
      complete: () => this.loading.set(false)
    });
  }

  createRoom(): void {
    this.saving.set(true);

    this.expenses.createRoom({ name: this.roomName().trim() || "Nova divisão" }).subscribe({
      next: (detail) => {
        this.roomName.set("");
        void this.router.navigate(["/tools/expenses", detail.room.id, "room"]);
      },
      error: () => this.toast.error("Não foi possível criar a sala.", { id: "expense-rooms-create-error" }),
      complete: () => this.saving.set(false)
    });
  }
}
