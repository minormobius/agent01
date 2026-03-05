import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPoll, getBallots, getTally, getAudit } from '../lib/api';
import { recomputeTally } from '@anon-polls/shared';

/**
 * Audit page — public verification interface.
 *
 * Shows:
 * - Raw anonymized ballots with token messages, signatures, and nullifiers
 * - Rolling hash audit transcript
 * - Client-side tally recomputation for independent verification
 */

export function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const [poll, setPoll] = useState<any>(null);
  const [ballots, setBallots] = useState<any[]>([]);
  const [tally, setTally] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [recomputed, setRecomputed] = useState<Record<string, number> | null>(null);
  const [tallyMatch, setTallyMatch] = useState<boolean | null>(null);

  useEffect(() => {
    if (!id) return;
    getPoll(id).then(setPoll).catch(() => {});
    getBallots(id).then(d => setBallots(d.ballots || [])).catch(() => {});
    getTally(id).then(setTally).catch(() => {});
    getAudit(id).then(d => setAudit(d.events || [])).catch(() => {});
  }, [id]);

  const handleRecompute = () => {
    if (!poll) return;
    const result = recomputeTally(
      ballots.map(b => ({ option: b.option, accepted: true })),
      poll.options.length
    );
    setRecomputed(result);
    if (tally) {
      setTallyMatch(JSON.stringify(result) === JSON.stringify(tally.countsByOption));
    }
  };

  // Check for duplicate nullifiers
  const nullifiers = ballots.map(b => b.nullifier);
  const uniqueNullifiers = new Set(nullifiers);
  const hasDuplicates = nullifiers.length !== uniqueNullifiers.size;

  if (!poll) return <div className="card"><p className="muted">Loading...</p></div>;

  return (
    <div>
      <div className="card">
        <h2>Audit: {poll.question}</h2>
        <p className="muted">
          {ballots.length} accepted ballot{ballots.length !== 1 ? 's' : ''} &middot;
          {uniqueNullifiers.size} unique nullifier{uniqueNullifiers.size !== 1 ? 's' : ''}
          {hasDuplicates && <span className="error"> DUPLICATE NULLIFIERS DETECTED</span>}
        </p>
      </div>

      <div className="card">
        <h3>Independent Tally Verification</h3>
        <p className="muted mb-12">
          Recompute the tally from the raw ballot data in your browser.
          This proves the published tally matches the accepted ballots.
        </p>
        <button className="btn btn-primary" onClick={handleRecompute}>
          Recompute Tally
        </button>
        {recomputed && (
          <div className="mt-12">
            <p>
              <strong>Recomputed:</strong>{' '}
              {Object.entries(recomputed).map(([k, v]) => `${poll.options[parseInt(k)]}: ${v}`).join(', ')}
            </p>
            {tallyMatch !== null && (
              <p className={tallyMatch ? 'success' : 'error'}>
                {tallyMatch ? 'Tally matches server' : 'TALLY MISMATCH — investigation needed'}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Raw Ballots</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="audit-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Option</th>
                <th>Token Message</th>
                <th>Signature</th>
                <th>Nullifier</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {ballots.map((b: any) => (
                <tr key={b.public_serial}>
                  <td>{b.public_serial}</td>
                  <td>{poll.options[b.option]}</td>
                  <td className="truncate" title={b.token_message}>
                    {b.token_message?.slice(0, 16)}...
                  </td>
                  <td className="truncate" title={b.issuer_signature}>
                    {b.issuer_signature?.slice(0, 16)}...
                  </td>
                  <td className="truncate" title={b.nullifier}>
                    {b.nullifier?.slice(0, 16)}...
                  </td>
                  <td>{new Date(b.submitted_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {audit.length > 0 && (
        <div className="card">
          <h3>Audit Transcript ({audit.length} events)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Rolling Hash</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e: any) => (
                  <tr key={e.id}>
                    <td>{e.event_type}</td>
                    <td className="truncate" title={e.rolling_hash}>
                      {e.rolling_hash?.slice(0, 24)}...
                    </td>
                    <td>{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-12">
        <Link to={`/poll/${id}`} className="btn btn-secondary">Back to Poll</Link>
      </div>
    </div>
  );
}
