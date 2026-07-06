import { Component } from "@angular/core";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ISUMI_MODAL_DATA, ISUMI_MODAL_REF, IsumiModalService, injectIsumiModalData, injectIsumiModalRef } from "./modal.service";

@Component({
  standalone: true,
  template: ""
})
class ExampleModalComponent {
  readonly data = injectIsumiModalData<{ title: string }>();
  readonly modalRef = injectIsumiModalRef<{ title: string }, string>();
}

describe("IsumiModalService", () => {
  let service: IsumiModalService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(IsumiModalService);
  });

  afterEach(() => {
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  it("opens a modal entry with data and an injectable modal ref", () => {
    const ref = service.open<ExampleModalComponent, { title: string }, string>(ExampleModalComponent, {
      data: { title: "Confirmar" },
      ariaLabel: "Confirmacao",
      panelClass: "max-w-sm",
      closeOnBackdrop: false
    });
    const entry = service.entries()[0];

    expect(service.hasOpenModals()).toBeTrue();
    expect(entry.component).toBe(ExampleModalComponent);
    expect(entry.ariaLabel).toBe("Confirmacao");
    expect(entry.panelClass).toBe("max-w-sm");
    expect(entry.closeOnBackdrop).toBeFalse();
    expect(entry.closing).toBeFalse();
    expect(entry.injector.get(ISUMI_MODAL_DATA)).toEqual({ title: "Confirmar" });
    expect(entry.injector.get(ISUMI_MODAL_REF)).toBe(ref);
  });

  it("emits the result after the close animation finishes", fakeAsync(() => {
    const ref = service.open<ExampleModalComponent, { title: string }, string>(ExampleModalComponent);
    let closedResult: string | undefined;

    ref.afterClosed().subscribe((result) => {
      closedResult = result;
    });

    ref.close("salvo");
    expect(service.entries()[0].closing).toBeTrue();
    expect(closedResult).toBeUndefined();

    tick(220);

    expect(closedResult).toBe("salvo");
    expect(service.entries()).toEqual([]);
  }));

  it("locks page scroll while a modal is open and restores it after closing", fakeAsync(() => {
    const scrollTo = spyOn(window, "scrollTo");
    const ref = service.open<ExampleModalComponent, { title: string }, string>(ExampleModalComponent);

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.width).toBe("100%");

    ref.close();
    tick(220);

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.style.width).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, jasmine.any(Number));
  }));

  it("keeps the modal open and exposes processing while submitting", fakeAsync(() => {
    let finishSubmit: (() => void) | undefined;
    const onSubmit = jasmine.createSpy("onSubmit").and.returnValue(new Promise<void>((resolve) => {
      finishSubmit = resolve;
    }));
    const ref = service.open<ExampleModalComponent, { title: string }, string>(ExampleModalComponent, {
      onSubmit
    });

    void ref.submit("salvo");

    expect(ref.processing()).toBeTrue();
    expect(service.entries()[0].closing).toBeFalse();

    finishSubmit?.();
    tick();

    expect(ref.processing()).toBeFalse();
    expect(service.entries()[0].closing).toBeTrue();
    tick(220);
    expect(service.entries()).toEqual([]);
  }));

  it("keeps the modal open when submission fails", fakeAsync(() => {
    const ref = service.open<ExampleModalComponent, { title: string }, string>(ExampleModalComponent, {
      onSubmit: async () => {
        throw new Error("Falha");
      }
    });

    void ref.submit("salvo");
    tick();

    expect(ref.processing()).toBeFalse();
    expect(service.entries()[0].closing).toBeFalse();
  }));
});
