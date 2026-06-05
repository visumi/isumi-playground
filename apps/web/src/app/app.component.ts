import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { IsumiModalHostComponent } from "./shared/ui";

@Component({
  selector: "isumi-root",
  standalone: true,
  imports: [IsumiModalHostComponent, RouterOutlet],
  template: `
    <router-outlet />
    <isumi-modal-host />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}
