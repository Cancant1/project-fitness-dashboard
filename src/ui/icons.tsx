import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const TodayIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></Svg>;
export const TrainIcon = (p: P) => <Svg {...p}><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" /></Svg>;
export const ProgressIcon = (p: P) => <Svg {...p}><path d="M3.5 16.5l5.5-5.5 4 4 7.5-7.5" /><path d="M15 7.5h5.5V13" /></Svg>;
export const FoodIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /></Svg>;
export const PlanIcon = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="4" /><path d="M3.5 10h17M8.5 3v4M15.5 3v4" /></Svg>;
export const RecordsIcon = (p: P) => <Svg {...p}><path d="M12 3.5l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.1l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z" /></Svg>;
export const WeightIcon = (p: P) => <Svg {...p}><path d="M5 20h14l-1.6-10H6.6z" /><path d="M9.5 10a2.5 2.5 0 015 0" /></Svg>;
export const HistoryIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const ChevronRight = (p: P) => <Svg size={14} {...p}><path d="M9 5l7 7-7 7" /></Svg>;
export const ChevronLeft = (p: P) => <Svg size={18} {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const ChevronDown = (p: P) => <Svg size={18} {...p}><path d="M5 9l7 7 7-7" /></Svg>;
export const CheckIcon = (p: P) => <Svg size={16} strokeWidth={2.4} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const PlusIcon = (p: P) => <Svg size={16} strokeWidth={2.2} {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const MinusIcon = (p: P) => <Svg size={16} strokeWidth={2.2} {...p}><path d="M5 12h14" /></Svg>;
export const PlayIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 16" fill="currentColor" aria-hidden="true"><path d="M2 1.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.4 0-1.8L3.6.7C2.9.3 2 .8 2 1.6z" /></svg>
);
