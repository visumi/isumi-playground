import { HttpErrorResponse } from "@angular/common/http";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";
import { ExpensesService } from "../../core/api/expenses.service";
import { ExpenseRoomDetail } from "../../core/api/api.types";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiModalService, IsumiToastService } from "../../shared/ui";
import { ExpenseRoomComponent } from "./expense-room.component";

describe("ExpenseRoomComponent", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExpenseRoomComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            profile: signal({
              uid: "owner-user",
              email: "owner@example.com",
              name: "Owner",
              picture: null,
              allowed: true,
              role: "owner"
            })
          }
        },
        {
          provide: ExpensesService,
          useValue: {
            getRoom: () => of(roomDetail()),
            deleteRoom: () => of(undefined),
            deleteParticipant: () => of(undefined)
          }
        },
        {
          provide: IsumiModalService,
          useValue: {
            open: () => ({ afterClosed: () => of(null) })
          }
        }
      ]
    });
  });

  it("calculates the unpaid settlement total from unchecked settlements", () => {
    const fixture = TestBed.createComponent(ExpenseRoomComponent);
    fixture.componentRef.setInput("roomId", "room-1");
    fixture.componentInstance.detail.set(roomDetail());

    expect(fixture.componentInstance.unpaidSettlementCents()).toBe(1250);
  });

  it("uses a toast instead of the page alert when participant removal fails", () => {
    const toast = jasmine.createSpyObj<IsumiToastService>("IsumiToastService", ["error"]);
    TestBed.overrideProvider(ExpensesService, {
      useValue: {
        getRoom: () => of(roomDetail()),
        deleteRoom: () => of(undefined),
        deleteParticipant: () => throwError(() => new Error("linked participant"))
      }
    });
    TestBed.overrideProvider(IsumiToastService, { useValue: toast });
    const fixture = TestBed.createComponent(ExpenseRoomComponent);
    fixture.componentRef.setInput("roomId", "room-1");
    const removableParticipant = participant("guest-1", "Ana");

    fixture.componentInstance.error.set("Erro anterior");
    fixture.componentInstance.removeParticipant(removableParticipant);

    expect(fixture.componentInstance.error()).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível remover este participante. Ele já está em gastos, divisões ou acertos.",
      { id: "expense-remove-participant-error" }
    );
  });

  it("redirects removed users back to the invite screen", () => {
    TestBed.overrideProvider(ExpensesService, {
      useValue: {
        getRoom: () => throwError(() => new HttpErrorResponse({ status: 403 })),
        deleteRoom: () => of(undefined),
        deleteParticipant: () => of(undefined)
      }
    });
    const router = TestBed.inject(Router);
    spyOn(router, "navigate").and.resolveTo(true);
    const fixture = TestBed.createComponent(ExpenseRoomComponent);
    fixture.componentRef.setInput("roomId", "room-1");

    fixture.componentInstance.loadRoom();

    expect(router.navigate).toHaveBeenCalledWith(["/tools/expenses", "room-1"]);
  });

  it("deletes the room after confirmation and returns to the room list", async () => {
    const expenses = jasmine.createSpyObj<ExpensesService>("ExpensesService", ["getRoom", "deleteRoom", "deleteParticipant"]);
    const modal = jasmine.createSpyObj<IsumiModalService>("IsumiModalService", ["open"]);
    const toast = jasmine.createSpyObj<IsumiToastService>("IsumiToastService", ["success", "error"]);
    expenses.getRoom.and.returnValue(of(roomDetail()));
    expenses.deleteRoom.and.returnValue(of(undefined));
    expenses.deleteParticipant.and.returnValue(of(undefined));
    modal.open.and.returnValue({} as never);
    TestBed.overrideProvider(ExpensesService, { useValue: expenses });
    TestBed.overrideProvider(IsumiModalService, { useValue: modal });
    TestBed.overrideProvider(IsumiToastService, { useValue: toast });
    const router = TestBed.inject(Router);
    spyOn(router, "navigate").and.resolveTo(true);
    const fixture = TestBed.createComponent(ExpenseRoomComponent);
    fixture.componentRef.setInput("roomId", "room-1");
    fixture.componentInstance.detail.set(roomDetail());

    fixture.componentInstance.openDeleteRoomModal();
    const config = modal.open.calls.mostRecent().args[1] as { onSubmit: () => Promise<void> };
    await config.onSubmit();

    expect(modal.open).toHaveBeenCalled();
    expect(expenses.deleteRoom).toHaveBeenCalledWith("room-1");
    expect(toast.success).toHaveBeenCalledWith("Sala excluída.", { id: "expense-delete-room-success" });
    expect(router.navigate).toHaveBeenCalledWith(["/tools/expenses"]);
  });
});

function roomDetail(): ExpenseRoomDetail {
  return {
    room: {
      id: "room-1",
      ownerUserId: "owner-user",
      name: "Jantar",
      createdAt: "2026-06-05T00:00:00Z",
      updatedAt: "2026-06-05T00:00:00Z"
    },
    subtotalCents: 3000,
    totalCents: 3000,
    participants: [],
    items: [],
    participantTotals: [],
    balances: [],
    settlements: [
      { fromParticipantId: "ana", toParticipantId: "bruno", amountCents: 1000, paid: false },
      { fromParticipantId: "caio", toParticipantId: "bruno", amountCents: 500, paid: true },
      { fromParticipantId: "dani", toParticipantId: "bruno", amountCents: 250, paid: false }
    ]
  };
}

function participant(
  id: string,
  name: string,
  options: Partial<ExpenseRoomDetail["participants"][number]> = {}
): ExpenseRoomDetail["participants"][number] {
  return {
    id,
    roomId: "room-1",
    userId: null,
    name,
    picture: null,
    kind: "guest",
    role: "guest",
    createdAt: "2026-06-05T00:00:00Z",
    updatedAt: "2026-06-05T00:00:00Z",
    ...options
  };
}
