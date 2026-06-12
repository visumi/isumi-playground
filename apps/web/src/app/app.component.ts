import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from "@angular/core";
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterOutlet } from "@angular/router";
import { Subscription } from "rxjs";
import { IsumiModalHostComponent, IsumiToastHostComponent } from "./shared/ui";

@Component({
  selector: "isumi-root",
  standalone: true,
  imports: [IsumiModalHostComponent, IsumiToastHostComponent, RouterOutlet],
  template: `
    @if (initialLoading()) {
      <div class="global-app-loading" role="status" aria-label="Carregando playground">
        <div class="global-app-loading__logo" aria-hidden="true">泉</div>
        <div class="global-app-loading__bar" aria-hidden="true">
          <span></span>
        </div>
      </div>
    }
    <router-outlet />
    <isumi-modal-host />
    <isumi-toast-host />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly routerEvents: Subscription;
  private hideLoadingFrame = 0;
  readonly initialLoading = signal(true);

  constructor() {
    this.routerEvents = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.hideAfterPaint();
      }
    });
  }

  ngOnDestroy(): void {
    this.routerEvents.unsubscribe();
    cancelAnimationFrame(this.hideLoadingFrame);
  }

  private hideAfterPaint(): void {
    cancelAnimationFrame(this.hideLoadingFrame);
    this.hideLoadingFrame = requestAnimationFrame(() => {
      this.hideLoadingFrame = requestAnimationFrame(() => this.initialLoading.set(false));
    });
  }
}
