import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function HomePage() {
  const { did } = useAuth();

  return (
    <div>
      <div className="card">
        <h2>Privacy-Preserving Polls on ATProto</h2>
        <p className="muted mb-12">
          Authenticated voting with anonymous ballot publication. Responders prove eligibility
          via ATProto, receive a one-time ballot credential, and submit votes anonymously.
          Accepted ballots are published to a service-controlled ATProto repo for public verification.
        </p>
        {did ? (
          <Link to="/create" className="btn btn-primary">Create a Poll</Link>
        ) : (
          <p className="muted">Log in with your ATProto handle to create or vote in polls.</p>
        )}
      </div>

      <div className="card">
        <h3>How It Works</h3>
        <ol style={{ paddingLeft: '20px', fontSize: '14px', lineHeight: '1.8' }}>
          <li>Poll host creates a poll with question and options</li>
          <li>Responders authenticate privately via ATProto</li>
          <li>Host issues a one-time ballot credential (one per eligible DID)</li>
          <li>Responder submits ballot anonymously using the credential</li>
          <li>Host publishes anonymized ballot to the public ATProto repo</li>
          <li>Anyone can verify the tally from the public ballot artifacts</li>
        </ol>
      </div>

      <div className="card">
        <h3>Enter a Poll ID</h3>
        <form
          onSubmit={e => {
            e.preventDefault();
            const input = (e.target as HTMLFormElement).elements.namedItem('pollId') as HTMLInputElement;
            if (input.value) window.location.href = `/poll/${input.value}`;
          }}
        >
          <div className="flex gap-8">
            <input name="pollId" type="text" placeholder="Paste poll UUID" style={{ marginBottom: 0 }} />
            <button type="submit" className="btn btn-primary">Go</button>
          </div>
        </form>
      </div>
    </div>
  );
}
