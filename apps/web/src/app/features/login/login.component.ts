import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiAlertComponent } from "../../shared/ui";

@Component({
  selector: "isumi-login",
  standalone: true,
  imports: [IsumiAlertComponent],
  templateUrl: "./login.component.html",
  styleUrl: "./login.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly error = computed(() => this.auth.authError());
  readonly loading = signal(false);

  async login(): Promise<void> {
    this.loading.set(true);
    try {
      await this.auth.login(this.route.snapshot.queryParamMap.get("returnUrl") || "/dashboard");
    } finally {
      this.loading.set(false);
    }
  }
}
