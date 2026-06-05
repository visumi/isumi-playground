import { ChangeDetectionStrategy, Component, input } from "@angular/core";

@Component({
  selector: "isumi-empty-state",
  standalone: true,
  host: {
    class: "block rounded-md border-2 border-dashed border-border bg-secondary p-5 text-muted-foreground items-center flex flex-col text-center"
  },
  template: `
    <h2 class="mb-2 mt-0 text-lg font-medium text-foreground">{{ title() }}</h2>
    <p class="m-0 max-w-[58ch] text-sm leading-6">{{ description() }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiEmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
}
