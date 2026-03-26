import { useState } from "react";
import type { CalEvent, CalEventRecord } from "../types";
import { EVENT_COLORS, DEFAULT_COLOR } from "../types";

interface Props {
  existing?: CalEventRecord;
  defaultStart?: string; // ISO date or datetime
  onSave: (event: CalEvent, existingRkey?: string) => Promise<void>;
  onCancel: () => void;
  onDelete?: (rkey: string) => Promise<void>;
}

export function EventForm({ existing, defaultStart, onSave, onCancel, onDelete }: Props) {
  const e = existing?.event;
  const [title, setTitle] = useState(e?.title ?? "");
  const [allDay, setAllDay] = useState(e?.allDay ?? false);
  const [start, setStart] = useState(() => {
    if (e) return e.start.slice(0, 16); // trim to datetime-local format
    if (defaultStart) return defaultStart.length === 10 ? defaultStart + "T09:00" : defaultStart.slice(0, 16);
    const now = new Date();
    now.setMinutes(0);
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);
  });
  const [end, setEnd] = useState(() => {
    if (e) return e.end.slice(0, 16);
    const s = new Date(start);
    s.setHours(s.getHours() + 1);
    return s.toISOString().slice(0, 16);
  });
  const [location, setLocation] = useState(e?.location ?? "");
  const [notes, setNotes] = useState(e?.notes ?? "");
  const [color, setColor] = useState(e?.color ?? DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const event: CalEvent = {
        title: title.trim(),
        start: allDay ? start.slice(0, 10) + "T00:00:00.000Z" : new Date(start).toISOString(),
        end: allDay ? end.slice(0, 10) + "T23:59:59.000Z" : new Date(end).toISOString(),
        allDay,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        color,
        createdAt: e?.createdAt ?? new Date().toISOString(),
      };
      await onSave(event, existing?.rkey);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cal-modal-overlay" onClick={onCancel}>
      <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{existing ? "Edit Event" : "New Event"}</h3>
        <div className="cal-form">
          <input
            className="cal-input"
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <label className="cal-checkbox">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>

          <div className="cal-form-row">
            <div className="cal-form-field">
              <label>Start</label>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? start.slice(0, 10) : start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="cal-form-field">
              <label>End</label>
              <input
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? end.slice(0, 10) : end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <input
            className="cal-input"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          <textarea
            className="cal-input cal-textarea"
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />

          <div className="cal-colors">
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                className={`cal-color-btn${c === color ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          <div className="cal-form-actions">
            {existing && onDelete && (
              <button className="btn-danger" onClick={() => onDelete(existing.rkey)}>
                Delete
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving || !title.trim()}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
