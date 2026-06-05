import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
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
    expect(entry.injector.get(ISUMI_MODAL_DATA)).toEqual({ title: "Confirmar" });
    expect(entry.injector.get(ISUMI_MODAL_REF)).toBe(ref);
  });

  it("emits the result when a modal closes", (done) => {
    const ref = service.open<ExampleModalComponent, { title: string }, string>(ExampleModalComponent);

    ref.afterClosed().subscribe((result) => {
      expect(result).toBe("salvo");
      expect(service.entries()).toEqual([]);
      done();
    });

    ref.close("salvo");
  });
});
