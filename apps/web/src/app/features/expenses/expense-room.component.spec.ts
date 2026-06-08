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
              allowed: true
            })
          }
        },
        {
          provide: ExpensesService,
          useValue: {
            getRoom: () => of(roomDetail()),
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

  it("shows establishment participants first and keeps removal available to the owner", () => {
    const fixture = TestBed.createComponent(ExpenseRoomComponent);
    fixture.componentRef.setInput("roomId", "room-1");
    const detail = roomDetail();
    detail.participants = [
      participant("owner-1", "Owner", { role: "owner", userId: "owner-user" }),
      participant("restaurant-1", "Chefão", { isEstablishment: true }),
      participant("guest-1", "Ana")
    ];
    fixture.componentInstance.detail.set(detail);

    expect(fixture.componentInstance.displayedParticipants().map((item) => item.id)).toEqual([
      "restaurant-1",
      "owner-1",
      "guest-1"
    ]);
    expect(fixture.componentInstance.canRemoveParticipant(detail.participants[1])).toBeTrue();

    detail.items = [{
      id: "item-1",
      roomId: "room-1",
      payerParticipantId: "restaurant-1",
      description: "Jantar",
      amountCents: 1000,
      createdByUserId: "owner-user",
      splits: [],
      createdAt: "2026-06-05T00:00:00Z",
      updatedAt: "2026-06-05T00:00:00Z"
    }];
    fixture.componentInstance.detail.set({ ...detail });

    expect(fixture.componentInstance.canRemoveParticipant(detail.participants[1])).toBeTrue();
  });

  it("uses a toast instead of the page alert when participant removal fails", () => {
    const toast = jasmine.createSpyObj<IsumiToastService>("IsumiToastService", ["error"]);
    TestBed.overrideProvider(ExpensesService, {
      useValue: {
        getRoom: () => of(roomDetail()),
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
      "Nao foi possivel remover este participante. Ele ja esta em gastos, divisoes ou acertos.",
      { id: "expense-remove-participant-error" }
    );
  });

  it("redirects removed users back to the invite screen", () => {
    TestBed.overrideProvider(ExpensesService, {
      useValue: {
        getRoom: () => throwError(() => new HttpErrorResponse({ status: 403 })),
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
});

function roomDetail(): ExpenseRoomDetail {
  return {
    room: {
      id: "room-1",
      ownerUserId: "owner-user",
      name: "Jantar",
      tipPercent: 10,
      createdAt: "2026-06-05T00:00:00Z",
      updatedAt: "2026-06-05T00:00:00Z"
    },
    tipPercent: 10,
    subtotalCents: 3000,
    tipAmountCents: 300,
    totalCents: 3300,
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
    isEstablishment: false,
    createdAt: "2026-06-05T00:00:00Z",
    updatedAt: "2026-06-05T00:00:00Z",
    ...options
  };
}
