import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from "@angular/core";
import { LucideScale, LucideLayoutDashboard, LucideLogOut, LucideSheet, LucideShieldCheck } from "@lucide/angular";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiAvatarComponent, IsumiButtonComponent, IsumiNavItemDirective } from "../../shared/ui";
import { environment } from "../../../environments/environment";

@Component({
  selector: "isumi-shell",
  standalone: true,
  imports: [IsumiAvatarComponent, IsumiButtonComponent, IsumiNavItemDirective, LucideScale, LucideLayoutDashboard, LucideLogOut, LucideSheet, LucideShieldCheck, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./shell.component.html",
  styleUrl: "./shell.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly appVersion = environment.appVersion;
  readonly accountMenuOpen = signal(false);

  @HostListener("document:click")
  closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  @HostListener("document:keydown.escape")
  closeAccountMenuFromEscape(): void {
    this.accountMenuOpen.set(false);
  }

  toggleAccountMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.accountMenuOpen.update((open) => !open);
  }

  logout(): void {
    this.accountMenuOpen.set(false);
    this.auth.logout();
  }
}
