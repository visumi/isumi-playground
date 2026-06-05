import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";

@Component({
  selector: "isumi-dashboard",
  standalone: true,
  imports: [RouterLink],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
}
