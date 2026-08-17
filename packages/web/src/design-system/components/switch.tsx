import * as RS from "@radix-ui/react-switch";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

/** 开关（Radix Switch 封装）：设置里的布尔项。 */
export function Switch({ className, ...props }: ComponentPropsWithoutRef<typeof RS.Root>) {
  return (
    <RS.Root
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full bg-line-strong transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <RS.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[15px]" />
    </RS.Root>
  );
}
