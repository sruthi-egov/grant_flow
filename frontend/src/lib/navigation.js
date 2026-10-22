import {
  LayoutDashboard, FileText, Settings, Archive, ClipboardList, ScrollText,
  Handshake, UserCog, BarChart2, BrainCircuit, Shield, Briefcase, CalendarDays,
} from "lucide-react";

/**
 * Primary navigation.
 *
 * Moved here from Layout.jsx unchanged — same items, labels, icons, order,
 * `module` gates and `adminOnly` flags — so the sidebar renders exactly the
 * menu the top bar did. Keeping it in its own module lets the permission rules
 * be unit-tested without mounting the layout.
 */
export const navSections = [
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

/** Pages that live under the "Contracts & Agreements" group. */
export const CONTRACTS_PAGES = ["Grants", "MSAs", "MOUs"];

/**
 * Whether a user may see a module-gated entry.
 * Preserved verbatim from the previous Layout implementation: admins see
 * everything, and an empty/absent `allowed_modules` means unrestricted.
 */
export function isModuleAllowed(module, { isAdmin, allowedModules }) {
  if (!module || isAdmin) return true;
  if (!allowedModules || allowedModules.length === 0) return true;
  return allowedModules.includes(module);
}

/**
 * Applies role and module visibility to the navigation.
 * A group disappears entirely once all of its children are filtered out.
 */
export function filterNavigation(sections, { isAdmin = false, allowedModules = [] } = {}) {
  const permissions = { isAdmin, allowedModules };

  return sections
    .map((section) => {
      if (section.type === "group") {
        const items = section.items.filter(
          (item) => !(item.adminOnly && !isAdmin) && isModuleAllowed(item.module, permissions),
        );
        return items.length > 0 ? { ...section, items } : null;
      }
      if (section.adminOnly && !isAdmin) return null;
      return isModuleAllowed(section.module, permissions) ? section : null;
    })
    .filter(Boolean);
}

/**
 * Human-readable title for the compact header.
 *
 * Prefers the navigation label so the header matches the menu wording. Detail
 * pages (GrantDetail, MOUDetail, ...) are not in the menu, so their camel-case
 * key is split into words as a fallback.
 */
export function getPageTitle(pageName, sections = navSections) {
  if (!pageName) return "";

  for (const section of sections) {
    if (section.type === "group") {
      const match = section.items.find((item) => item.page === pageName);
      if (match) return match.label;
    } else if (section.page === pageName) {
      return section.label;
    }
  }

  return pageName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}
