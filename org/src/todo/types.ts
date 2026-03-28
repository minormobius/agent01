/** To-do data model */

export interface TodoItem {
  title: string;
  done: boolean;
  priority: "low" | "medium" | "high";
  notes?: string;
  dueDate?: string; // ISO date
  tags?: string[];
  createdAt: string;
}

export interface TodoRecord {
  rkey: string;
  todo: TodoItem;
  authorDid: string;
  orgRkey: string; // "personal" or org rkey
}
