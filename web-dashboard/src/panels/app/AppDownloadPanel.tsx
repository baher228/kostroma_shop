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

type DownloadTarget = {
  key: 'tablet' | 'worker';
  title: string;
  subtitle: string;
  manifestPath: string;
  missingText: string;
};

const downloadTargets: DownloadTarget[] = [
  {
    key: 'tablet',
    title: 'Analitika Tablet',
    subtitle: 'Store tablet app',
    manifestPath: '/downloads/analitika-latest.json',
    missingText: 'Tablet APK is not published yet.',
  },
  {
    key: 'worker',
    title: 'Analitika FOB',
    subtitle: 'Worker mobile phone QR app',
    manifestPath: '/downloads/analitika-worker-latest.json',
    missingText: 'Worker mobile APK is not published yet.',
  },
];

const loadManifest = async (manifestPath: string): Promise<ApkManifest | null> => {
  const response = await fetch(`${manifestPath}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }
  return response.json() as Promise<ApkManifest>;
};

export const AppDownloadPanel = () => {
  const [manifests, setManifests] = useState<Record<DownloadTarget['key'], ApkManifest | null>>({
    tablet: null,
    worker: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const loaded = await Promise.all(
        downloadTargets.map(async (target) => [target.key, await loadManifest(target.manifestPath)] as const),
      );
      setManifests(Object.fromEntries(loaded) as Record<DownloadTarget['key'], ApkManifest | null>);
    } catch (err) {
      setManifests({ tablet: null, worker: null });
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
      <PageHeader title="Приложение" subtitle="Android APK для планшетов магазина и телефонов работников." action={<RefreshButton onClick={() => load()} />} />
      {loading ? <p>Проверяем доступные сборки...</p> : <Feedback error={error} />}
      <div className="download-list">
        {downloadTargets.map((target) => {
          const manifest = manifests[target.key];
          return (
            <article className="download-card" key={target.key}>
              <div>
                <p className="eyebrow">{target.subtitle}</p>
                <h3>{manifest ? `${target.title} v${manifest.version}` : target.title}</h3>
                {manifest ? (
                  <>
                    <p>{manifest.fileName}</p>
                    <small>Обновлено: {formatDateTime(manifest.updatedAt)} · commit {manifest.buildSha}</small>
                  </>
                ) : (
                  <p>{target.missingText}</p>
                )}
              </div>
              {manifest && <a className="download-button" href={manifest.url} download={manifest.fileName}>Скачать APK</a>}
            </article>
          );
        })}
      </div>
    </section>
  );
};
