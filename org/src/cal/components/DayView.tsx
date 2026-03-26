import { useMemo } from "react";
import type { CalEventRecord } from "../types";
import { isSameDay, formatHour, hourSlots, formatTime } from "../dateUtils";

interface Props {
  date: Date;
  events: CalEventRecord[];
  onSelectTime: (d: Date) => void;
  onSelectEvent: (e: CalEventRecord) => void;
}

export function DayView({ date, events, onSelectTime, onSelectEvent }: Props) {
  const hours = hourSlots();

  const dayEvents = useMemo(
    () => events.filter((e) => {
      const start = new Date(e.event.start);
      const end = new Date(e.event.end);
      if (e.event.allDay) {
        return date >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
          date <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
      }
      return isSameDay(start, date);
    }),
    [events, date]
  );

  const allDayEvents = dayEvents.filter((e) => e.event.allDay);
  const timedEvents = dayEvents.filter((e) => !e.event.allDay);

  const eventsAtHour = (h: number) =>
    timedEvents.filter((e) => new Date(e.event.start).getHours() === h);

  return (
    <div className="cal-day-view">
      {allDayEvents.length > 0 && (
        <div className="cal-day-allday">
          <span className="cal-allday-label">All day</span>
          {allDayEvents.map((e) => (
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
      )}

      <div className="cal-day-hours">
        {hours.map((h) => {
          const hEvents = eventsAtHour(h);
          return (
            <div key={h} className="cal-day-hour-row">
              <div className="cal-time-gutter">{formatHour(h)}</div>
              <div
                className="cal-day-hour-cell"
                onClick={() => {
                  const t = new Date(date);
                  t.setHours(h, 0, 0, 0);
                  onSelectTime(t);
                }}
              >
                {hEvents.map((e) => {
                  const start = new Date(e.event.start);
                  const end = new Date(e.event.end);
                  const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 3600000));
                  return (
                    <div
                      key={e.rkey}
                      className="cal-day-event-block"
                      style={{
                        background: e.event.color ?? "#58a6ff",
                        height: `${duration * 100}%`,
                      }}
                      onClick={(ev) => { ev.stopPropagation(); onSelectEvent(e); }}
                    >
                      <span className="cal-event-time">{formatTime(start)} – {formatTime(end)}</span>
                      <span>{e.event.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
