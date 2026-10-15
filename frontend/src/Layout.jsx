import { Link } from "react-router-dom";
import { api } from "@/api/apiClient";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, FileText, Menu, X, Settings, Archive, ClipboardList, ScrollText, Handshake, UserCog, BarChart2, LogOut, ChevronDown, User, BrainCircuit, Shield, KeyRound, FlaskConical, Briefcase, CalendarDays } from "lucide-react";
import UpdatePasswordModal from "@/components/auth/UpdatePasswordModal";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const navSections = [
  { type: "item", label: "Dashboard", page: "Dashboard", icon: LayoutDashboard, module: null },
  {
    type: "group",
    label: "Contracts & Agreements",
    icon: Briefcase,
    items: [
      { label: "Grants", page: "Grants", icon: FileText, module: "Grants" },
      { label: "MSAs", page: "MSAs", icon: ScrollText, module: "MSAs" },
      { label: "MOUs", page: "MOUs", icon: Handshake, module: "MOUs" },
    ],
  },
  { type: "item", label: "SOWs", page: "SOWs", icon: ClipboardList, module: "SOWs" },
  { type: "item", label: "Reports", page: "Reports", icon: BarChart2, module: null },
  { type: "item", label: "Doc Intelligence", page: "DocumentIntelligence", icon: BrainCircuit, module: null },
  { type: "item", label: "Calendar", page: "Calendar", icon: CalendarDays, module: null },
  { type: "item", label: "Audit Trail", page: "AuditTrail", icon: Shield, module: null, adminOnly: true },
  { type: "item", label: "Archive", page: "Archive", icon: Archive, module: null },
  { type: "item", label: "Settings", page: "Settings", icon: Settings, module: null, adminOnly: true },
  { type: "item", label: "Users", page: "UserAdmin", icon: UserCog, module: null, adminOnly: true },
];

export default function Layout({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);
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
  const allowedModules = user?.allowed_modules;

  const isModuleAllowed = (module) => {
    if (!module || isAdmin) return true;
    if (!allowedModules || allowedModules.length === 0) return true;
    return allowedModules.includes(module);
  };

  const filteredNav = navSections
    .map(section => {
      if (section.type === "group") {
        const items = section.items.filter(item =>
          !(item.adminOnly && !isAdmin) && isModuleAllowed(item.module)
        );
        return items.length > 0 ? { ...section, items } : null;
      }
      if (section.adminOnly && !isAdmin) return null;
      return isModuleAllowed(section.module) ? section : null;
    })
    .filter(Boolean);

  const contractsPages = ["Grants", "MSAs", "MOUs"];
  const isContractsActive = contractsPages.includes(currentPageName);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top nav */}
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="flex items-center h-14 px-4 gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 font-bold text-primary text-lg mr-4">
            <FileText className="w-5 h-5" />
            GrantOS
            {envSettings?.environment_label_enabled && (
              envSettings.environment_name === "staging" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <FlaskConical className="w-3 h-3" /> STAGING
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-300">
                  PRODUCTION
                </span>
              )
            )}
          </div>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1 flex-1">
            {filteredNav.map(section => {
              if (section.type === "group") {
                return (
                  <DropdownMenu key={section.label}>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                          isContractsActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Briefcase className="w-4 h-4" />
                        {section.label}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                      {section.items.map(({ label, page, icon: Icon }) => (
                        <DropdownMenuItem key={page} asChild>
                          <Link
                            to={createPageUrl(page)}
                            className={cn(
                              "flex items-center gap-2 cursor-pointer",
                              currentPageName === page && "text-primary font-medium"
                            )}
                          >
                            <Icon className="w-4 h-4" />
                            {label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              const { label, page, icon: Icon } = section;
              return (
                <Link
                  key={page}
                  to={createPageUrl(page)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    currentPageName === page
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          {/* User dropdown — desktop */}
          <div className="hidden sm:flex items-center ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <User className="w-4 h-4" />
                  <span className="max-w-[160px] truncate">{user?.full_name || user?.email || "Account"}</span>
                  <ChevronDown className="w-3 h-3" />
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

          {/* Mobile menu button */}
          <button
            className="sm:hidden ml-auto"
            onClick={() => setMobileOpen(o => !o)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {/* Mobile nav */}
        {mobileOpen && (
          <div className="sm:hidden border-t bg-card px-4 py-2 space-y-1">
            {filteredNav.map(section => {
              if (section.type === "group") {
                return (
                  <div key={section.label}>
                    <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide flex items-center gap-1.5">
                      <Briefcase className="w-3 h-3" />
                      {section.label}
                    </p>
                    {section.items.map(({ label, page, icon: Icon }) => (
                      <Link
                        key={page}
                        to={createPageUrl(page)}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ml-3",
                          currentPageName === page
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </Link>
                    ))}
                  </div>
                );
              }
              const { label, page, icon: Icon } = section;
              return (
                <Link
                  key={page}
                  to={createPageUrl(page)}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium",
                    currentPageName === page
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
            <div className="border-t pt-2 mt-1">
              <p className="px-3 py-1 text-xs text-muted-foreground truncate">{user?.email}</p>
              <button
                onClick={() => { setMobileOpen(false); setShowUpdatePassword(true); }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <KeyRound className="w-4 h-4" /> Update Password
              </button>
              <button
                onClick={() => { setMobileOpen(false); setShowLogoutConfirm(true); }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Update Password Modal */}
      <UpdatePasswordModal user={user} open={showUpdatePassword} onClose={() => setShowUpdatePassword(false)} />

      {/* Logout confirmation dialog */}
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

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}