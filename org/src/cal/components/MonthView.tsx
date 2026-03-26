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

/** Rolling 6-week grid anchored to the week containing `date` */
function rollingGrid(d: Date): Date[][] {
  let cursor = startOfWeek(d);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function MonthView({ date, events, onSelectDate, onSelectEvent, onDateChange }: Props) {
  const weeks = useMemo(() => rollingGrid(date), [date]);
  const anchorMonth = date.getMonth();
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
    events.filter((e) => {
      const start = new Date(e.event.start);
      const end = new Date(e.event.end);
      return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
        d <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });

  return (
    <div className="cal-month" onWheel={handleWheel}>
      <div className="cal-month-header">
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
      </div>
      <div className="cal-month-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="cal-week-row">
            {week.map((day) => {
              const dayEvents = eventsForDay(day);
              const isOtherMonth = day.getMonth() !== anchorMonth;
              return (
                <div
                  key={day.toISOString()}
                  className={`cal-day${isToday(day) ? " cal-today" : ""}${isOtherMonth ? " cal-other-month" : ""}${day.getDate() === 1 ? " cal-month-start" : ""}`}
                  onClick={() => onSelectDate(day)}
                >
                  <span className="cal-day-num">
                    {day.getDate() === 1
                      ? day.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : day.getDate()}
                  </span>
                  <div className="cal-day-events">
                    {dayEvents.slice(0, 3).map((e) => (
                      <div
                        key={e.rkey}
                        className="cal-day-event"
                        style={{ borderLeftColor: e.event.color ?? "#58a6ff" }}
                        onClick={(ev) => { ev.stopPropagation(); onSelectEvent(e); }}
                        title={e.event.title}
                      >
                        {e.event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="cal-day-more">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
