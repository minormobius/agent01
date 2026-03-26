import { useMemo } from "react";
import type { CalEventRecord } from "../types";
import { formatTime } from "../dateUtils";

interface Props {
  events: CalEventRecord[];
  onSelectEvent: (e: CalEventRecord) => void;
  orgNames: Map<string, string>;
}

export function AgendaView({ events, onSelectEvent, orgNames }: Props) {
  const sorted = useMemo(() => {
    const now = new Date();
    return [...events]
      .filter((e) => new Date(e.event.end) >= now)
      .sort((a, b) => new Date(a.event.start).getTime() - new Date(b.event.start).getTime());
  }, [events]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, CalEventRecord[]>();
    for (const e of sorted) {
      const dateKey = new Date(e.event.start).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });
      const existing = map.get(dateKey) ?? [];
      existing.push(e);
      map.set(dateKey, existing);
    }
    return map;
  }, [sorted]);

  if (sorted.length === 0) {
    return <div className="cal-agenda-empty">No upcoming events.</div>;
  }

  return (
    <div className="cal-agenda">
      {Array.from(grouped.entries()).map(([dateLabel, dayEvents]) => (
        <div key={dateLabel} className="cal-agenda-group">
          <div className="cal-agenda-date">{dateLabel}</div>
          {dayEvents.map((e) => (
            <div
              key={e.rkey}
              className="cal-agenda-item"
              style={{ borderLeftColor: e.event.color ?? "#58a6ff" }}
              onClick={() => onSelectEvent(e)}
            >
              <div className="cal-agenda-time">
                {e.event.allDay
                  ? "All day"
                  : `${formatTime(new Date(e.event.start))} – ${formatTime(new Date(e.event.end))}`}
              </div>
              <div className="cal-agenda-title">{e.event.title}</div>
              {e.event.location && (
                <div className="cal-agenda-location">{e.event.location}</div>
              )}
              {e.orgRkey !== "personal" && (
                <span className="cal-agenda-org">{orgNames.get(e.orgRkey) ?? e.orgRkey}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
