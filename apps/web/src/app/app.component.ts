import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { IsumiModalHostComponent, IsumiToastHostComponent } from "./shared/ui";

@Component({
  selector: "isumi-root",
  standalone: true,
  imports: [IsumiModalHostComponent, IsumiToastHostComponent, RouterOutlet],
  template: `
    <router-outlet />
    <isumi-modal-host />
    <isumi-toast-host />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}
