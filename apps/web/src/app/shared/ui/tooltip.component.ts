import { ChangeDetectionStrategy, Component, input } from "@angular/core";

@Component({
  selector: "isumi-tooltip",
  standalone: true,
  host: {
    class: "group/tooltip relative inline-flex"
  },
  template: `
    <span
      class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 inline-flex max-w-64 -translate-x-1/2 translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-md bg-zinc-950 px-2.5 py-1.5 text-xs font-bold text-zinc-100 opacity-0 shadow-xl shadow-black/30 ring-1 ring-white/10 transition-[opacity,transform] duration-150 ease-out group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:translate-y-0 group-focus-within/tooltip:opacity-100"
      role="tooltip"
    >
      {{ label() }}
      <ng-content select="[tooltip]" />
    </span>
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiTooltipComponent {
  readonly label = input("");
}
