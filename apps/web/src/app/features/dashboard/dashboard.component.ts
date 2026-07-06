import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { LucideArrowRight, LucideRoute, LucideScale, LucideSheet } from "@lucide/angular";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiPageHeaderComponent } from "../../shared/ui";

@Component({
  selector: "isumi-dashboard",
  standalone: true,
  imports: [IsumiPageHeaderComponent, LucideArrowRight, LucideRoute, LucideScale, LucideSheet, RouterLink],
  templateUrl: "./dashboard.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
}
