import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { IsumiAvatarGroupComponent } from "./avatar-group.component";

@Component({
  standalone: true,
  imports: [IsumiAvatarGroupComponent],
  template: `
    <isumi-avatar-group
      ariaLabel="Participantes da sala"
      [items]="participants"
      [maxVisible]="4"
    />
  `
})
class AvatarGroupHostComponent {
  participants = [
    { id: "1", name: "Ana Maria" },
    { id: "2", name: "Bruno", picture: "https://example.com/bruno.png" },
    { id: "3", name: "Caio" },
    { id: "4", name: "Duda" },
    { id: "5", name: "Eva" }
  ];
}

describe("IsumiAvatarGroupComponent", () => {
  let fixture: ComponentFixture<AvatarGroupHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AvatarGroupHostComponent]
    });
    fixture = TestBed.createComponent(AvatarGroupHostComponent);
    fixture.detectChanges();
  });

  it("renders the configured visible avatars", () => {
    const avatars = fixture.debugElement.queryAll(By.css("isumi-avatar"));

    expect(avatars.length).toBe(4);
    expect(fixture.nativeElement.textContent).toContain("AM");
  });

  it("stacks later avatars below the previous avatar", () => {
    const avatars = fixture.debugElement.queryAll(By.css("isumi-avatar"));
    const penultimate = avatars[2].nativeElement as HTMLElement;
    const last = avatars[3].nativeElement as HTMLElement;

    expect(Number(last.style.zIndex)).toBeLessThan(Number(penultimate.style.zIndex));
  });

  it("renders an ellipsis avatar when participants overflow", () => {
    const overflow = fixture.debugElement.query(By.css("span[role='listitem']")).nativeElement as HTMLElement;

    expect(overflow.querySelector("svg")).not.toBeNull();
    expect(overflow.textContent?.trim()).toBe("");
    expect(overflow.getAttribute("aria-label")).toBe("Mais 1 participante");
    expect(overflow.style.zIndex).toBe("1");
  });

  it("uses the custom aria label for the group", () => {
    const group = fixture.debugElement.query(By.css("[role='list']")).nativeElement as HTMLElement;

    expect(group.getAttribute("aria-label")).toBe("Participantes da sala");
  });
});
