import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES = {
  xs: "!w-3 !h-3", // 12px
  sm: "!w-3.5 !h-3.5", // 14px
  md: "!w-4.5 !h-4.5", // 18px
  lg: "!w-7 !h-7", // 28px
  xl: "!w-11 !h-11", // 44px
};
export function Spinner({ size = "md", className }: SpinnerProps) {
  const finalSize =
    size === "xs"
      ? 12
      : size === "sm"
        ? 14
        : size === "md"
          ? 18
          : size === "lg"
            ? 28
            : 44;

  const cx = finalSize / 2;
  const bladeW = finalSize * 0.113;
  const bladeH = finalSize * 0.295;
  const bladeX = cx - bladeW / 2;
  const bladeY = finalSize * 0.068;
  const rx = bladeW / 2;

  return (
    <svg
      viewBox={`0 0 ${finalSize} ${finalSize}`}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", SIZE_CLASSES[size], className)}
      role="status"
      aria-label="Loading"
    >
      <style>{`
        @keyframes ios-spinner-fade {
          0% { opacity: 1; }
          100% { opacity: 0.25; }
        }
      `}</style>

      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x={bladeX}
          y={bladeY}
          width={bladeW}
          height={bladeH}
          rx={rx}
          fill="#8E8E93"
          transform={`rotate(${i * 45} ${cx} ${cx})`}
          style={{
            animation: `ios-spinner-fade 0.8s linear infinite`,
            animationDelay: `-${0.8 - i * 0.1}s`,
          }}
        />
      ))}
    </svg>
  );
}
