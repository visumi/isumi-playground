import { ChangeDetectionStrategy, Component, input } from "@angular/core";

@Component({
  selector: "isumi-skeleton",
  standalone: true,
  host: {
    class: "block min-h-48 animate-pulse rounded-md bg-muted",
    "[attr.aria-label]": "label()",
    "[attr.aria-hidden]": "label() ? null : true"
  },
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiSkeletonComponent {
  readonly label = input<string>();
}
