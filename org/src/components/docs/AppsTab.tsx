export function AppsTab() {
  return (
    <>
      <h2>Apps</h2>
      <p className="docs-lead">
        Each app reads and writes the same ATProto records through a shared
        encryption layer. They're different views of the same data — switch
        apps, keep context.
      </p>

      <section>
        <h3>Wave — Encrypted Messaging & Docs</h3>
        <p>
          Wave provides real-time communication through encrypted channels,
          threads, and collaborative documents. All message content is
          end-to-end encrypted using the org's tier DEKs.
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Concept</th>
              <th>Record</th>
              <th>Stored on</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Channel</td>
              <td><code>wave.channel</code></td>
              <td>Founder's PDS (plaintext name + tier)</td>
            </tr>
            <tr>
              <td>Thread</td>
              <td><code>wave.thread</code></td>
              <td>Creator's PDS (plaintext metadata, links to channel)</td>
            </tr>
            <tr>
              <td>Message / Doc edit</td>
              <td><code>wave.op</code></td>
              <td>Author's PDS (encrypted content)</td>
            </tr>
          </tbody>
        </table>
        <p>
          Channels belong to an org and a tier — only members at that tier or
          above can decrypt messages. Threads are either <strong>chat</strong>{" "}
          (append-only messages) or <strong>doc</strong> (composable edits that
          build a document). Ops support types: <code>message</code>,{" "}
          <code>doc_edit</code>, and <code>reaction</code>.
        </p>
        <p>
          New messages arrive via <strong>Jetstream</strong> — the client
          subscribes to <code>wave.op</code> events from all org members and
          decrypts them in real time using cached tier DEKs.
        </p>
      </section>

      <section>
        <h3>CRM — Deal Pipeline & Proposals</h3>
        <p>
          The CRM manages deals through a configurable pipeline. Each deal is a
          sealed envelope (<code>vault.sealed</code> with{" "}
          <code>innerType: "crm.deal"</code>) containing:
        </p>
        <ul>
          <li>Title, value, stage, assignee, contacts, notes</li>
          <li>Custom fields defined per org</li>
          <li>Stage history with timestamps</li>
        </ul>
        <p>
          Stage transitions can require <strong>workflow gate</strong> approval.
          When a deal moves from one stage to another, the client checks if any
          offices must sign off. If so, it creates a{" "}
          <code>vault.proposal</code> instead of updating the deal directly.
        </p>
        <p>
          The change control flow: proposer writes a proposal → required offices
          write <code>vault.approval</code> records → once all approvals are
          gathered, the proposer writes a new <code>vault.sealed</code> record
          with chain links (<code>previousDid/Rkey</code>) and a{" "}
          <code>vault.decision</code> for audit. The old record is superseded
          but never deleted — full history is preserved.
        </p>
      </section>

      <section>
        <h3>PM — Tasks & Kanban</h3>
        <p>
          Project management uses encrypted task records (
          <code>vault.sealed</code> with{" "}
          <code>innerType: "pm.task"</code>):
        </p>
        <ul>
          <li>
            <strong>Kanban board:</strong> Tasks flow through{" "}
            <code>backlog → todo → in-progress → review → done</code>
          </li>
          <li>
            <strong>Task fields:</strong> Title, description, status, priority
            (low/medium/high/critical), assignee, due date, tags
          </li>
          <li>
            <strong>Hierarchy:</strong> Tasks can have parent tasks via{" "}
            <code>parentTaskRkey</code> for work breakdown structures
          </li>
          <li>
            <strong>Cross-linking:</strong> Tasks can link to deals via{" "}
            <code>linkedDealRkey</code> and calendar events via{" "}
            <code>linkedEventRkey</code>
          </li>
          <li>
            <strong>Earned Value:</strong> Track estimate vs actual hours and
            percent complete for EVM metrics
          </li>
        </ul>
      </section>

      <section>
        <h3>Calendar — Encrypted Events</h3>
        <p>
          Calendar events are sealed envelopes with{" "}
          <code>innerType: "cal.event"</code>. Each event contains:
        </p>
        <ul>
          <li>Title, description, location</li>
          <li>Start/end times (ISO timestamps)</li>
          <li>All-day flag, recurrence rules</li>
          <li>Attendee DIDs</li>
        </ul>
        <p>
          Personal events use the self-derived DEK. Org events use the tier
          DEK so all members at that tier can see the calendar. The calendar
          view aggregates events from all accessible orgs plus personal events
          into a unified timeline.
        </p>
      </section>

      <section>
        <h3>MCP Server — Agentic Integration</h3>
        <p>
          The MCP (Model Context Protocol) server exposes all app functionality
          as tool calls for AI agents. An agent connected via MCP can:
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CRM</td>
              <td>List/create/update deals, manage proposals, approve changes</td>
            </tr>
            <tr>
              <td>Tasks</td>
              <td>Full task CRUD, kanban board view, status transitions</td>
            </tr>
            <tr>
              <td>Calendar</td>
              <td>List/create/update/delete events</td>
            </tr>
            <tr>
              <td>Contacts</td>
              <td>Directory management with deal linking</td>
            </tr>
            <tr>
              <td>Wave</td>
              <td>Read channels/threads, send messages, create threads</td>
            </tr>
            <tr>
              <td>Search</td>
              <td>Cross-domain search across all encrypted data</td>
            </tr>
            <tr>
              <td>Docs</td>
              <td>Compose doc thread edits into current state</td>
            </tr>
            <tr>
              <td>Workflows</td>
              <td>Define and evaluate automation rules</td>
            </tr>
            <tr>
              <td>Templates</td>
              <td>Reusable record templates with variable substitution</td>
            </tr>
            <tr>
              <td>Activity</td>
              <td>Aggregated feed of recent changes across all domains</td>
            </tr>
          </tbody>
        </table>
        <p>
          The MCP server runs as a stdio process, authenticates with the same
          PDS credentials, and uses the same encryption layer. An AI agent
          monitoring the activity feed can autonomously move tasks, respond to
          messages, develop opportunities, and coordinate workflows — all with
          the same end-to-end encryption guarantees as the human-facing apps.
        </p>
      </section>

      <section>
        <h3>Notifications</h3>
        <p>
          All apps share a unified notification system. When a significant
          action occurs (deal created, task assigned, message sent, event
          scheduled), the acting app publishes a{" "}
          <code>vault.notification</code> record. Other users discover these
          via Jetstream.
        </p>
        <p>
          Notifications support both targeted (specific DID) and broadcast
          (<code>targetDid: "*"</code>) delivery. Users control per-type
          preferences stored in <code>vault.notificationPrefs</code> on their
          own PDS.
        </p>
      </section>
    </>
  );
}
