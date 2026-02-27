import { useEffect, useRef, useState } from 'react';
import { loadDatasetFromFiles, loadDatasetFromUrl } from '../utils/datasetLoader';

export default function DatasetLoader({ onDatasetLoaded, label = 'Dataset' }) {
  const [url, setUrl] = useState('./datasets/default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const folderInputRef = useRef(null);

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  const loadFromUrl = async () => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError('Dataset URL is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const dataset = await loadDatasetFromUrl(normalizedUrl);
      onDatasetLoaded(dataset);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadFromDirectory = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const dataset = await loadDatasetFromFiles(files);
      onDatasetLoaded(dataset);
      event.target.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel dataset-loader">
      <h3>{label}</h3>
      <div className="loader-row">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Dataset base URL"
          aria-label={`${label} URL`}
        />
        <button onClick={loadFromUrl} disabled={loading}>
          {loading ? 'Loading...' : 'Load URL'}
        </button>
      </div>
      <div className="loader-row">
        <label className="file-input">
          <span>Load Folder</span>
          <input ref={folderInputRef} type="file" onChange={loadFromDirectory} multiple />
        </label>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
