import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiToastService } from "../../shared/ui";

@Component({
  selector: "isumi-login",
  standalone: true,
  templateUrl: "./login.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(IsumiToastService);
  readonly error = computed(() => this.auth.authError());
  readonly loading = signal(false);
  private readonly authErrorToast = effect(() => {
    const error = this.error();

    if (error) {
      this.toast.error(error, { id: "login-auth-error" });
    }
  });

  async login(): Promise<void> {
    this.loading.set(true);
    try {
      await this.auth.login(this.route.snapshot.queryParamMap.get("returnUrl") || "/dashboard");
    } finally {
      this.loading.set(false);
    }
  }
}
