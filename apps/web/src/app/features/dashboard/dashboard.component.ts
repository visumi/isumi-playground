import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { LucideArrowRight, LucideReceiptText } from "@lucide/angular";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiBadgeComponent, IsumiCardComponent, IsumiPageHeaderComponent } from "../../shared/ui";

@Component({
  selector: "isumi-dashboard",
  standalone: true,
  imports: [IsumiBadgeComponent, IsumiCardComponent, IsumiPageHeaderComponent, LucideArrowRight, LucideReceiptText, RouterLink],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
}
