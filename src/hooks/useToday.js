import { useEffect, useState } from "react";
import { dateKey, millisecondsUntilTomorrow } from "../utils/date.js";

export function useToday() {
  const [today, setToday] = useState(() => dateKey());
  useEffect(() => {
    let timer;
    function refresh() {
      clearTimeout(timer);
      setToday(dateKey());
      timer = setTimeout(refresh, millisecondsUntilTomorrow());
    }
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
