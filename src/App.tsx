import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Permission, Role } from "./api";
import { useAuth } from "./auth";
import { AppShell } from "./components/AppShell";
import { Loading } from "./components/ui";
import { Access } from "./pages/admin/Access";
import { Audit } from "./pages/admin/Audit";
import { PolicyPage } from "./pages/admin/Policy";
import { Projects } from "./pages/admin/Projects";
import { Users } from "./pages/admin/Users";
import { Alerts } from "./pages/Alerts";
import { Home } from "./pages/Home";
import { LeavePage } from "./pages/Leave";
import { Login } from "./pages/Login";
import { MyReports } from "./pages/MyReports";
import { MyWeek } from "./pages/MyWeek";
import { ProjectsPage } from "./pages/ProjectsPage";
import { Reports } from "./pages/Reports";
import { Reviews } from "./pages/Reviews";
import { Timesheet } from "./pages/Timesheet";

// Client-side role gates are for navigation only; the API enforces access.
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Starting" />;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={user.role === "EMPLOYEE" ? <MyWeek /> : <Home />} />
        <Route path="week" element={user.role === "EMPLOYEE" ? <Navigate to={{ pathname: "/", search: window.location.search }} replace /> : <MyWeek />} />
        <Route path="timesheet" element={<Timesheet />} />
        <Route path="my-reports" element={<MyReports />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route
          path="alerts"
          element={
            <RequireRole roles={["ADMIN", "MANAGER"]}>
              <Alerts />
            </RequireRole>
          }
        />
        <Route
          path="reviews"
          element={
            <RequireRole roles={["ADMIN", "MANAGER"]}>
              <Reviews />
            </RequireRole>
          }
        />
        <Route
          path="reports"
          element={
            <RequireRole roles={["ADMIN", "MANAGER"]}>
              <Reports />
            </RequireRole>
          }
        />
        <Route path="admin/*" element={<AdminRoutes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** Admin pages open to anyone with the matching permission (granted by the super admin). */
function RequirePermission({ any, children }: { any: Permission[]; children: ReactNode }) {
  const { user } = useAuth();
  const ok = !!user && (!!user.isSuperAdmin || any.some((p) => user.permissions?.includes(p)));
  return ok ? <>{children}</> : <Navigate to="/" replace />;
}

function AdminRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="users" element={<RequirePermission any={["MANAGE_USERS"]}><Users /></RequirePermission>} />
      <Route path="projects" element={<RequirePermission any={["MANAGE_PROJECTS", "CLOSE_PHASES"]}><Projects /></RequirePermission>} />
      <Route path="policy" element={<RequirePermission any={["MANAGE_POLICY"]}><PolicyPage /></RequirePermission>} />
      <Route path="audit" element={<RequirePermission any={["VIEW_AUDIT"]}><Audit /></RequirePermission>} />
      <Route path="access" element={user?.isSuperAdmin ? <Access /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
