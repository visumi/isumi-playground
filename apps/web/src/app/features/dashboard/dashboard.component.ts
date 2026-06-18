import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { LucideArrowRight, LucideScale, LucideUsers, LucideSheet, LucideUserRound } from "@lucide/angular";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiPageHeaderComponent, IsumiTagComponent } from "../../shared/ui";

@Component({
  selector: "isumi-dashboard",
  standalone: true,
  imports: [IsumiPageHeaderComponent, IsumiTagComponent, LucideArrowRight, LucideUserRound, LucideScale, LucideUsers, LucideSheet, RouterLink],
  templateUrl: "./dashboard.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
}
