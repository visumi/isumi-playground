import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { IsumiAvatarComponent } from "./avatar.component";

@Component({
  standalone: true,
  imports: [IsumiAvatarComponent],
  template: `
    <isumi-avatar name="Ana Maria" />
    <isumi-avatar name="Bruno" src="https://example.com/bruno.png" />
  `
})
class AvatarHostComponent {}

describe("IsumiAvatarComponent", () => {
  let fixture: ComponentFixture<AvatarHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AvatarHostComponent]
    });
    fixture = TestBed.createComponent(AvatarHostComponent);
    fixture.detectChanges();
  });

  it("uses initials when no image is provided", () => {
    const avatar = fixture.debugElement.query(By.css("isumi-avatar")).nativeElement as HTMLElement;

    expect(avatar.textContent?.trim()).toBe("AM");
  });

  it("renders an image when src is provided", () => {
    const image = fixture.debugElement.query(By.css("img")).nativeElement as HTMLImageElement;

    expect(image.src).toBe("https://example.com/bruno.png");
    expect(image.alt).toBe("Bruno");
  });
});
