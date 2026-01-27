
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  History,
  Users,
  Settings,
  LogOut,
  Mic2,
  PanelLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LayoutTemplate } from "lucide-react";


const sidebarItems = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Schedule",
    href: "/schedule",
    icon: Calendar,
  },
  {
    title: "Study Planner",
    href: "/study-planner",
    icon: BookOpen,
  },
  {
    title: "History",
    href: "/history",
    icon: History,
  },
  {
    title: "Community",
    href: "/community",
    icon: Users,
  },
  {
    title: "Templates",
    href: "/templates",
    icon: LayoutTemplate,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r bg-card text-card-foreground transition-[width] duration-300 ease-in-out",
        collapsed ? "w-16" : "w-60"
      )}
      onClick={() => {
        if (collapsed) setCollapsed(false);
      }}
    >
      <div className="relative h-16 border-b">
        <div className="absolute inset-y-0 left-3 flex items-center gap-3">
          {/* Sidebar button (logo morphs on hover) */}
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "group p-0 h-10 w-10 rounded-xl",
              "hover:bg-transparent"
            )}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground",
                "transition-transform duration-200 group-hover:scale-[1.03] cursor-pointer"
              )}
            >
              <Mic2 className="h-5 w-5 group-hover:hidden" />
              <PanelLeft className="hidden h-5 w-5 group-hover:block" />
            </div>
          </Button>

          <Link
            href="/"
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            className={cn(
              "font-bold text-xl leading-none whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-300 cursor-pointer",
              collapsed
                ? "max-w-0 opacity-0 -translate-x-1 pointer-events-none"
                : "max-w-40 opacity-100 translate-x-0"
            )}
          >
            MockMind AI
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="grid gap-1 px-3">
          {sidebarItems.map((item, index) => (
            <Link
              key={index}
              href={item.href}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors overflow-hidden duration-200 hover:bg-accent hover:text-accent-foreground ",
                collapsed
                  ? "h-10 w-full justify-start px-3"
                  : "h-10 w-full gap-3 px-3",
                pathname === item.href
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
              aria-label={item.title}
            >
              <item.icon className="h-4 w-4" />
              <span
                aria-hidden={collapsed}
                className={cn(
                  "min-w-0 truncate whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform]  duration-200 ease-in" ,
                  collapsed
                    ? "max-w-0 opacity-0 translate-x-3"
                    : "max-w-44 opacity-100 translate-x-0"
                )}
              >
                {item.title}
              </span>
            </Link>
          ))}
        </nav>


      </div>
      <div className="border-t p-3">
        <Button
          variant="ghost"
          className={cn(
            "h-10 w-full justify-start gap-3 px-3 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
          )}
          asChild
        >
          <Link href="/auth" aria-label="Log out">
            <LogOut className="h-4 w-4" />
            <span
              aria-hidden={collapsed}
              className={cn(
                "min-w-0 truncate whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-300",
                collapsed
                  ? "max-w-0 opacity-0 -translate-x-1"
                  : "max-w-44 opacity-100 translate-x-0"
              )}
            >
              Log Out
            </span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
