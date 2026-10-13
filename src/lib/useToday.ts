import { useEffect, useRef, useState } from "react";
import { todayIso } from "./format";

/**
 * Today's date that follows the clock: an iPhone home-screen app resumed the next morning keeps its old page, so
 * re-read the date when the app comes back to the front and once a minute while it's open.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayIso);
  useEffect(() => {
    const check = () => setToday(todayIso());
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const t = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.clearInterval(t);
    };
  }, []);
  return today;
}

/** A picked date that starts at today and, while it still shows today, moves along when the day rolls over. */
export function useDayPick(today: string): [string, (d: string) => void] {
  const [date, setDate] = useState(today);
  const shownToday = useRef(today);
  useEffect(() => {
    if (shownToday.current === today) return;
    setDate((d) => (d === shownToday.current ? today : d));
    shownToday.current = today;
  }, [today]);
  return [date, setDate];
}
