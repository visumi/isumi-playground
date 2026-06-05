import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { LucideReceiptText, LucideLayoutDashboard, LucideLogOut } from "@lucide/angular";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiAvatarComponent, IsumiButtonComponent, IsumiNavItemDirective } from "../../shared/ui";

@Component({
  selector: "isumi-shell",
  standalone: true,
  imports: [IsumiAvatarComponent, IsumiButtonComponent, IsumiNavItemDirective, LucideReceiptText, LucideLayoutDashboard, LucideLogOut, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./shell.component.html",
  styleUrl: "./shell.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShellComponent {
  readonly auth = inject(AuthService);
}
