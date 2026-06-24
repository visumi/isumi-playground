import { Routes } from "@angular/router";
import { authGuard, ownerGuard, publicOnlyGuard } from "./core/auth/auth.guard";
import { AccessAdminComponent } from "./features/access-admin/access-admin.component";
import { ExpenseInviteComponent } from "./features/expenses/expense-invite.component";
import { DashboardComponent } from "./features/dashboard/dashboard.component";
import { ExpenseRoomComponent } from "./features/expenses/expense-room.component";
import { ExpenseRoomsComponent } from "./features/expenses/expense-rooms.component";
import { LoginComponent } from "./features/login/login.component";
import { MonthlyExpensesComponent } from "./features/monthly-expenses/monthly-expenses.component";
import { ShellComponent } from "./layout/shell/shell.component";

export const routes: Routes = [
  {
    path: "login",
    component: LoginComponent,
    canActivate: [publicOnlyGuard]
  },
  {
    path: "tools/expenses/:roomId",
    component: ExpenseInviteComponent,
    canActivate: [authGuard]
  },
  {
    path: "tools/trips/:roomId",
    loadComponent: () => import("./features/trips/trip-invite.component").then((module) => module.TripInviteComponent),
    canActivate: [authGuard]
  },
  {
    path: "",
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
      { path: "dashboard", component: DashboardComponent },
      { path: "admin/access", component: AccessAdminComponent, canActivate: [ownerGuard] },
      { path: "tools/monthly-expenses", component: MonthlyExpensesComponent },
      { path: "tools/expenses", component: ExpenseRoomsComponent },
      { path: "tools/expenses/:roomId/room", component: ExpenseRoomComponent },
      {
        path: "tools/trips",
        loadComponent: () => import("./features/trips/trips.component").then((module) => module.TripsComponent)
      },
      {
        path: "tools/trips/:roomId/room",
        loadComponent: () => import("./features/trips/trip-room.component").then((module) => module.TripRoomComponent)
      }
    ]
  },
  { path: "**", redirectTo: "dashboard" }
];
