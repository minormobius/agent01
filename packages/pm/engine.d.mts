// Types for engine.mjs. Generic over the task type, so callers with richer tasks (org's Task)
// get their own type back.
export interface PmTask {
  id: string; name: string; plannedCost: number; actualCost: number;
  plannedStart: string; plannedEnd: string; duration: number; percentComplete: number;
  parentId: string | null; queued?: boolean; reviewed?: boolean;
  originalEstimate?: { cost: number; duration: number };
}
export interface PmDependency { from: string; to: string }
export interface EvmResult { pv: number; ev: number; ac: number; bac: number; cv: number; sv: number; cpi: number; spi: number; eac: number; etc: number; vac: number }
export interface EsResult { es: number; at: number; svt: number; spit: number; eact: number; sac: number }

export function parseDuration(s: string): number;
export function durationToCalendarDays(hours: number): number;
export function fmtDuration(hours: number): string;
export function addDateDays(dateStr: string, calDays: number): string;
export function today(): string;
export function getChildren<T extends PmTask>(tasks: T[], parentId: string): T[];
export function getAllDescendants<T extends PmTask>(tasks: T[], parentId: string): T[];
export function getLeafTasks<T extends PmTask>(tasks: T[]): T[];
export function isParentTask<T extends PmTask>(tasks: T[], id: string): boolean;
export function getDepth<T extends PmTask>(tasks: T[], task: T): number;
export function getTreeOrder<T extends PmTask>(tasks: T[]): T[];
export function isHiddenByCollapse<T extends PmTask>(tasks: T[], task: T, collapsed: string[]): boolean;
export function rollUpParent<T extends PmTask>(tasks: T[], parentId: string): void;
export function computeEVM<T extends PmTask>(tasks: T[], asOfDate?: Date): EvmResult;
export function computeES<T extends PmTask>(tasks: T[], asOfDate?: Date): EsResult;
export function computeCriticalPath<T extends PmTask>(tasks: T[], deps: PmDependency[]): Set<string>;
export function syncTaskToLane<T extends PmTask>(task: T, lanes: { id: string; role: string }[]): string;
export function fmtNum(n: number, dec?: number): string;
export function idxClass(v: number, good?: number): string;
export function varClass(v: number): string;
