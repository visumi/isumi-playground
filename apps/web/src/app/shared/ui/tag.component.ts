import { ChangeDetectionStrategy, Component, ElementRef, OnChanges, OnInit, Renderer2, inject, input } from "@angular/core";
import { splitClasses } from "./class-list";

export type IsumiTagTone = "slate" | "primary" | "secondary" | "red" | "rose" | "amber" | "emerald" | "blue" | "indigo" | "violet" | "pink" | "cyan";

@Component({
  selector: "isumi-tag",
  standalone: true,
  template: `
    <ng-content select="[icon]" />
    <span class="min-w-0 truncate">
      <ng-content />
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiTagComponent implements OnChanges, OnInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private appliedClasses: string[] = [];

  readonly tone = input<IsumiTagTone>("slate");

  ngOnInit(): void {
    this.syncClasses();
  }

  ngOnChanges(): void {
    this.syncClasses();
  }

  private syncClasses(): void {
    for (const className of this.appliedClasses) {
      this.renderer.removeClass(this.element.nativeElement, className);
    }

    const toneClasses: Record<IsumiTagTone, string> = {
      slate: "bg-slate-800/70 text-slate-300",
      primary: "bg-purple-950/55 text-purple-300",
      secondary: "bg-zinc-800/70 text-zinc-300",
      red: "bg-red-950/55 text-red-300",
      rose: "bg-rose-950/55 text-rose-300",
      amber: "bg-amber-950/55 text-amber-300",
      emerald: "bg-emerald-950/55 text-emerald-300",
      blue: "bg-blue-950/55 text-blue-300",
      indigo: "bg-indigo-950/55 text-indigo-300",
      violet: "bg-violet-950/55 text-violet-300",
      pink: "bg-pink-950/55 text-pink-300",
      cyan: "bg-cyan-950/55 text-cyan-300"
    };

    this.appliedClasses = splitClasses(`inline-flex w-fit max-w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold uppercase leading-none [&_[icon]]:size-3.5 [&_[icon]]:shrink-0 ${toneClasses[this.tone()]}`);

    for (const className of this.appliedClasses) {
      this.renderer.addClass(this.element.nativeElement, className);
    }
  }
}
