import { useState, useRef } from 'react';
import { uploadBlob, createImageRecord } from '../lib/pds.js';

export default function UploadButton({ session, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const fileRef = useRef(null);

  if (!session) return null;

  const handleFiles = async (files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploading(true);
    setProgress({ done: 0, total: imageFiles.length });

    const uploaded = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      try {
        // Get aspect ratio from image
        const aspectRatio = await getAspectRatio(file);

        // Upload blob to PDS
        const blob = await uploadBlob(file);

        // Create anchor record
        const result = await createImageRecord(blob, { aspectRatio });

        uploaded.push({
          uri: result.uri,
          rkey: result.uri.split('/').pop(),
          cid: result.cid,
          blob,
          aspectRatio,
          file,
        });
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
      }

      setProgress({ done: i + 1, total: imageFiles.length });
    }

    setUploading(false);
    setProgress(null);
    fileRef.current.value = '';

    if (uploaded.length > 0 && onUploaded) {
      onUploaded(uploaded);
    }
  };

  const handleClick = () => fileRef.current?.click();

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('arena-drop-active');
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('arena-drop-active');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('arena-drop-active');
  };

  return (
    <div
      className="arena-upload"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      <button
        className="arena-upload-btn"
        onClick={handleClick}
        disabled={uploading}
      >
        {uploading
          ? `Uploading ${progress?.done}/${progress?.total}...`
          : 'Upload images'}
      </button>

      {uploading && progress && (
        <div className="arena-upload-progress">
          <div
            className="arena-upload-fill"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function getAspectRatio(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}
