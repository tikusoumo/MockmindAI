import Link from "next/link";
import { ChevronRight } from "lucide-react";

type CrumbItem = {
  label: string;
  href?: string;
};

type ScheduleBreadcrumbProps = {
  items: CrumbItem[];
};

export function ScheduleBreadcrumb({ items }: ScheduleBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="rounded px-1.5 py-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "px-1.5 py-0.5 font-medium" : "px-1.5 py-0.5 text-muted-foreground"}>
                {item.label}
              </span>
            )}

            {!isLast ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
          </div>
        );
      })}
    </nav>
  );
}
