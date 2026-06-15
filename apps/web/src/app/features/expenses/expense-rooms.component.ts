import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { LucideArrowRight, LucideCalendar, LucideHash, LucidePlus, LucideReceiptText, LucideWalletCards } from "@lucide/angular";
import { ExpensesService } from "../../core/api/expenses.service";
import { ExpenseRoom } from "../../core/api/api.types";
import { IsumiAlertComponent, IsumiBadgeComponent, IsumiButtonComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent } from "../../shared/ui";

@Component({
  selector: "isumi-expense-rooms",
  standalone: true,
  imports: [DatePipe, FormsModule, IsumiAlertComponent, IsumiButtonComponent, IsumiBadgeComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent, LucideArrowRight, LucideCalendar, LucideHash, LucidePlus, LucideReceiptText, LucideWalletCards, RouterLink],
  templateUrl: "./expense-rooms.component.html",
  styleUrl: "./expense-rooms.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseRoomsComponent implements OnInit {
  private readonly expenses = inject(ExpensesService);
  private readonly router = inject(Router);

  readonly rooms = signal<ExpenseRoom[]>([]);
  readonly roomName = signal("");
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRooms();
  }

  loadRooms(): void {
    this.loading.set(true);
    this.error.set(null);

    this.expenses.listRooms().subscribe({
      next: (rooms) => this.rooms.set(rooms),
      error: () => this.error.set("Nao foi possivel carregar suas salas."),
      complete: () => this.loading.set(false)
    });
  }

  createRoom(): void {
    this.saving.set(true);
    this.error.set(null);

    this.expenses.createRoom({ name: this.roomName().trim() || "Nova divisão" }).subscribe({
      next: (detail) => {
        this.roomName.set("");
        void this.router.navigate(["/tools/expenses", detail.room.id, "room"]);
      },
      error: () => this.error.set("Nao foi possivel criar a sala."),
      complete: () => this.saving.set(false)
    });
  }
}
