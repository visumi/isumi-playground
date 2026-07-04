import type { Client } from "@libsql/client/web";
import type { AuthUser } from "./shared";
import { getExpenseRoomDetail, listExpenseRooms } from "./expense-rooms";
import { getMonthlyExpenseMonthDetail, listMonthlyExpenseMonths } from "./monthly-expenses";
import { listTripRooms } from "./trips";

export interface DashboardExpenseDebt {
  roomId: string;
  roomName: string;
  amountCents: number;
  toParticipantName: string;
  updatedAt: string;
}

export interface DashboardMonthlySummary {
  monthId: string;
  year: number;
  month: number;
  variableLimitCents: number;
  variableSpentCents: number;
  variableRemainingCents: number;
  monthTotalCents: number;
}

export interface DashboardUpcomingTrip {
  roomId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  daysCount: number;
}

export interface DashboardSummary {
  expenseDebts: DashboardExpenseDebt[];
  monthly: DashboardMonthlySummary | null;
  upcomingTrips: DashboardUpcomingTrip[];
}

export async function getDashboardSummary(db: Client, user: AuthUser): Promise<DashboardSummary> {
  const today = currentSaoPauloDate();
  const [expenseDebts, monthly, upcomingTrips] = await Promise.all([
    listExpenseDebts(db, user),
    getCurrentMonthlySummary(db, user.uid),
    listUpcomingTrips(db, user.uid, today)
  ]);

  return {
    expenseDebts,
    monthly,
    upcomingTrips
  };
}

async function listExpenseDebts(db: Client, user: AuthUser): Promise<DashboardExpenseDebt[]> {
  const rooms = await listExpenseRooms(db, user.uid);
  const details = await Promise.all(
    rooms.map((room) => getExpenseRoomDetail(db, user, room.id))
  );

  return details
    .flatMap((detail) => {
      const participant = detail.participants.find((item) => item.userId === user.uid);
      if (!participant) return [];

      return detail.settlements
        .filter((settlement) => settlement.fromParticipantId === participant.id && !settlement.paid)
        .map((settlement) => ({
          roomId: detail.room.id,
          roomName: detail.room.name,
          amountCents: settlement.amountCents,
          toParticipantName: detail.participants.find((item) => item.id === settlement.toParticipantId)?.name || "participante",
          updatedAt: detail.room.updatedAt
        }));
    })
    .sort((a, b) => b.amountCents - a.amountCents || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
}

async function getCurrentMonthlySummary(db: Client, userId: string): Promise<DashboardMonthlySummary | null> {
  const current = currentSaoPauloPeriod();
  const month = (await listMonthlyExpenseMonths(db, userId))
    .find((item) => item.year === current.year && item.month === current.month);

  if (!month) {
    return null;
  }

  const detail = await getMonthlyExpenseMonthDetail(db, userId, month.id);
  return {
    monthId: detail.month.id,
    year: detail.month.year,
    month: detail.month.month,
    variableLimitCents: detail.summary.variableLimitCents,
    variableSpentCents: detail.summary.variableSpentCents,
    variableRemainingCents: detail.summary.variableRemainingCents,
    monthTotalCents: detail.summary.monthTotalCents
  };
}

async function listUpcomingTrips(db: Client, userId: string, today: string): Promise<DashboardUpcomingTrip[]> {
  return (await listTripRooms(db, userId))
    .filter((room) => room.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, 3)
    .map((room) => ({
      roomId: room.id,
      title: room.title,
      destination: room.destination,
      startDate: room.startDate,
      endDate: room.endDate,
      daysCount: daysBetweenInclusive(room.startDate, room.endDate)
    }));
}

function currentSaoPauloPeriod(): { year: number; month: number } {
  const parts = saoPauloDateParts();
  return {
    year: Number(parts.year),
    month: Number(parts.month)
  };
}

function currentSaoPauloDate(): string {
  const parts = saoPauloDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function saoPauloDateParts(): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
}

function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Date.parse(`${endDate}T12:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}
