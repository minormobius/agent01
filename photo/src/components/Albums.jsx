import { useState } from 'react';
import { saveAlbum, deleteRecord, ALBUM_COLLECTION } from '../lib/pds.js';

export default function Albums({ session, albums, onAlbumsChanged, uploadedImages, selectedAlbum, onSelectAlbum }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!session) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await saveAlbum({
        name: newName.trim(),
        description: newDesc.trim(),
        images: [],
      });
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      if (onAlbumsChanged) onAlbumsChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (album) => {
    if (!confirm(`Delete album "${album.value.name}"?`)) return;
    try {
      await deleteRecord(ALBUM_COLLECTION, album.rkey);
      if (onAlbumsChanged) onAlbumsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddToAlbum = async (album, imageItems) => {
    // imageItems: array of { image: blobRef, alt, sourceUri? }
    const existing = album.value.images || [];
    const updated = {
      ...album.value,
      images: [...existing, ...imageItems],
    };

    try {
      await saveAlbum(updated, album.rkey);
      if (onAlbumsChanged) onAlbumsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveFromAlbum = async (album, index) => {
    const images = [...(album.value.images || [])];
    images.splice(index, 1);
    const updated = { ...album.value, images };

    try {
      await saveAlbum(updated, album.rkey);
      if (onAlbumsChanged) onAlbumsChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="arena-albums">
      <div className="arena-albums-header">
        <h2>Albums</h2>
        <button
          className="arena-btn-small"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? 'Cancel' : '+ New album'}
        </button>
      </div>

      {error && <div className="arena-error">{error}</div>}

      {showCreate && (
        <form className="arena-album-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Album name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            disabled={saving}
            autoFocus
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            disabled={saving}
          />
          <button type="submit" className="arena-btn-primary" disabled={saving || !newName.trim()}>
            {saving ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      <div className="arena-album-list">
        {albums.length === 0 && !showCreate && (
          <p className="arena-albums-empty">No albums yet. Create one to start curating.</p>
        )}

        {/* "All uploads" pseudo-album */}
        <button
          className={`arena-album-chip${selectedAlbum === null ? ' active' : ''}`}
          onClick={() => onSelectAlbum(null)}
        >
          All uploads
          <span className="arena-album-count">{uploadedImages.length}</span>
        </button>

        {albums.map(album => (
          <div key={album.rkey} className="arena-album-item">
            <button
              className={`arena-album-chip${selectedAlbum === album.rkey ? ' active' : ''}`}
              onClick={() => onSelectAlbum(album.rkey)}
            >
              {album.value.name}
              <span className="arena-album-count">{(album.value.images || []).length}</span>
            </button>
            <button
              className="arena-album-delete"
              onClick={() => handleDelete(album)}
              title="Delete album"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export { Albums };
