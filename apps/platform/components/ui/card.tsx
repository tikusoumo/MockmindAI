import * as React from "react"
import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  variant = "glass", // Added variant
  ...props
}: React.ComponentProps<"div"> & { 
  size?: "default" | "sm",
  variant?: "default" | "glass" | "solid"
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        // Base structure
        "flex flex-col gap-6 rounded-xl py-6 text-sm shadow-sm overflow-hidden",
        "has-[>img:first-child]:pt-0 data-[size=sm]:gap-4 data-[size=sm]:py-4",
        "*:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl group/card",
        
        // Variants
        variant === "default" && "bg-card text-card-foreground border border-border",
        variant === "solid" && "bg-secondary/50 border-none",
        variant === "glass" && [
          "backdrop-blur-xl bg-white/5 dark:bg-slate-950/40",
          "border border-white/10 dark:border-white/5",
          "shadow-xl shadow-black/5"
        ],

        // Hover Effect
        "transition-all duration-300 hover:shadow-2xl hover:border-primary/30 hover:-translate-y-1",
        
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "gap-1 px-6 group-data-[size=sm]/card:px-4 flex flex-col justify-center",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-lg font-semibold tracking-tight text-foreground/90 group-hover/card:text-primary transition-colors", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm font-medium", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 group-data-[size=sm]/card:px-4", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("px-6 group-data-[size=sm]/card:px-4 pt-0 flex items-center", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
