import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createPoll } from '../lib/api';

export function CreatePollPage() {
  const { did } = useAuth();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [closesIn, setClosesIn] = useState('24'); // hours
  const [mode, setMode] = useState('trusted_host_v1');
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
