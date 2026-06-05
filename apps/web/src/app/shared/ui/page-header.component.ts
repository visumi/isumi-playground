import { ChangeDetectionStrategy, Component, input } from "@angular/core";

@Component({
  selector: "isumi-page-header",
  standalone: true,
  template: `
    <header class="flex items-end justify-between gap-6 border-b border-border pb-6 max-md:flex-col max-md:items-start">
      <div>
        @if (eyebrow()) {
          <p class="mb-2 text-sm font-extrabold text-primary">{{ eyebrow() }}</p>
        }
        <h1 class="m-0 text-[2.35rem] font-black leading-[1.04] tracking-[-0.035em] text-balance max-sm:text-[2rem]" [id]="titleId()">{{ title() }}</h1>
      </div>

      @if (description()) {
        <span class="max-w-[32ch] text-sm leading-6 text-muted-foreground">{{ description() }}</span>
      }

      <ng-content select="[actions]" />
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiPageHeaderComponent {
  readonly eyebrow = input<string>();
  readonly title = input.required<string>();
  readonly titleId = input<string>();
  readonly description = input<string>();
}
