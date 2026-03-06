import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createPoll } from '../lib/api';

const ELIGIBILITY_DESCRIPTIONS: Record<string, string> = {
  open: 'Any Bluesky user can vote.',
  did_list: 'Only specific DIDs you provide can vote.',
  followers: 'Only your followers can vote (snapshot at creation).',
  mutuals: 'Only your mutuals can vote (snapshot at creation).',
  at_list: 'Only members of an ATProto list can vote (snapshot at creation).',
};

export function CreatePollPage() {
  const { did } = useAuth();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [closesIn, setClosesIn] = useState('24');
  const [mode, setMode] = useState('trusted_host_v1');
  const [eligibilityMode, setEligibilityMode] = useState('open');
  const [didListText, setDidListText] = useState('');
  const [listUri, setListUri] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!did) {
    return <div className="card"><p className="muted">Please log in to create a poll.</p></div>;
  }

  const addOption = () => setOptions([...options, '']);
  const removeOption = (i: number) => setOptions(options.filter((_, j) => j !== i));
  const updateOption = (i: number, val: string) => {
    const copy = [...options];
    copy[i] = val;
    setOptions(copy);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const filtered = options.filter(o => o.trim());
    if (!question.trim() || filtered.length < 2) {
      setError('Need a question and at least 2 options');
      return;
    }

    if (eligibilityMode === 'at_list' && !listUri.trim()) {
      setError('Please provide an ATProto list URI');
      return;
    }

    let whitelistedDids: string[] | undefined;
    if (eligibilityMode === 'did_list') {
      whitelistedDids = didListText
        .split(/[\n,]+/)
        .map(d => d.trim())
        .filter(d => d.startsWith('did:'));
      if (whitelistedDids.length === 0) {
        setError('Please provide at least one valid DID (starting with did:)');
        return;
      }
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const close = new Date(now.getTime() + parseInt(closesIn) * 60 * 60 * 1000);
      const poll = await createPoll({
        question: question.trim(),
        options: filtered,
        opensAt: now.toISOString(),
        closesAt: close.toISOString(),
        mode,
        eligibilityMode,
        eligibilitySource: eligibilityMode === 'at_list' ? listUri.trim() : undefined,
        whitelistedDids,
      });
      navigate(`/poll/${poll.id}/admin`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h2>Create Poll</h2>
      <form onSubmit={handleSubmit}>
        <label>Question</label>
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="What should we decide?"
          maxLength={500}
        />

        <label>Options</label>
        {options.map((opt, i) => (
          <div key={i} className="flex gap-8" style={{ marginBottom: '4px' }}>
            <input
              type="text"
              value={opt}
              onChange={e => updateOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              style={{ marginBottom: 0 }}
            />
            {options.length > 2 && (
              <button type="button" className="btn btn-secondary" onClick={() => removeOption(i)}>
                X
              </button>
            )}
          </div>
        ))}
        {options.length < 20 && (
          <button type="button" className="btn btn-secondary mt-12" onClick={addOption}>
            + Add Option
          </button>
        )}

        <div className="mt-12">
          <label>Closes in (hours)</label>
          <select value={closesIn} onChange={e => setClosesIn(e.target.value)}>
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="24">24 hours</option>
            <option value="72">3 days</option>
            <option value="168">1 week</option>
          </select>
        </div>

        <div className="mt-12">
          <label>Mode</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="trusted_host_v1">Trusted Host (v1)</option>
            <option value="anon_credential_v2">Anonymous Credential (v2 scaffold)</option>
          </select>
          <p className="muted">
            {mode === 'trusted_host_v1'
              ? 'Host can link DID to vote (simpler, fully functional).'
              : 'Credential-based anonymity with blind signature upgrade path.'}
          </p>
        </div>

        <div className="mt-12">
          <label>Who can vote?</label>
          <select value={eligibilityMode} onChange={e => setEligibilityMode(e.target.value)}>
            <option value="open">Anyone on Bluesky</option>
            <option value="followers">My followers</option>
            <option value="mutuals">My mutuals</option>
            <option value="at_list">ATProto list members</option>
            <option value="did_list">Specific DIDs</option>
          </select>
          <p className="muted">{ELIGIBILITY_DESCRIPTIONS[eligibilityMode]}</p>
        </div>

        {eligibilityMode === 'did_list' && (
          <div className="mt-12">
            <label>Eligible DIDs (one per line or comma-separated)</label>
            <textarea
              value={didListText}
              onChange={e => setDidListText(e.target.value)}
              placeholder="did:plc:abc123...&#10;did:plc:def456..."
              rows={4}
            />
            {didListText && (
              <p className="muted">
                {didListText.split(/[\n,]+/).map(d => d.trim()).filter(d => d.startsWith('did:')).length} valid DIDs
              </p>
            )}
          </div>
        )}

        {eligibilityMode === 'at_list' && (
          <div className="mt-12">
            <label>ATProto list URI</label>
            <input
              type="text"
              value={listUri}
              onChange={e => setListUri(e.target.value)}
              placeholder="at://did:plc:.../app.bsky.graph.list/..."
            />
          </div>
        )}

        {(eligibilityMode === 'followers' || eligibilityMode === 'mutuals') && (
          <p className="muted mt-12">
            Your {eligibilityMode} will be snapshotted when you create the poll. You can re-sync from the admin page before opening.
          </p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="mt-12">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Poll'}
          </button>
        </div>
      </form>
    </div>
  );
}
