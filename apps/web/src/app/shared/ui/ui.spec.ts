import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { IsumiButtonComponent } from "./button.component";
import { IsumiEmptyStateComponent } from "./empty-state.component";
import { IsumiInputDirective } from "./input.directive";
import { IsumiSelectDirective } from "./select.directive";
import { IsumiTagComponent } from "./tag.component";
import { IsumiTooltipComponent } from "./tooltip.component";

@Component({
  standalone: true,
  imports: [IsumiButtonComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiSelectDirective, IsumiTagComponent, IsumiTooltipComponent],
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
    <isumi-button variant="ghost-destructive">Remover</isumi-button>
    <isumi-button variant="destructive">Excluir</isumi-button>
    <input isumiInput name="title" maxlength="120" autocomplete="off" placeholder="Titulo">
    <textarea isumiInput rows="4"></textarea>
    <select isumiSelect name="kind">
      <option value="one">Um</option>
    </select>
    <isumi-empty-state title="Nada aqui" description="Crie um item.">
      <span icon data-testid="empty-icon"></span>
    </isumi-empty-state>
    <isumi-tag tone="primary">
      <span icon data-testid="tag-icon"></span>
      Junho 2026
    </isumi-tag>
    <isumi-tag tone="emerald" size="small">
      <span icon data-testid="small-tag-icon"></span>
      Ativo
    </isumi-tag>
    <isumi-tooltip label="Texto simples">
      <button type="button" data-testid="simple-tooltip-trigger">Ação</button>
    </isumi-tooltip>
    <isumi-tooltip>
      <button type="button" data-testid="custom-tooltip-trigger">Adicionar gasto</button>
      <span tooltip data-testid="custom-tooltip-content">
        <span>Atalho</span>
        <kbd>Alt</kbd>
        <span>+</span>
        <kbd>N</kbd>
      </span>
    </isumi-tooltip>
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

  it("supports ghost destructive buttons", () => {
    const buttons = fixture.debugElement.queryAll(By.css("button"));
    const button = buttons[3].nativeElement as HTMLButtonElement;

    expect(button.classList).toContain("bg-transparent");
    expect(button.classList).toContain("hover:bg-red-700");
    expect(button.classList).toContain("hover:text-white");
  });

  it("supports filled destructive buttons with consistent foreground color", () => {
    const buttons = fixture.debugElement.queryAll(By.css("button"));
    const button = buttons[4].nativeElement as HTMLButtonElement;

    expect(button.classList).toContain("bg-destructive");
    expect(button.classList).toContain("text-white");
    expect(button.classList).toContain("hover:bg-red-700");
    expect(button.classList).toContain("hover:text-white");
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

  it("styles native selects without replacing the native control", () => {
    const select = fixture.debugElement.query(By.css("select")).nativeElement as HTMLSelectElement;

    expect(select.name).toBe("kind");
    expect(select.options.length).toBe(1);
    expect(select.classList).toContain("border-input");
    expect(select.classList).toContain("focus-visible:ring-0");
  });

  it("projects custom empty state icons above the text", () => {
    const emptyState = fixture.debugElement.query(By.css("isumi-empty-state")).nativeElement as HTMLElement;

    expect(emptyState.querySelector("[data-testid='empty-icon']")).not.toBeNull();
    expect(emptyState.textContent).toContain("Nada aqui");
  });

  it("supports icons inside tags without losing the label", () => {
    const tag = fixture.debugElement.query(By.css("isumi-tag")).nativeElement as HTMLElement;

    expect(tag.querySelector("[data-testid='tag-icon']")).not.toBeNull();
    expect(tag.textContent).toContain("Junho 2026");
    expect(tag.classList).toContain("gap-1.5");
    expect(tag.classList).toContain("uppercase");
    expect(tag.classList).toContain("[&_[icon]]:size-3.5");
  });

  it("supports small tags without changing the default size", () => {
    const tags = fixture.debugElement.queryAll(By.css("isumi-tag"));
    const defaultTag = tags[0].nativeElement as HTMLElement;
    const smallTag = tags[1].nativeElement as HTMLElement;

    expect(defaultTag.classList).toContain("px-2.5");
    expect(defaultTag.classList).toContain("[&_[icon]]:size-3.5");
    expect(smallTag.classList).toContain("px-2");
    expect(smallTag.classList).toContain("text-[0.6875rem]");
    expect(smallTag.classList).toContain("[&_[icon]]:size-3");
    expect(smallTag.textContent).toContain("Ativo");
  });

  it("supports simple and custom tooltip content", () => {
    const tooltipHosts = fixture.debugElement.queryAll(By.css("isumi-tooltip"));
    const simpleTooltip = tooltipHosts[0].nativeElement as HTMLElement;
    const customTooltip = tooltipHosts[1].nativeElement as HTMLElement;

    expect(simpleTooltip.querySelector("[role='tooltip']")?.textContent).toContain("Texto simples");
    expect(simpleTooltip.querySelector("[data-testid='simple-tooltip-trigger']")).not.toBeNull();
    expect(customTooltip.querySelector("[role='tooltip']")?.textContent).toContain("Alt");
    expect(customTooltip.querySelector("[role='tooltip']")?.querySelector("[data-testid='custom-tooltip-content']")).not.toBeNull();
    expect(customTooltip.querySelector("[data-testid='custom-tooltip-trigger']")).not.toBeNull();
  });
});
