"use client";

import { Bell, Search, Check, Calendar, MessageSquare, Heart, Brain, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ModeToggle } from "@/components/mode-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "@/data/mockData";
import { useBackendDataState } from "@/lib/backend";
import { fallbackCurrentUser } from "@/lib/fallback-data";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

function getNotificationIcon(type: string) {
  switch (type) {
    case "schedule_reminder": return <Calendar className="h-4 w-4 text-primary" />;
    case "post_reply": return <MessageSquare className="h-4 w-4 text-blue-500" />;
    case "post_like": return <Heart className="h-4 w-4 text-red-500 fill-red-500" />;
    case "ai_suggestion": return <Brain className="h-4 w-4 text-amber-500" />;
    default: return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

export function Header() {
  const { data: user, isLoading } = useBackendDataState<User>("/api/user", fallbackCurrentUser);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const router = useRouter();

  const handleNotificationClick = (notif: any) => {
    if (!notif.read) markAsRead(notif.id);

    // Provide basic nav action based on type
    if (notif.type === "schedule_reminder" || notif.type === "ai_suggestion") {
      router.push("/schedule");
    } else if (notif.type === "post_reply" || notif.type === "post_like") {
      router.push("/community");
    }
  };

  return (
    <header className="flex h-16 items-center gap-4 border-b bg-background px-6">
      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-full bg-background pl-8 md:w-75 lg:w-75"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ModeToggle />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 flex h-2 w-2 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-background">
                </span>
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end" forceMount>
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-muted-foreground" onClick={markAllAsRead}>
                  <Check className="h-3 w-3 mr-1" /> Mark all read
                </Button>
              )}
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-[300px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  You're all caught up!
                </div>
              ) : (
                notifications.slice(0, 10).map((notif) => (
                  <DropdownMenuItem key={notif.id} className={`flex items-start gap-3 p-3 cursor-pointer ${notif.read ? 'opacity-70' : 'bg-muted/30'}`} onClick={() => handleNotificationClick(notif)}>
                    <div className="mt-0.5">
                      {getNotificationIcon(notif.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{notif.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{notif.body}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(notif.createdAt))} ago
                      </p>
                    </div>
                    {!notif.read && <div className="w-2 h-2 bg-primary rounded-full mt-1 shrink-0" />}
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              {isLoading ? (
                <Skeleton className="h-8 w-8 rounded-full" />
              ) : (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.name}`} alt={user.name} />
                  <AvatarFallback>{user.name?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                {isLoading ? (
                  <>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.role}
                    </p>
                  </>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                localStorage.removeItem("auth_token");
                localStorage.removeItem("token");
                window.location.replace("/auth");
              }}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
