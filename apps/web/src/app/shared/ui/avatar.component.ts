import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

export type IsumiAvatarSize = "sm" | "md" | "lg";

@Component({
  selector: "isumi-avatar",
  standalone: true,
  template: `
    <span [class]="avatarClasses()" [attr.title]="name()">
      @if (src()) {
        <img class="size-full rounded-full object-cover" [src]="src()!" [alt]="name() || 'Avatar'" referrerpolicy="no-referrer">
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

    return `inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-extrabold text-secondary-foreground ring-1 ring-border ${sizes[this.size()]}`;
  });
}
