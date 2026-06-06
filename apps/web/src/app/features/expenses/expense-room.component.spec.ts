import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import { ExpensesService } from "../../core/api/expenses.service";
import { ExpenseRoomDetail } from "../../core/api/api.types";
import { AuthService } from "../../core/auth/auth.service";
import { IsumiModalService } from "../../shared/ui";
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
