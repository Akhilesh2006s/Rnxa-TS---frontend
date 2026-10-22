import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth, useCan, useUser } from "../auth";
import { initials } from "../format";
import { AssistantPanel, AssistantLauncher } from "../assistant/AssistantPanel";
import { AssistantProvider } from "../assistant/AssistantContext";
import { VoiceDock } from "../assistant/VoiceDock";
import { Icon, type IconName } from "./Icon";
import { NotificationsBell } from "./Notifications";
import { UrgentAlerts } from "./UrgentAlerts";

export function Wordmark({ product = true }: { product?: boolean }) {
  return (
    <span>
      <span className="wordmark" aria-label="RNXA Digital">
        <span aria-hidden="true">RN</span>
        <span className="xa" aria-hidden="true">
          XA
        </span>
        <span className="digital" aria-hidden="true">
          DIGITAL
        </span>
      </span>
      {product && <span className="wordmark-product">Timesheet</span>}
    </span>
  );
}

function NavItem({ to, icon, children, count }: { to: string; icon: IconName; children: string; count?: number }) {
  return (
    <NavLink to={to} end={to === "/"}>
      <Icon name={icon} size={18} />
      {children}
      {count ? (
        <span className="count" aria-label={`${count} pending`}>
          {count}
        </span>
      ) : null}
    </NavLink>
  );
}

export function AppShell() {
  const user = useUser();
  // A fresh assistant per (viewer, user): viewing as someone starts a separate conversation.
  return (
    <AssistantProvider key={`${user.impersonator?.id ?? ""}:${user.id}`}>
      <Shell />
    </AssistantProvider>
  );
}

function ViewingBanner() {
  const user = useUser();
  const { stopImpersonating } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!user.impersonator) return null;
  return (
    <div className="viewing-banner" role="status">
      <Icon name="eye" />
      <span>
        Viewing as <strong>{user.name}</strong> ({user.role.toLowerCase()}). You see and act with their permissions; everything is recorded under{" "}
        {user.impersonator.name}.
      </span>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await stopImpersonating().catch(() => undefined);
          navigate("/admin/users");
        }}
      >
        Return to my view
      </button>
    </div>
  );
}

function Shell() {
  const user = useUser();
  const { logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const location = useLocation();
  const reviewer = user.role !== "EMPLOYEE";
  const canUsers = useCan("MANAGE_USERS");
  const canManageProjects = useCan("MANAGE_PROJECTS");
  const canClosePhases = useCan("CLOSE_PHASES");
  const canProjects = canManageProjects || canClosePhases;
  const canPolicy = useCan("MANAGE_POLICY");
  const canAudit = useCan("VIEW_AUDIT");

  useEffect(() => setNavOpen(false), [location.pathname]);
  useEffect(() => {
    if (!reviewer) return;
    api
      .get<{ entries: unknown[] }>("/reviews?status=SUBMITTED")
      .then((r) => setPending(r.entries.length))
      .catch(() => undefined);
  }, [reviewer, location.pathname]);

  return (
    <div className="shell" data-nav-open={navOpen}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
          <Icon name="menu" size={20} />
        </button>
        <Wordmark product={false} />
        <span className="spacer" />
        <NotificationsBell />
      </header>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <Wordmark />
          <span className="spacer" />
          <span className="desktop-only">
            <NotificationsBell />
          </span>
        </div>
        <nav className="nav">
          {reviewer && (
            <NavItem to="/" icon="users">
              Team dashboard
            </NavItem>
          )}
          <NavItem to={reviewer ? "/week" : "/"} icon="home">
            {reviewer ? "My dashboard" : "Dashboard"}
          </NavItem>
          <NavItem to="/timesheet" icon="clock">
            Timesheet
          </NavItem>
          <NavItem to="/projects" icon="folder">
            Projects
          </NavItem>
          <NavItem to="/my-reports" icon="chart">
            My reports
          </NavItem>
          <NavItem to="/leave" icon="calendar">
            Leave
          </NavItem>
          {reviewer && (
            <>
              <div className="nav-label">Team</div>
              <NavItem to="/reviews" icon="checkCircle" count={pending}>
                Verify time
              </NavItem>
              <NavItem to="/reports" icon="chart">
                Team reports
              </NavItem>
              <NavItem to="/alerts" icon="bell">
                Alerts
              </NavItem>
            </>
          )}
          {(canUsers || canProjects || canPolicy || canAudit || user.isSuperAdmin) && <div className="nav-label">Administration</div>}
          {canUsers && (
            <NavItem to="/admin/users" icon="users">
              Users
            </NavItem>
          )}
          {canProjects && (
            <NavItem to="/admin/projects" icon="folder">
              Projects & phases
            </NavItem>
          )}
          {canPolicy && (
            <NavItem to="/admin/policy" icon="settings">
              Policy
            </NavItem>
          )}
          {canAudit && (
            <NavItem to="/admin/audit" icon="log">
              Audit log
            </NavItem>
          )}
          {user.isSuperAdmin && (
            <NavItem to="/admin/access" icon="checkCircle">
              Access control
            </NavItem>
          )}
        </nav>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="who">
            <strong>{user.name}</strong>
            <span>{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</span>
          </span>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Sign out" title="Sign out" onClick={logout}>
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="main" id="main" tabIndex={-1}>
        <ViewingBanner />
        <UrgentAlerts />
        <Outlet />
      </main>
      <AssistantLauncher />
      <AssistantPanel />
      <VoiceDock />
    </div>
  );
}
