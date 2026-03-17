import { useMemo } from 'react';

const ASPECT_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'square', label: 'Square' },
];

const COLOR_OPTIONS = [
  { value: 'all', label: 'All colors' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
  { value: 'brown', label: 'Brown' },
  { value: 'gray', label: 'Gray' },
  { value: 'black', label: 'Black' },
  { value: 'white', label: 'White' },
];

const BLOB_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
];

export default function FilterBar({
  filters,
  onChange,
  syncedUsers,
  hasColors,
  hasVideos,
  dateRange,
}) {
  // Date range bounds from the data
  const { minDate, maxDate } = useMemo(() => {
    if (!dateRange) return { minDate: '', maxDate: '' };
    return { minDate: dateRange.min, maxDate: dateRange.max };
  }, [dateRange]);

  const update = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="photo-filters">
      {/* Blob type filter */}
      {hasVideos && (
        <div className="photo-filter-group">
          <label className="photo-filter-label">Type</label>
          <div className="photo-filter-pills">
            {BLOB_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`photo-filter-pill${filters.blobType === opt.value ? ' active' : ''}`}
                onClick={() => update('blobType', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aspect ratio */}
      <div className="photo-filter-group">
        <label className="photo-filter-label">Ratio</label>
        <div className="photo-filter-pills">
          {ASPECT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`photo-filter-pill${filters.aspect === opt.value ? ' active' : ''}`}
              onClick={() => update('aspect', opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alt text */}
      <div className="photo-filter-group">
        <label className="photo-filter-label">Alt text</label>
        <div className="photo-filter-pills">
          <button
            className={`photo-filter-pill${filters.altText === 'all' ? ' active' : ''}`}
            onClick={() => update('altText', 'all')}
          >All</button>
          <button
            className={`photo-filter-pill${filters.altText === 'has' ? ' active' : ''}`}
            onClick={() => update('altText', 'has')}
          >Has alt</button>
          <button
            className={`photo-filter-pill${filters.altText === 'missing' ? ' active' : ''}`}
            onClick={() => update('altText', 'missing')}
          >Missing</button>
        </div>
      </div>

      {/* Color filter */}
      {hasColors && (
        <div className="photo-filter-group">
          <label className="photo-filter-label">Color</label>
          <select
            className="photo-filter-select"
            value={filters.color}
            onChange={e => update('color', e.target.value)}
          >
            {COLOR_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Per-user filter (only when multiple users synced) */}
      {syncedUsers.length > 1 && (
        <div className="photo-filter-group">
          <label className="photo-filter-label">User</label>
          <select
            className="photo-filter-select"
            value={filters.did}
            onChange={e => update('did', e.target.value)}
          >
            <option value="all">All users</option>
            {syncedUsers.map(u => (
              <option key={u.did} value={u.did}>@{u.handle}</option>
            ))}
          </select>
        </div>
      )}

      {/* Date range */}
      {minDate && (
        <div className="photo-filter-group">
          <label className="photo-filter-label">From</label>
          <input
            type="date"
            className="photo-filter-date"
            value={filters.dateFrom || ''}
            min={minDate}
            max={filters.dateTo || maxDate}
            onChange={e => update('dateFrom', e.target.value)}
          />
          <label className="photo-filter-label">To</label>
          <input
            type="date"
            className="photo-filter-date"
            value={filters.dateTo || ''}
            min={filters.dateFrom || minDate}
            max={maxDate}
            onChange={e => update('dateTo', e.target.value)}
          />
          {(filters.dateFrom || filters.dateTo) && (
            <button
              className="photo-filter-clear"
              onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}
            >
              Clear dates
            </button>
          )}
        </div>
      )}
    </div>
  );
}
