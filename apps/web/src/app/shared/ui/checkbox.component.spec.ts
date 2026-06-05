import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { IsumiCheckboxComponent } from "./checkbox.component";

@Component({
  standalone: true,
  imports: [IsumiCheckboxComponent],
  template: `
    <isumi-checkbox [checked]="checked()" ariaLabel="Marcar acerto" (checkedChange)="checked.set($event)">
      Pago
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
});
