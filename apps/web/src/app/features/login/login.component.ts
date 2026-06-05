import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { AuthService } from "../../core/auth/auth.service";

@Component({
  selector: "isumi-login",
  standalone: true,
  templateUrl: "./login.component.html",
  styleUrl: "./login.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  readonly error = computed(() => this.auth.authError());
  readonly loading = signal(false);

  async login(): Promise<void> {
    this.loading.set(true);
    try {
      await this.auth.login();
    } finally {
      this.loading.set(false);
    }
  }
}
