import { ChangeDetectionStrategy, Component, HostBinding, input } from "@angular/core";

export type IsumiAlertVariant = "error";

@Component({
  selector: "isumi-alert",
  standalone: true,
  host: {
    class: "block rounded-sm bg-destructive/15 px-4 py-3 text-sm font-semibold text-destructive"
  },
  template: "<ng-content />",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiAlertComponent {
  readonly variant = input<IsumiAlertVariant>("error");

  @HostBinding("attr.role")
  get role(): string {
    return this.variant() === "error" ? "alert" : "status";
  }
}
