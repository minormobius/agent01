import { useMemo, useCallback, useRef } from "react";
import type { CalEventRecord } from "../types";
import { startOfWeek, addDays, isToday, WEEKDAYS } from "../dateUtils";

interface Props {
  date: Date;
  events: CalEventRecord[];
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalEventRecord) => void;
  onDateChange?: (d: Date) => void;
}

/** Build a 6-row × 14-column grid starting from the week containing `date` */
function quarterGrid(d: Date): Date[][] {
  let cursor = startOfWeek(d);
  const rows: Date[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: Date[] = [];
    for (let c = 0; c < 14; c++) {
      row.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    rows.push(row);
  }
  return rows;
}

export function QuarterView({ date, events, onSelectDate, onSelectEvent, onDateChange }: Props) {
  const rows = useMemo(() => quarterGrid(date), [date]);
  const scrollAccum = useRef(0);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      scrollAccum.current += e.deltaY;
      const threshold = 50;
      if (Math.abs(scrollAccum.current) >= threshold) {
        const direction = scrollAccum.current > 0 ? 1 : -1;
        scrollAccum.current = 0;
        onDateChange?.(addDays(date, direction * 7));
      }
    },
    [date, onDateChange],
  );

  const eventsForDay = (d: Date) =>
    events.filter((ev) => {
      const start = new Date(ev.event.start);
      const end = new Date(ev.event.end);
      return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
        d <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });

  // Double WEEKDAYS for the 14-column header
  const headerDays = [...WEEKDAYS, ...WEEKDAYS];

  return (
    <div className="cal-quarter" onWheel={handleWheel}>
      <div className="cal-quarter-header">
        {headerDays.map((d, i) => (
          <div key={i} className="cal-weekday">{d}</div>
        ))}
      </div>
      <div className="cal-quarter-grid">
        {rows.map((row, ri) => (
          <div key={ri} className="cal-quarter-row">
            {row.map((day) => {
              const dayEvents = eventsForDay(day);
              const monthChange = day.getDate() === 1;
              return (
                <div
                  key={day.toISOString()}
                  className={`cal-qday${isToday(day) ? " cal-today" : ""}${monthChange ? " cal-month-start" : ""}`}
                  onClick={() => onSelectDate(day)}
                  title={day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                >
                  <span className="cal-qday-num">
                    {day.getDate() === 1
                      ? day.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : day.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="cal-qday-dots">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.rkey}
                          className="cal-qday-dot"
                          style={{ background: ev.event.color ?? "#58a6ff" }}
                          onClick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                          title={ev.event.title}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
