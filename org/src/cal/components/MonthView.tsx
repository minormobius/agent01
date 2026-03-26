import { useMemo } from "react";
import type { CalEventRecord } from "../types";
import { monthGrid, isToday, WEEKDAYS } from "../dateUtils";

interface Props {
  date: Date;
  events: CalEventRecord[];
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalEventRecord) => void;
}

export function MonthView({ date, events, onSelectDate, onSelectEvent }: Props) {
  const weeks = useMemo(() => monthGrid(date), [date]);
  const currentMonth = date.getMonth();

  const eventsForDay = (d: Date) =>
    events.filter((e) => {
      const start = new Date(e.event.start);
      const end = new Date(e.event.end);
      return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
        d <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });

  return (
    <div className="cal-month">
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
              const isOtherMonth = day.getMonth() !== currentMonth;
              return (
                <div
                  key={day.toISOString()}
                  className={`cal-day${isToday(day) ? " cal-today" : ""}${isOtherMonth ? " cal-other-month" : ""}`}
                  onClick={() => onSelectDate(day)}
                >
                  <span className="cal-day-num">{day.getDate()}</span>
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
