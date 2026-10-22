import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

/**
 * Primary navigation rendered inside the sidebar.
 *
 * Uses the same `createPageUrl(page)` targets and the same active rule
 * (`currentPageName === page`) as the previous top bar, so every route, URL
 * and highlight behaves identically.
 *
 * `tooltip` on SidebarMenuButton is shown by the primitive only while the
 * sidebar is collapsed to icons, which keeps labels reachable in that state.
 */
export default function SidebarNav({ sections, currentPageName }) {
  const { isMobile, setOpenMobile } = useSidebar();

  // On mobile the navigation lives in a drawer; close it once a link is
  // followed so the page is not left hidden behind the overlay.
  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  const activeClasses =
    "data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium";

  const renderItem = ({ label, page, icon: Icon }) => (
    <SidebarMenuItem key={page}>
      <SidebarMenuButton
        asChild
        isActive={currentPageName === page}
        tooltip={label}
        className={activeClasses}
      >
        <Link to={createPageUrl(page)} onClick={handleNavigate}>
          <Icon className="w-4 h-4 shrink-0" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <>
      {sections.map((section) => {
        if (section.type === "group") {
          return (
            <SidebarGroup key={section.label} className="py-1">
              {/* The primitive hides this label when collapsed to icons; the
                  child items remain visible as icons with tooltips. */}
              <SidebarGroupLabel className="flex items-center gap-1.5">
                <section.icon className="w-3 h-3" />
                {section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{section.items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        }

        return (
          <SidebarGroup key={section.page} className={cn("py-0")}>
            <SidebarGroupContent>
              <SidebarMenu>{renderItem(section)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}
