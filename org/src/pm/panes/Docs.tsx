/**
 * Docs pane — PM reference guide covering EVM, Earned Schedule,
 * critical path, kanban workflow, and ATProto sync.
 */

export function Docs() {
  return (
    <div className="docs-pane">
      <h2>Project Management Reference</h2>

      <section className="docs-section">
        <h3>Earned Value Management (EVM)</h3>
        <p>
          EVM measures project performance by comparing planned work against completed work and
          actual costs. The dashboard shows these key metrics:
        </p>
        <dl className="docs-dl">
          <dt>PV (Planned Value)</dt>
          <dd>Budgeted cost of work scheduled to date.</dd>
          <dt>EV (Earned Value)</dt>
          <dd>Budgeted cost of work actually completed (PV * % complete).</dd>
          <dt>AC (Actual Cost)</dt>
          <dd>Real cost spent on completed work.</dd>
          <dt>BAC (Budget at Completion)</dt>
          <dd>Total planned budget for all tasks.</dd>
          <dt>CPI (Cost Performance Index)</dt>
          <dd>
            EV / AC. Above 1.0 = under budget. Below 1.0 = over budget.
          </dd>
          <dt>SPI (Schedule Performance Index)</dt>
          <dd>
            EV / PV. Above 1.0 = ahead of schedule. Below 1.0 = behind.
          </dd>
          <dt>EAC (Estimate at Completion)</dt>
          <dd>BAC / CPI — projected total cost based on current spending efficiency.</dd>
          <dt>ETC (Estimate to Complete)</dt>
          <dd>EAC - AC — remaining cost to finish the project.</dd>
          <dt>VAC (Variance at Completion)</dt>
          <dd>BAC - EAC — expected budget surplus (positive) or overrun (negative).</dd>
        </dl>
      </section>

      <section className="docs-section">
        <h3>Earned Schedule (ES)</h3>
        <p>
          Earned Schedule extends EVM by measuring schedule performance in time units instead of
          cost. It fixes the known SPI convergence problem where traditional SPI always trends toward
          1.0 near the end of a late project.
        </p>
        <dl className="docs-dl">
          <dt>ES (Earned Schedule)</dt>
          <dd>The point in time when the current EV should have been achieved per the plan.</dd>
          <dt>AT (Actual Time)</dt>
          <dd>Elapsed calendar time from project start.</dd>
          <dt>SV(t) (Schedule Variance - time)</dt>
          <dd>ES - AT. Positive = ahead, negative = behind.</dd>
          <dt>SPI(t) (Schedule Performance Index - time)</dt>
          <dd>ES / AT. More reliable than traditional SPI late in the project.</dd>
          <dt>EAC(t) (Estimate at Completion - time)</dt>
          <dd>SAC / SPI(t) — projected total duration based on current schedule efficiency.</dd>
          <dt>SAC (Scheduled at Completion)</dt>
          <dd>Total planned project duration in calendar days.</dd>
        </dl>
      </section>

      <section className="docs-section">
        <h3>Critical Path</h3>
        <p>
          The critical path is the longest chain of dependent tasks through the project. Any delay on
          a critical-path task directly delays the project finish date.
        </p>
        <ul className="docs-ul">
          <li>Critical tasks are highlighted in red on the Gantt chart.</li>
          <li>Tasks not on the critical path have "float" — slack time before they affect the finish.</li>
          <li>
            The algorithm performs a forward pass (earliest start/finish) and backward pass (latest
            start/finish), then identifies tasks where float = 0.
          </li>
          <li>Adding dependencies between tasks can change the critical path.</li>
        </ul>
      </section>

      <section className="docs-section">
        <h3>S-Curve</h3>
        <p>
          The S-Curve chart plots cumulative PV, EV, and AC over time. The characteristic "S" shape
          appears because projects typically start slow, accelerate, then taper off.
        </p>
        <ul className="docs-ul">
          <li>
            <strong>PV line</strong> (blue) shows the planned spending trajectory.
          </li>
          <li>
            <strong>EV line</strong> (green) shows earned value — if below PV, you're behind
            schedule.
          </li>
          <li>
            <strong>AC line</strong> (red) shows actual spend — if above EV, you're over budget.
          </li>
          <li>
            <strong>Baselines</strong> (dashed) let you compare current plan against earlier
            snapshots.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <h3>Kanban Board</h3>
        <p>
          The Kanban board shows leaf tasks (non-parent) across workflow lanes. Dragging a card
          between lanes automatically updates the task's workflow state:
        </p>
        <ul className="docs-ul">
          <li><strong>Backlog</strong> — not queued, not started.</li>
          <li><strong>To Do</strong> — queued but not started.</li>
          <li><strong>In Progress</strong> — active work (sets % to 5 if 0).</li>
          <li><strong>Review</strong> — 100% complete, awaiting review.</li>
          <li><strong>Done</strong> — 100% complete, reviewed.</li>
        </ul>
      </section>

      <section className="docs-section">
        <h3>Resources</h3>
        <p>
          The resource loading chart shows weekly hours per team member as stacked bars. The dashed
          orange line indicates the maximum hours-per-week capacity. Members above the line are
          overloaded.
        </p>
        <p>
          Utilization percentage = average weekly hours / max hours per week. Use this to balance
          workload and identify bottlenecks.
        </p>
      </section>

      <section className="docs-section">
        <h3>ATProto Sync</h3>
        <p>
          The Sync tab pushes and pulls your project data to your ATProto Personal Data Server (PDS).
          All data is encrypted client-side before leaving your browser.
        </p>
        <dl className="docs-dl">
          <dt>Encryption</dt>
          <dd>
            AES-256-GCM via the vault crypto layer. Your passphrase derives a key encryption key
            (PBKDF2, 600k iterations), which protects your ECDH identity key. The identity key
            derives the data encryption key (DEK) used for all records.
          </dd>
          <dt>Record layout</dt>
          <dd>
            Project state is stored as <code>vault.sealed</code> records with inner types{" "}
            <code>com.minomobi.pm.project</code>, <code>com.minomobi.pm.schedule</code>, and{" "}
            <code>com.minomobi.pm.team</code>.
          </dd>
          <dt>Push</dt>
          <dd>Encrypts current state and writes to PDS. Overwrites the previous remote copy.</dd>
          <dt>Pull</dt>
          <dd>
            Fetches sealed records from PDS, decrypts, and replaces local state. Use this to sync
            across devices.
          </dd>
        </dl>
      </section>

      <section className="docs-section">
        <h3>Duration Format</h3>
        <p>
          Tasks accept durations in a compact format combining weeks, days, and hours:
        </p>
        <ul className="docs-ul">
          <li><code>2w</code> — 2 weeks (80 hours)</li>
          <li><code>3d</code> — 3 days (24 hours)</li>
          <li><code>4h</code> — 4 hours</li>
          <li><code>1w2d</code> — 1 week + 2 days (56 hours)</li>
          <li><code>2w3d4h</code> — 2 weeks + 3 days + 4 hours (108 hours)</li>
          <li>Plain numbers are treated as days (e.g. <code>5</code> = 5 days = 40 hours).</li>
        </ul>
      </section>
    </div>
  );
}
