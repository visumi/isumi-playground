import { Routes } from "@angular/router";
import { authGuard, publicOnlyGuard } from "./core/auth/auth.guard";
import { ExpenseInviteComponent } from "./features/expenses/expense-invite.component";
import { DashboardComponent } from "./features/dashboard/dashboard.component";
import { ExpenseRoomComponent } from "./features/expenses/expense-room.component";
import { ExpenseRoomsComponent } from "./features/expenses/expense-rooms.component";
import { LoginComponent } from "./features/login/login.component";
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
    path: "",
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
      { path: "dashboard", component: DashboardComponent },
      { path: "tools/expenses", component: ExpenseRoomsComponent },
      { path: "tools/expenses/:roomId/room", component: ExpenseRoomComponent }
    ]
  },
  { path: "**", redirectTo: "dashboard" }
];
