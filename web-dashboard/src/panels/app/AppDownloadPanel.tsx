import { useEffect, useState } from 'react';
import { Feedback, PageHeader, RefreshButton } from '../../components/ui';
import { formatDateTime, messageOf } from '../../shared/format';

type ApkManifest = {
  version: string;
  fileName: string;
  url: string;
  buildSha: string;
  updatedAt: string;
};

export const AppDownloadPanel = () => {
  const [manifest, setManifest] = useState<ApkManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/downloads/analitika-latest.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('APK еще не опубликован. Запустите сборку Android APK.');
      }
      const nextManifest = await response.json() as ApkManifest;
      setManifest(nextManifest);
    } catch (err) {
      setManifest(null);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="page-section">
      <PageHeader title="Приложение" subtitle="Актуальный Android APK для установки на телефоны." action={<RefreshButton onClick={() => load()} />} />
      {loading ? <p>Проверяем доступную сборку...</p> : <Feedback error={error} />}
      {manifest && (
        <article className="download-card">
          <div>
            <p className="eyebrow">Android APK</p>
            <h3>Analitika v{manifest.version}</h3>
            <p>{manifest.fileName}</p>
            <small>Обновлено: {formatDateTime(manifest.updatedAt)} · commit {manifest.buildSha}</small>
          </div>
          <a className="download-button" href={manifest.url} download={manifest.fileName}>Скачать APK</a>
        </article>
      )}
    </section>
  );
};
