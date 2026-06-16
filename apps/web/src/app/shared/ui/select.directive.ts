import { Directive, ElementRef, Input, OnChanges, OnInit, Renderer2, inject } from "@angular/core";
import { splitClasses } from "./class-list";

export type IsumiSelectSize = "sm" | "md";

const BASE_CLASSES = "w-full cursor-pointer appearance-none rounded-sm border border-input bg-zinc-950/50 pr-10 text-foreground scheme-dark transition-colors hover:border-ring/60 focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-zinc-900 [&>option]:text-zinc-100";

const SIZE_CLASSES: Record<IsumiSelectSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-3 py-3"
};

@Directive({
  selector: "select[isumiSelect]",
  standalone: true
})
export class IsumiSelectDirective implements OnChanges, OnInit {
  private readonly element = inject<ElementRef<HTMLSelectElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private appliedClasses: string[] = [];

  @Input() size: IsumiSelectSize = "md";

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

    this.appliedClasses = splitClasses(`${BASE_CLASSES} ${SIZE_CLASSES[this.size]}`);
    this.renderer.setStyle(this.element.nativeElement, "background-image", "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")");
    this.renderer.setStyle(this.element.nativeElement, "background-position", "right 0.75rem center");
    this.renderer.setStyle(this.element.nativeElement, "background-repeat", "no-repeat");
    this.renderer.setStyle(this.element.nativeElement, "background-size", "1rem");

    for (const className of this.appliedClasses) {
      this.renderer.addClass(this.element.nativeElement, className);
    }
  }
}
