/**
 * CalendarApp — encrypted calendar on ATProto.
 * Personal + org events, with PM task deadline integration.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "../router";
import type { VaultState } from "../App";
import type { PdsClient } from "../pds";
import type { OrgRecord, OrgContext } from "../crm/types";
import type { CalEvent, CalEventRecord, CalView } from "./types";
import {
  keyringRkeyForTier,
  loadPersonalEvents,
  loadOrgEvents,
  saveEvent,
  updateEvent,
  deleteEvent,
} from "./context";
import { broadcastNotification } from "../crm/context";
import { MonthView } from "./components/MonthView";
import { QuarterView } from "./components/QuarterView";
import { WeekView } from "./components/WeekView";
import { DayView } from "./components/DayView";
import { AgendaView } from "./components/AgendaView";
import { EventForm } from "./components/EventForm";
import {
  addMonths,
  addDays,
  startOfWeek,
  endOfWeek,
  formatMonth,
  formatQuarterRange,
  formatWeekRange,
  formatDayHeader,
} from "./dateUtils";

type OrgFilter = "all" | "personal" | string;

interface Props {
  vault?: VaultState | null;
  pds?: PdsClient | null;
  orgs?: OrgRecord[];
  orgContexts?: Map<string, OrgContext>;
}

/** Read PM task deadlines from localStorage as synthetic calendar events */
function loadPmTasks(orgScope?: string): CalEventRecord[] {
  const key = orgScope ? `mino-pm-state:${orgScope}` : "mino-pm-state";
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const state = JSON.parse(raw) as { tasks?: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; percentComplete: number }> };
    if (!state.tasks) return [];
    return state.tasks
      .filter((t) => t.plannedStart && t.plannedEnd)
      .map((t) => ({
        rkey: `pm:${t.id}`,
        event: {
          title: `[PM] ${t.name}`,
          start: t.plannedStart + "T00:00:00.000Z",
          end: t.plannedEnd + "T23:59:59.000Z",
          allDay: true,
          color: t.percentComplete >= 100 ? "#3fb950" : "#d2a8ff",
          pmTaskId: t.id,
          createdAt: "",
        },
        authorDid: "local",
        orgRkey: orgScope ?? "personal",
      }));
  } catch {
    return [];
  }
}

