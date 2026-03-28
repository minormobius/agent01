import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createSurvey } from '../lib/api';

const ELIGIBILITY_DESCRIPTIONS: Record<string, string> = {
  open: 'Any Bluesky user can respond.',
  did_list: 'Only specific DIDs you provide can respond.',
  followers: 'Only your followers can respond (snapshot at creation).',
  mutuals: 'Only your mutuals can respond (snapshot at creation).',
  at_list: 'Only members of an ATProto list can respond (snapshot at creation).',
};

type QuestionType = 'single_choice' | 'ranking';

interface QuestionDraft {
  question: string;
  options: string[];
  required: boolean;
  questionType: QuestionType;
}

export function CreateSurveyPage() {
  const { did } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { question: '', options: ['', ''], required: true, questionType: 'single_choice' },
  ]);
  const [closesIn, setClosesIn] = useState('72');
  const [eligibilityMode, setEligibilityMode] = useState('open');
  const [didListText, setDidListText] = useState('');
  const [listUri, setListUri] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!did) {
    return <div className="card"><p className="muted">Please log in to create a survey.</p></div>;
  }

  const addQuestion = () => {
    if (questions.length >= 50) return;
    setQuestions([...questions, { question: '', options: ['', ''], required: true, questionType: 'single_choice' }]);
  };

  const removeQuestion = (i: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, j) => j !== i));
  };

  const duplicateQuestion = (i: number) => {
    if (questions.length >= 50) return;
    const src = questions[i];
    const copy = [...questions];
    copy.splice(i + 1, 0, {
      question: '',
      options: [...src.options],
      required: src.required,
      questionType: src.questionType,
    });
    setQuestions(copy);
  };

  const updateQuestion = (i: number, field: keyof QuestionDraft, value: any) => {
    const copy = [...questions];
    (copy[i] as any)[field] = value;
    setQuestions(copy);
  };

  const addOption = (qi: number) => {
    const copy = [...questions];
    if (copy[qi].options.length >= 20) return;
    copy[qi].options = [...copy[qi].options, ''];
    setQuestions(copy);
  };

  const removeOption = (qi: number, oi: number) => {
    const copy = [...questions];
    if (copy[qi].options.length <= 2) return;
    copy[qi].options = copy[qi].options.filter((_, j) => j !== oi);
    setQuestions(copy);
  };

  const updateOption = (qi: number, oi: number, val: string) => {
    const copy = [...questions];
    copy[qi].options = [...copy[qi].options];
    copy[qi].options[oi] = val;
    setQuestions(copy);
  };

  const moveQuestion = (i: number, direction: -1 | 1) => {
    const j = i + direction;
    if (j < 0 || j >= questions.length) return;
    const copy = [...questions];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setQuestions(copy);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Survey needs a title');
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        setError(`Question ${i + 1} needs text`);
        return;
      }
      const validOpts = q.options.filter(o => o.trim());
      if (validOpts.length < 2) {
        setError(`Question ${i + 1} needs at least 2 options`);
        return;
      }
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
        setError('Please provide at least one valid DID');
        return;
      }
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const close = new Date(now.getTime() + parseInt(closesIn) * 60 * 60 * 1000);
      const survey = await createSurvey({
        title: title.trim(),
        description: description.trim() || undefined,
        questions: questions.map(q => ({
          question: q.question.trim(),
          options: q.options.filter(o => o.trim()),
          required: q.required,
          questionType: q.questionType,
        })),
        opensAt: now.toISOString(),
        closesAt: close.toISOString(),
        eligibilityMode,
        eligibilitySource: eligibilityMode === 'at_list' ? listUri.trim() : undefined,
        whitelistedDids,
      });
      navigate(`/survey/${survey.id}/admin`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h2>Create Survey</h2>
      <p className="muted mb-12">Multi-question anonymous survey with cryptographic ballot secrecy.</p>
      <form onSubmit={handleSubmit}>
        <label>Survey Title</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What is this survey about?"
          maxLength={500}
        />

        <label>Description (optional)</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Brief description for respondents..."
          rows={2}
          maxLength={2000}
        />

        <div className="mt-12" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="flex gap-8" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ margin: 0 }}>Questions ({questions.length})</label>
            {questions.length < 50 && (
              <button type="button" className="btn btn-secondary" onClick={addQuestion}>
                + Add Question
              </button>
            )}
          </div>
        </div>

        {questions.map((q, qi) => (
          <div
            key={qi}
            className="mt-12"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div className="flex gap-8" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>Q{qi + 1}</strong>
              <div className="flex gap-8">
                <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => moveQuestion(qi, -1)} disabled={qi === 0}>Up</button>
                <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => moveQuestion(qi, 1)} disabled={qi === questions.length - 1}>Down</button>
                <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => duplicateQuestion(qi)} disabled={questions.length >= 50}
                  title="Add new question with same options">Duplicate</button>
                {questions.length > 1 && (
                  <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                    onClick={() => removeQuestion(qi)}>Remove</button>
                )}
              </div>
            </div>

            <input
              type="text"
              value={q.question}
              onChange={e => updateQuestion(qi, 'question', e.target.value)}
              placeholder={`Question ${qi + 1}`}
              maxLength={500}
            />

            <div style={{ marginBottom: 8 }}>
              <select
                value={q.questionType}
                onChange={e => updateQuestion(qi, 'questionType', e.target.value)}
                style={{ fontSize: 12 }}
              >
                <option value="single_choice">Single choice</option>
                <option value="ranking">Ranking (drag to order)</option>
              </select>
              {q.questionType === 'ranking' && (
                <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
                  Respondents will rank all options. Results use Borda count.
                </span>
              )}
            </div>

            {q.options.map((opt, oi) => (
              <div key={oi} className="flex gap-8" style={{ marginBottom: 4 }}>
                <input
                  type="text"
                  value={opt}
                  onChange={e => updateOption(qi, oi, e.target.value)}
                  placeholder={`Option ${oi + 1}`}
                  style={{ marginBottom: 0 }}
                />
                {q.options.length > 2 && (
                  <button type="button" className="btn btn-secondary" onClick={() => removeOption(qi, oi)}>
                    X
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-8" style={{ marginTop: 4 }}>
              {q.options.length < 20 && (
                <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }}
                  onClick={() => addOption(qi)}>+ Option</button>
              )}
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={e => updateQuestion(qi, 'required', e.target.checked)}
                  style={{ margin: 0 }}
                />
                Required
              </label>
            </div>
          </div>
        ))}

        <div className="mt-12">
          <label>Closes in</label>
          <select value={closesIn} onChange={e => setClosesIn(e.target.value)}>
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="24">24 hours</option>
            <option value="72">3 days</option>
            <option value="168">1 week</option>
            <option value="336">2 weeks</option>
          </select>
        </div>

        <div className="mt-12">
          <label>Who can respond?</label>
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

        {error && <p className="error">{error}</p>}

        <div className="mt-12">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Survey'}
          </button>
        </div>
      </form>
    </div>
  );
}
