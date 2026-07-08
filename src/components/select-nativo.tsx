import { cn } from "@/lib/utils";

/** Select nativo estilizado como os inputs do shadcn — funciona em forms de server action. */
export function SelectNativo({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "border-input h-10 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
