import { useState, useMemo, useCallback } from 'react';
import type { WaveTemplate, TemplateCategory, TemplateVariable } from '../types';
import { getStarterTemplates, instantiateTemplate } from '../lib/templates';
import { renderMarkdown, isMarkdownReady } from '../lib/markdown';

interface Props {
  onInstantiate: (title: string, content: string) => void;
  onCancel: () => void;
}

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  project: 'Projects',
  journal: 'Journal',
  meeting: 'Meetings',
  crm: 'CRM / Contacts',
  knowledge: 'Knowledge Base',
  tracker: 'Issue Tracker',
  other: 'Other',
};

export function TemplatePicker({ onInstantiate, onCancel }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WaveTemplate | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);

  const templates = useMemo(() => {
    return getStarterTemplates(selectedCategory || undefined);
  }, [selectedCategory]);

  const categories = useMemo(() => {
    const all = getStarterTemplates();
    const cats = new Set(all.map(t => t.category));
    return Array.from(cats) as TemplateCategory[];
  }, []);

  const handleSelectTemplate = useCallback((tmpl: WaveTemplate) => {
    setSelectedTemplate(tmpl);
    // Pre-fill defaults
    const defaults: Record<string, string> = {};
    for (const v of tmpl.variables) {
      defaults[v.key] = v.defaultValue || '';
    }
    // Auto-fill date
    defaults.date = defaults.date || new Date().toISOString().slice(0, 10);
    setVarValues(defaults);
    setShowPreview(false);
  }, []);

  const handleVarChange = useCallback((key: string, value: string) => {
    setVarValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const previewHtml = useMemo(() => {
    if (!selectedTemplate || !showPreview) return '';
    const content = instantiateTemplate(selectedTemplate, varValues);
    if (isMarkdownReady()) {
      return renderMarkdown(content, {});
    }
    return `<pre>${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  }, [selectedTemplate, varValues, showPreview]);

  const handleCreate = useCallback(() => {
    if (!selectedTemplate) return;
    const content = instantiateTemplate(selectedTemplate, varValues);
    // Derive page title from first variable or template title
    const title = varValues[selectedTemplate.variables[0]?.key] || selectedTemplate.title;
    onInstantiate(title, content);
  }, [selectedTemplate, varValues, onInstantiate]);

  // --- Template detail view ---
  if (selectedTemplate) {
    return (
      <div className="wave-template-picker">
        <div className="wave-template-header">
          <button className="wave-btn-sm" onClick={() => setSelectedTemplate(null)}>&larr; Back</button>
          <h3>{selectedTemplate.title}</h3>
        </div>

        <div className="wave-template-detail">
          <p className="wave-template-desc">{selectedTemplate.description}</p>

          <div className="wave-template-tags">
            {selectedTemplate.tags.map(tag => (
              <span key={tag} className="wave-data-tag">{tag}</span>
            ))}
          </div>

          <div className="wave-template-vars">
            <div className="wave-section-label"><span>Fill in details</span></div>
            {selectedTemplate.variables.map((v: TemplateVariable) => (
              <div key={v.key} className="wave-template-var">
                <label>{v.label}</label>
                <input
                  type="text"
                  value={varValues[v.key] || ''}
                  onChange={e => handleVarChange(v.key, e.target.value)}
                  placeholder={v.defaultValue || v.key}
                />
              </div>
            ))}
          </div>

          <div className="wave-template-actions">
            <button className="wave-btn-primary" onClick={handleCreate}>
              Create Page
            </button>
            <button
              className="wave-btn-sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button className="wave-btn-sm" onClick={onCancel}>Cancel</button>
          </div>

          {showPreview && (
            <div className="wave-template-preview">
              <div className="wave-section-label"><span>Preview</span></div>
              <div
                className="wave-md-content"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Template list view ---
  return (
    <div className="wave-template-picker">
      <div className="wave-template-header">
        <h3>New from Template</h3>
        <button className="wave-btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <div className="wave-template-categories">
        <button
          className={`wave-template-cat ${!selectedCategory ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            className={`wave-template-cat ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="wave-template-grid">
        {templates.map((tmpl, i) => (
          <button
            key={i}
            className="wave-template-card"
            onClick={() => handleSelectTemplate(tmpl)}
          >
            <div className="wave-template-card-title">{tmpl.title}</div>
            <div className="wave-template-card-desc">{tmpl.description}</div>
            <div className="wave-template-card-meta">
              {tmpl.plugins.length > 0 && (
                <span className="wave-template-card-plugins">
                  {tmpl.plugins.join(', ')}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
