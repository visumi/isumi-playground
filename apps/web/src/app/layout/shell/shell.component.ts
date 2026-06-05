import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { LucideBookOpen, LucideHome, LucideLogOut } from "@lucide/angular";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";

@Component({
  selector: "isumi-shell",
  standalone: true,
  imports: [LucideBookOpen, LucideHome, LucideLogOut, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./shell.component.html",
  styleUrl: "./shell.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShellComponent {
  readonly auth = inject(AuthService);
}
