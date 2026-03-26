/** Calendar data model */

export interface CalEvent {
  title: string;
  start: string;       // ISO datetime
  end: string;         // ISO datetime
  allDay?: boolean;
  location?: string;
  notes?: string;
  color?: string;
  /** If linked to a PM task */
  pmTaskId?: string;
  createdAt: string;
}

export interface CalEventRecord {
  rkey: string;
  event: CalEvent;
  authorDid: string;
  orgRkey: string; // "personal" or org rkey
}

export type CalView = "month" | "week" | "day" | "agenda";

/** Date range for the current view */
export interface ViewRange {
  start: Date;
  end: Date;
}

export const EVENT_COLORS = [
  "#58a6ff", // blue
  "#3fb950", // green
  "#f85149", // red
  "#d2a8ff", // purple
  "#f0883e", // orange
  "#56d4dd", // teal
  "#e3b341", // yellow
  "#ff7b72", // coral
] as const;

export const DEFAULT_COLOR = EVENT_COLORS[0];
