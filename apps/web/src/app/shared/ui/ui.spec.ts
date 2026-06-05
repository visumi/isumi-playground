import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { IsumiAlertComponent } from "./alert.component";
import { IsumiButtonComponent } from "./button.component";
import { IsumiInputDirective } from "./input.directive";
import { IsumiSkeletonComponent } from "./skeleton.component";

@Component({
  standalone: true,
  imports: [IsumiAlertComponent, IsumiButtonComponent, IsumiInputDirective, IsumiSkeletonComponent],
  template: `
    <isumi-button variant="secondary" size="sm" disabled>
      <span icon data-testid="icon"></span>
      Atualizar
    </isumi-button>
    <isumi-button loading>Salvar</isumi-button>
    <isumi-button iconOnly ariaLabel="Sair">
      <span icon data-testid="logout-icon"></span>
      Sair
    </isumi-button>
    <input isumiInput name="title" maxlength="120" autocomplete="off" placeholder="Titulo">
    <textarea isumiInput rows="4"></textarea>
    <isumi-alert>Falha ao salvar.</isumi-alert>
    <isumi-skeleton label="Carregando notas" />
  `
})
class UiSpecHostComponent {}

describe("shared ui", () => {
  let fixture: ComponentFixture<UiSpecHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UiSpecHostComponent]
    });

    fixture = TestBed.createComponent(UiSpecHostComponent);
    fixture.detectChanges();
  });

  it("applies button variant and size classes while preserving native disabled state", () => {
    const button = fixture.debugElement.query(By.css("button")).nativeElement as HTMLButtonElement;

    expect(button.disabled).toBeTrue();
    expect(button.classList).toContain("bg-secondary");
    expect(button.classList).toContain("text-secondary-foreground");
    expect(button.classList).toContain("min-h-9");
    expect(button.classList).toContain("disabled:cursor-not-allowed");
    expect(button.classList).toContain("disabled:opacity-40");
  });

  it("shows a loading state and hides projected icons while busy", () => {
    const buttons = fixture.debugElement.queryAll(By.css("button"));
    const loadingButton = buttons[1].nativeElement as HTMLButtonElement;

    expect(loadingButton.disabled).toBeTrue();
    expect(loadingButton.getAttribute("aria-busy")).toBe("true");
    expect(loadingButton.querySelector(".animate-spin")).not.toBeNull();
    expect(loadingButton.querySelector("[data-testid='icon']")).toBeNull();
  });

  it("supports icon-only buttons with accessible labels", () => {
    const buttons = fixture.debugElement.queryAll(By.css("button"));
    const iconButton = buttons[2].nativeElement as HTMLButtonElement;

    expect(iconButton.getAttribute("aria-label")).toBe("Sair");
    expect(iconButton.textContent?.trim()).toBe("");
    expect(iconButton.classList).toContain("size-10");
    expect(iconButton.querySelector("[data-testid='logout-icon']")).not.toBeNull();
  });

  it("styles native inputs without removing their HTML attributes", () => {
    const input = fixture.debugElement.query(By.css("input")).nativeElement as HTMLInputElement;
    const textarea = fixture.debugElement.query(By.css("textarea")).nativeElement as HTMLTextAreaElement;

    expect(input.maxLength).toBe(120);
    expect(input.autocomplete).toBe("off");
    expect(input.classList).toContain("border-input");
    expect(input.classList).toContain("focus-visible:ring-0");
    expect(textarea.rows).toBe(4);
    expect(textarea.classList).toContain("resize-y");
  });

  it("marks error alerts for assistive technology", () => {
    const alert = fixture.debugElement.query(By.css("isumi-alert")).nativeElement as HTMLElement;

    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.classList).toContain("bg-destructive/15");
  });

  it("exposes skeleton loading labels when provided", () => {
    const skeleton = fixture.debugElement.query(By.css("isumi-skeleton")).nativeElement as HTMLElement;

    expect(skeleton.getAttribute("aria-label")).toBe("Carregando notas");
    expect(skeleton.getAttribute("aria-hidden")).toBeNull();
  });
});
