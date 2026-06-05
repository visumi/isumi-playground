import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";

@Component({
  selector: "isumi-shell",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./shell.component.html",
  styleUrl: "./shell.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShellComponent {
  readonly auth = inject(AuthService);
}
