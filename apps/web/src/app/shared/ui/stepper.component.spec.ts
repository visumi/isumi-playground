import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { LucideRoute } from "@lucide/angular";
import { IsumiStepItem, IsumiStepperComponent } from "./stepper.component";

@Component({
  standalone: true,
  imports: [IsumiStepperComponent, LucideRoute],
  template: `
    <isumi-stepper
      ariaLabel="Etapas do cadastro"
      [steps]="steps()"
      [activeStepId]="activeStepId()"
      [disabled]="disabled()"
      (stepSelected)="selectedStepId.set($event)"
    />
  `
})
class StepperHostComponent {
  readonly activeStepId = signal("dados");
  readonly disabled = signal(false);
  readonly selectedStepId = signal<string | null>(null);
  readonly steps = signal<IsumiStepItem[]>([
    { id: "dados", label: "Dados", description: "Informações", icon: LucideRoute },
    { id: "revisao", label: "Revisão", description: "Conferir", state: "pending" },
    { id: "salvo", label: "Salvo", description: "Finalizado", state: "complete" },
    { id: "restrito", label: "Restrito", description: "Sem acesso", state: "locked" }
  ]);
}

describe("IsumiStepperComponent", () => {
  let fixture: ComponentFixture<StepperHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StepperHostComponent]
    });
    fixture = TestBed.createComponent(StepperHostComponent);
    fixture.detectChanges();
  });

  it("renders step labels, descriptions, and the active aria-current state", () => {
    const host = fixture.debugElement.query(By.css("isumi-stepper")).nativeElement as HTMLElement;
    const buttons = fixture.debugElement.queryAll(By.css("button"));

    expect(host.textContent).toContain("Dados");
    expect(host.textContent).toContain("Informações");
    expect(host.textContent).toContain("Revisão");
    expect(buttons[0].nativeElement.getAttribute("aria-current")).toBe("step");
  });

  it("emits the selected step id for selectable steps", () => {
    const buttons = fixture.debugElement.queryAll(By.css("button"));

    buttons[1].nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedStepId()).toBe("revisao");
  });

  it("does not emit for locked steps", () => {
    const buttons = fixture.debugElement.queryAll(By.css("button"));

    buttons[3].nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedStepId()).toBeNull();
  });

  it("does not emit while disabled", () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    const buttons = fixture.debugElement.queryAll(By.css("button"));

    buttons[1].nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedStepId()).toBeNull();
  });
});
