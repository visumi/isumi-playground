import { Directive, ElementRef, Input, OnChanges, OnInit, Renderer2, inject } from "@angular/core";
import { splitClasses } from "./class-list";

export type IsumiInputSize = "sm" | "md";

const BASE_CLASSES = "w-full rounded-sm border border-input bg-zinc-950/50 text-foreground transition-colors placeholder:text-muted-foreground hover:border-ring/60 focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60";

const SIZE_CLASSES: Record<IsumiInputSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-3 py-3"
};

@Directive({
  selector: "input[isumiInput], textarea[isumiInput]",
  standalone: true
})
export class IsumiInputDirective implements OnChanges, OnInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private appliedClasses: string[] = [];

  @Input() size: IsumiInputSize = "md";

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

    const resizeClass = this.element.nativeElement.tagName.toLowerCase() === "textarea" ? "resize-y" : "";
    this.appliedClasses = splitClasses(`${BASE_CLASSES} ${SIZE_CLASSES[this.size]} ${resizeClass}`);

    for (const className of this.appliedClasses) {
      this.renderer.addClass(this.element.nativeElement, className);
    }
  }
}
