import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from "@angular/core";

export type IsumiAvatarSize = "sm" | "md" | "lg";

@Component({
  selector: "isumi-avatar",
  standalone: true,
  template: `
    <span [class]="avatarClasses()" [attr.title]="name()">
      @if (src()) {
        <img class="size-full rounded-full object-cover" [src]="src()!" [alt]="name() || 'Avatar'" referrerpolicy="no-referrer">
      } @else if (icon()) {
        <ng-content />
      } @else {
        <span aria-hidden="true">{{ initials() }}</span>
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiAvatarComponent {
  readonly src = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>(null);
  readonly size = input<IsumiAvatarSize>("md");
  readonly icon = input(false, { transform: booleanAttribute });

  readonly initials = computed(() => {
    const name = this.name()?.trim();

    if (!name) {
      return "?";
    }

    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();
  });

  readonly avatarClasses = computed(() => {
    const sizes: Record<IsumiAvatarSize, string> = {
      sm: "size-7 text-[0.7rem]",
      md: "size-8 text-xs",
      lg: "size-10 text-sm"
    };

    const tone = this.icon()
      ? "bg-primary/10 text-primary ring-1 ring-primary"
      : "bg-secondary text-secondary-foreground ring-1 ring-border";

    return `inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-extrabold ${tone} ${sizes[this.size()]}`;
  });
}