export function CalendarApp({ vault, pds, orgs: sharedOrgs = [], orgContexts: sharedContexts = new Map() }: Props) {
  const { navigate } = useRouter();

  const [events, setEvents] = useState<CalEventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<CalView>("month");
  const [date, setDate] = useState(new Date());
  const [filterOrg, setFilterOrg] = useState<OrgFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalEventRecord | undefined>();
  const [defaultStart, setDefaultStart] = useState<string | undefined>();
  const [showPmTasks, setShowPmTasks] = useState(true);

  const loadedRef = useRef(false);

  // Load events on mount (org contexts come pre-built from hub)
  useEffect(() => {
    if (!vault || !pds || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const personalEvents = await loadPersonalEvents(pds, vault.dek, vault.session.did);
        const allOrgEvents: CalEventRecord[] = [];
        for (const ctx of sharedContexts.values()) {
          try {
            allOrgEvents.push(...await loadOrgEvents(pds, ctx));
          } catch (err) {
            console.warn(`Cal: failed to load org ${ctx.org.org.name}:`, err);
          }
        }
        setEvents([...personalEvents, ...allOrgEvents]);
      } finally {
        setLoading(false);
      }
    })();
  }, [vault, pds, sharedContexts]);

  // PM task events
  const pmTasks = useMemo(() => {
    if (!showPmTasks) return [];
    const tasks: CalEventRecord[] = [];
    tasks.push(...loadPmTasks()); // personal PM
    for (const org of sharedOrgs) {
      tasks.push(...loadPmTasks(org.rkey));
    }
    return tasks;
  }, [showPmTasks, sharedOrgs]);

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = [...events, ...pmTasks];
    if (filterOrg === "personal") {
      result = result.filter((e) => e.orgRkey === "personal");
    } else if (filterOrg !== "all") {
      result = result.filter((e) => e.orgRkey === filterOrg);
    }
    return result;
  }, [events, pmTasks, filterOrg]);

  // Org names map
  const orgNames = useMemo(() => {
    const map = new Map<string, string>();
    map.set("personal", "Personal");
    for (const org of sharedOrgs) map.set(org.rkey, org.org.name);
    return map;
  }, [sharedOrgs]);

  // Active org context
  const activeOrg = filterOrg !== "all" && filterOrg !== "personal"
    ? sharedContexts.get(filterOrg) ?? null
    : null;

  // Navigation
  const navPrev = useCallback(() => {
    if (view === "month") setDate((d) => addMonths(d, -1));
    else if (view === "quarter") setDate((d) => addDays(d, -14));
    else if (view === "week") setDate((d) => addDays(d, -7));
    else setDate((d) => addDays(d, -1));
  }, [view]);

  const navNext = useCallback(() => {
    if (view === "month") setDate((d) => addMonths(d, 1));
    else if (view === "quarter") setDate((d) => addDays(d, 14));
    else if (view === "week") setDate((d) => addDays(d, 7));
    else setDate((d) => addDays(d, 1));
  }, [view]);

  const navToday = useCallback(() => setDate(new Date()), []);

  // Event handlers
  const handleSelectDate = useCallback((d: Date) => {
    if (view === "month") {
      setDate(d);
      setView("day");
    } else {
      setDefaultStart(d.toISOString().slice(0, 16));
      setEditingEvent(undefined);
      setShowForm(true);
    }
  }, [view]);

  const handleSelectEvent = useCallback((e: CalEventRecord) => {
    if (e.rkey.startsWith("pm:")) return; // PM tasks are read-only
    setEditingEvent(e);
    setDefaultStart(undefined);
    setShowForm(true);
  }, []);

  const handleSaveEvent = useCallback(
    async (event: CalEvent, existingRkey?: string) => {
      if (!pds || !vault) throw new Error("Not authenticated");

      let dek: CryptoKey;
      let keyringRkey: string;
      let orgRkey = "personal";

      if (activeOrg) {
        const tierName = activeOrg.myTierName;
        const tierDek = activeOrg.tierDeks.get(tierName);
        if (!tierDek) throw new Error(`No access to tier: ${tierName}`);
        dek = tierDek;
        const tierDef = activeOrg.org.org.tiers.find((t) => t.name === tierName);
        const epoch = tierDef?.currentEpoch ?? 0;
        keyringRkey = keyringRkeyForTier(activeOrg.org.rkey, tierName, epoch);
        orgRkey = activeOrg.org.rkey;
      } else {
        dek = vault.dek;
        keyringRkey = "self";
      }

      if (existingRkey) {
        const { rkey: newRkey } = await updateEvent(pds, existingRkey, event, dek, keyringRkey);
        setEvents((prev) => [
          ...prev.filter((e) => e.rkey !== existingRkey),
          { rkey: newRkey, event, authorDid: vault.session.did, orgRkey },
        ]);
      } else {
        const { rkey } = await saveEvent(pds, event, dek, keyringRkey);
        setEvents((prev) => [...prev, { rkey, event, authorDid: vault.session.did, orgRkey }]);
      }

      // Broadcast calendar event notification
      if (activeOrg) {
        broadcastNotification(
          pds, "cal-event", activeOrg.org.rkey, activeOrg.org.org.name,
          {
            type: "cal-event",
            orgRkey: activeOrg.org.rkey,
            orgName: activeOrg.org.org.name,
            eventTitle: event.title,
            eventDate: event.start,
            senderHandle: vault.session.handle,
            createdAt: new Date().toISOString(),
          },
          vault.session.did, vault.session.handle, undefined, activeOrg,
        ).catch(() => {});
      }

      setShowForm(false);
      setEditingEvent(undefined);
    },
    [pds, vault, activeOrg]
  );

  const handleDeleteEvent = useCallback(
    async (rkey: string) => {
      if (!pds) throw new Error("Not authenticated");
      await deleteEvent(pds, rkey);
      setEvents((prev) => prev.filter((e) => e.rkey !== rkey));
      setShowForm(false);
      setEditingEvent(undefined);
    },
    [pds]
  );

  // Guards
  if (!vault || !pds) {
    return (
      <div className="cal-container">
        <div className="cal-empty">
          <p>Not logged in.</p>
          <button className="btn-primary" onClick={() => navigate("/")}>Back to Hub</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cal-container">
        <div className="loading">Loading calendar...</div>
      </div>
    );
  }

  // Header label
  const headerLabel = view === "month"
    ? formatMonth(date)
    : view === "quarter"
      ? formatQuarterRange(startOfWeek(date))
      : view === "week"
        ? formatWeekRange(startOfWeek(date), endOfWeek(date))
        : view === "day"
          ? formatDayHeader(date)
          : "Agenda";

  return (
    <div className="cal-container">
      <header className="cal-header">
        <div className="cal-header-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to Hub">
            &larr;
          </button>
          <select
            className="org-select"
            value={filterOrg}
            onChange={(e) => setFilterOrg(e.target.value as OrgFilter)}
          >
            <option value="all">All Calendars</option>
            <option value="personal">Personal</option>
            {sharedOrgs.map((o) => (
              <option key={o.rkey} value={o.rkey}>{o.org.name}</option>
            ))}
          </select>
        </div>

        <div className="cal-header-nav">
          <button className="btn-secondary btn-sm" onClick={navPrev}>&lsaquo;</button>
          <button className="btn-secondary btn-sm" onClick={navToday}>Today</button>
          <button className="btn-secondary btn-sm" onClick={navNext}>&rsaquo;</button>
          <span className="cal-header-label">{headerLabel}</span>
        </div>

        <div className="cal-header-right">
          <label className="cal-checkbox cal-pm-toggle">
            <input
              type="checkbox"
              checked={showPmTasks}
              onChange={(e) => setShowPmTasks(e.target.checked)}
            />
            PM tasks
          </label>
          <nav className="cal-view-tabs">
            {(["month", "quarter", "week", "day", "agenda"] as CalView[]).map((v) => (
              <button
                key={v}
                className={`cal-view-tab${view === v ? " active" : ""}`}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </nav>
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              setEditingEvent(undefined);
              setDefaultStart(undefined);
              setShowForm(true);
            }}
          >
            + Event
          </button>
        </div>
      </header>

      <div className="cal-body">
        {view === "month" && (
          <MonthView
            date={date}
            events={filteredEvents}
            onSelectDate={handleSelectDate}
            onSelectEvent={handleSelectEvent}
            onDateChange={setDate}
          />
        )}
        {view === "quarter" && (
          <QuarterView
            date={date}
            events={filteredEvents}
            onSelectDate={handleSelectDate}
            onSelectEvent={handleSelectEvent}
            onDateChange={setDate}
          />
        )}
        {view === "week" && (
          <WeekView
            date={date}
            events={filteredEvents}
            onSelectDate={handleSelectDate}
            onSelectEvent={handleSelectEvent}
          />
        )}
        {view === "day" && (
          <DayView
            date={date}
            events={filteredEvents}
            onSelectTime={handleSelectDate}
            onSelectEvent={handleSelectEvent}
          />
        )}
        {view === "agenda" && (
          <AgendaView
            events={filteredEvents}
            onSelectEvent={handleSelectEvent}
            orgNames={orgNames}
          />
        )}
      </div>

      {showForm && (
        <EventForm
          existing={editingEvent}
          defaultStart={defaultStart}
          onSave={handleSaveEvent}
          onCancel={() => { setShowForm(false); setEditingEvent(undefined); }}
          onDelete={editingEvent && editingEvent.authorDid === vault.session.did ? handleDeleteEvent : undefined}
        />
      )}
    </div>
  );
}
