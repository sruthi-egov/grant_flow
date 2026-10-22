import { Link } from "react-router-dom";
import { api } from "@/api/apiClient";
import { createPageUrl } from "@/utils";
import {
  FileText, LogOut, ChevronDown, User, KeyRound, FlaskConical,
} from "lucide-react";
import UpdatePasswordModal from "@/components/auth/UpdatePasswordModal";
import { useState, useEffect } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset,
  SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import SidebarNav from "@/components/layout/SidebarNav";
import { filterNavigation, getPageTitle, navSections } from "@/lib/navigation";

/**
 * Shared shell for authenticated pages.
 *
 * The primary navigation lives in a left sidebar (collapsible to icons on
 * desktop, a drawer on small screens) and the top bar is reduced to the page
 * title plus utility controls. The menu is not duplicated between the two.
 *
 * Login, invitation acceptance and other pre-auth screens are routed outside
 * this component in App.jsx and keep their own AuthLayout.
 *
 * `{children}` sits in a fixed position in the tree, and expanding or
 * collapsing the sidebar only changes CSS classes on the wrappers. React
 * therefore re-renders rather than remounts the page, so in-progress form
 * input, filters and uploads survive a toggle.
 */
function EnvironmentBadge({ envSettings }) {
  if (!envSettings?.environment_label_enabled) return null;

  return envSettings.environment_name === "staging" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
      <FlaskConical className="w-3 h-3" /> STAGING
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-300">
      PRODUCTION
    </span>
  );
}

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUpdatePassword, setShowUpdatePassword] = useState(false);
  const [envSettings, setEnvSettings] = useState(null);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => {});
    api.entities.AppSettings.list().then(s => {
      if (s.length > 0) setEnvSettings(s[0]);
    }).catch(() => {});
  }, []);

  const handleLogout = () => {
    api.auth.logout("/");
  };

  const isAdmin = user?.role === "admin";
  const filteredNav = filterNavigation(navSections, {
    isAdmin,
    allowedModules: user?.allowed_modules,
  });

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b h-14 justify-center">
          {/* Brand. Collapses to the icon alone, and links home like before. */}
          <Link
            to={createPageUrl("Dashboard")}
            className="flex items-center gap-2 font-bold text-primary text-lg px-1 overflow-hidden"
          >
            <FileText className="w-5 h-5 shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">GrantOS</span>
          </Link>
        </SidebarHeader>

        {/* SidebarContent is overflow-auto, so a long menu scrolls instead of
            pushing the footer out of reach. */}
        <SidebarContent>
          <SidebarNav sections={filteredNav} currentPageName={currentPageName} />
        </SidebarContent>

        <SidebarFooter className="border-t">
          <p className="text-[11px] text-muted-foreground px-2 truncate group-data-[collapsible=icon]:hidden">
            {user?.email}
          </p>
        </SidebarFooter>

        {/* Thin draggable edge: another way to collapse/expand on desktop. */}
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        {/* Compact utility header. Deliberately carries no primary navigation. */}
        <header className="border-b bg-card sticky top-0 z-30">
          <div className="flex items-center h-14 px-4 gap-3">
            <SidebarTrigger className="h-8 w-8" />

            <h1 className="font-semibold text-base truncate">
              {getPageTitle(currentPageName)}
            </h1>

            <div className="hidden sm:block">
              <EnvironmentBadge envSettings={envSettings} />
            </div>

            <div className="flex items-center ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <User className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline max-w-[160px] truncate">
                      {user?.full_name || user?.email || "Account"}
                    </span>
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-3 py-2">
                    <p className="text-xs font-medium">{user?.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setShowUpdatePassword(true)}
                  >
                    <KeyRound className="w-4 h-4 mr-2" /> Update Password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600 cursor-pointer"
                    onClick={() => setShowLogoutConfirm(true)}
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* min-w-0 on the flex child stops wide tables forcing the whole page
            to scroll horizontally. */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </SidebarInset>

      <UpdatePasswordModal
        user={user}
        open={showUpdatePassword}
        onClose={() => setShowUpdatePassword(false)}
      />

      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
            <AlertDialogDescription>
              Your session will be ended and you will be redirected to the login screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleLogout}
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
