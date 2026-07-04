import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

@Component({
  selector: "isumi-dashboard-sensitive-value",
  standalone: true,
  template: `
    <span [class]="valueClasses()">{{ displayValue() }}</span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardSensitiveValueComponent {
  readonly amountCents = input.required<number>();
  readonly hidden = input(false);
  readonly size = input<"xs" | "sm" | "md" | "lg">("md");
  readonly tone = input<"default" | "positive" | "negative">("default");

  readonly displayValue = computed(() => this.hidden() ? "R$ ••••" : formatMoney(this.amountCents()));
  readonly valueClasses = computed(() => {
    const sizes = {
      xs: "text-sm font-bold",
      sm: "text-sm font-black",
      md: "text-[1.05rem] font-black",
      lg: "text-[1.85rem] font-black leading-none max-sm:text-[1.55rem]"
    };
    const tones = {
      default: "text-foreground",
      positive: "text-emerald-300",
      negative: "text-red-200"
    };

    return `${sizes[this.size()]} ${tones[this.tone()]}`;
  });
}

export function formatMoney(amountCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(amountCents / 100);
}
