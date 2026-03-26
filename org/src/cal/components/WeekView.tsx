import { useMemo } from "react";
import type { CalEventRecord } from "../types";
import { startOfWeek, addDays, isToday, isSameDay, formatHour, hourSlots, formatTime } from "../dateUtils";

interface Props {
  date: Date;
  events: CalEventRecord[];
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalEventRecord) => void;
}

export function WeekView({ date, events, onSelectDate, onSelectEvent }: Props) {
  const weekStart = useMemo(() => startOfWeek(date), [date]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const hours = hourSlots();

  const eventsForDayHour = (d: Date, h: number) =>
    events.filter((e) => {
      if (e.event.allDay) return false;
      const start = new Date(e.event.start);
      return isSameDay(start, d) && start.getHours() === h;
    });

  const allDayEvents = (d: Date) =>
    events.filter((e) => {
      if (!e.event.allDay) return false;
      const start = new Date(e.event.start);
      const end = new Date(e.event.end);
      return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
        d <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });

  return (
    <div className="cal-week">
      {/* Day headers */}
      <div className="cal-week-headers">
        <div className="cal-time-gutter" />
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={`cal-week-day-header${isToday(d) ? " cal-today" : ""}`}
            onClick={() => onSelectDate(d)}
          >
            <span className="cal-week-day-name">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
            <span className="cal-week-day-num">{d.getDate()}</span>
          </div>
        ))}
      </div>

      {/* All-day row */}
      <div className="cal-week-allday">
        <div className="cal-time-gutter cal-allday-label">All day</div>
        {days.map((d) => {
          const ade = allDayEvents(d);
          return (
            <div key={d.toISOString()} className="cal-week-allday-cell">
              {ade.map((e) => (
                <div
                  key={e.rkey}
                  className="cal-week-event allday"
                  style={{ background: e.event.color ?? "#58a6ff" }}
                  onClick={() => onSelectEvent(e)}
                >
                  {e.event.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Hour grid */}
      <div className="cal-week-body">
        {hours.map((h) => (
          <div key={h} className="cal-week-hour-row">
            <div className="cal-time-gutter">{formatHour(h)}</div>
            {days.map((d) => {
              const cellEvents = eventsForDayHour(d, h);
              return (
                <div
                  key={d.toISOString()}
                  className="cal-week-cell"
                  onClick={() => {
                    const target = new Date(d);
                    target.setHours(h);
                    onSelectDate(target);
                  }}
                >
                  {cellEvents.map((e) => (
                    <div
                      key={e.rkey}
                      className="cal-week-event"
                      style={{ background: e.event.color ?? "#58a6ff" }}
                      onClick={(ev) => { ev.stopPropagation(); onSelectEvent(e); }}
                    >
                      <span className="cal-event-time">{formatTime(new Date(e.event.start))}</span>
                      {e.event.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
