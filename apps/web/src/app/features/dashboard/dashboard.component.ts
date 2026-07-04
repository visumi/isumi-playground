import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { LucideEye, LucideEyeOff, LucideRefreshCw } from "@lucide/angular";
import { DashboardSummary } from "../../core/api/api.types";
import { DashboardService } from "../../core/api/dashboard.service";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiButtonComponent, IsumiPageHeaderComponent } from "../../shared/ui";
import { DashboardExpenseDebtsComponent } from "./dashboard-expense-debts.component";
import { DashboardMonthlyCardComponent } from "./dashboard-monthly-card.component";
import { DashboardSkeletonComponent } from "./dashboard-skeleton.component";
import { DashboardUpcomingTripsComponent } from "./dashboard-upcoming-trips.component";

@Component({
  selector: "isumi-dashboard",
  standalone: true,
  imports: [
    DashboardExpenseDebtsComponent,
    DashboardMonthlyCardComponent,
    DashboardSkeletonComponent,
    DashboardUpcomingTripsComponent,
    IsumiButtonComponent,
    IsumiPageHeaderComponent,
    LucideEye,
    LucideEyeOff,
    LucideRefreshCw
  ],
  templateUrl: "./dashboard.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly valuesHidden = signal(localStorage.getItem("isumi.dashboard.valuesHidden") === "1");

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.dashboard.getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        }
      });
  }

  toggleValues(): void {
    this.valuesHidden.update((hidden) => {
      const next = !hidden;
      localStorage.setItem("isumi.dashboard.valuesHidden", next ? "1" : "0");
      return next;
    });
  }
}
