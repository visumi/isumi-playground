import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { IsumiCheckboxComponent } from "./checkbox.component";

@Component({
  standalone: true,
  imports: [IsumiCheckboxComponent],
  template: `
    <isumi-checkbox variant="secondary" [checked]="checked()" ariaLabel="Marcar acerto" (checkedChange)="checked.set($event)">
      Pago
    </isumi-checkbox>
    <isumi-checkbox [loading]="true" ariaLabel="Salvando">
      Salvando
    </isumi-checkbox>
  `
})
class CheckboxHostComponent {
  readonly checked = signal(false);
}

describe("IsumiCheckboxComponent", () => {
  let fixture: ComponentFixture<CheckboxHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CheckboxHostComponent]
    });
    fixture = TestBed.createComponent(CheckboxHostComponent);
    fixture.detectChanges();
  });

  it("emits checked changes", () => {
    const input = fixture.debugElement.query(By.css("input")).nativeElement as HTMLInputElement;

    input.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.checked()).toBeTrue();
  });

  it("supports the secondary variant", () => {
    fixture.componentInstance.checked.set(true);
    fixture.detectChanges();

    const box = fixture.debugElement.query(By.css("label > span")).nativeElement as HTMLElement;

    expect(box.className).toContain("bg-background");
  });

  it("shows a loading indicator", () => {
    const spinner = fixture.debugElement.query(By.css(".animate-spin"));

    expect(spinner).not.toBeNull();
  });
});
