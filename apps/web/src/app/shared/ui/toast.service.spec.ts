import { fakeAsync, flushMicrotasks, TestBed, tick } from "@angular/core/testing";
import { IsumiToastService } from "./toast.service";

describe("IsumiToastService", () => {
  let service: IsumiToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(IsumiToastService);
  });

  it("creates success toasts with a generated id", () => {
    const id = service.success("Salvo com sucesso");

    expect(id).toBe("toast-1");
    expect(service.hasToasts()).toBeTrue();
    expect(service.toasts()).toEqual([
      jasmine.objectContaining({
        id,
        type: "success",
        message: "Salvo com sucesso",
        visible: true,
        position: "top-center",
        ariaLive: "polite"
      })
    ]);
  });

  it("updates an existing toast when id is reused", () => {
    const id = service.loading("Salvando");

    service.success("Salvo", { id });

    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0]).toEqual(jasmine.objectContaining({ id, type: "success", message: "Salvo" }));
  });

  it("dismisses and removes a toast after its duration", fakeAsync(() => {
    service.show("Copiado", { duration: 100 });

    tick(100);
    expect(service.toasts()[0].visible).toBeFalse();

    tick(240);
    expect(service.toasts()).toEqual([]);
  }));

  it("keeps loading toasts open until dismissed", fakeAsync(() => {
    const id = service.loading("Carregando");

    tick(30000);
    expect(service.toasts().length).toBe(1);

    service.dismiss(id);
    tick(240);
    expect(service.toasts()).toEqual([]);
  }));

  it("maps promise states to loading, success and error toasts", fakeAsync(() => {
    const promise = service.promise(Promise.resolve("ok"), {
      loading: "Salvando",
      success: (value) => `Resultado: ${value}`,
      error: "Falha"
    });

    expect(service.toasts()[0]).toEqual(jasmine.objectContaining({ type: "loading", message: "Salvando" }));

    flushMicrotasks();
    expect(service.toasts()[0]).toEqual(jasmine.objectContaining({ type: "success", message: "Resultado: ok" }));

    void promise;
  }));
});
