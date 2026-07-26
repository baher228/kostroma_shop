import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, messageOf } from '../shared/format';

type DownloadKey = 'tablet' | 'worker';

export type ApkManifest = {
  version: string;
  fileName: string;
  url: string;
  buildSha: string;
  updatedAt: string;
};

type DownloadTarget = {
  key: DownloadKey;
  title: string;
  kind: string;
  description: string;
  manifestPath: string;
  missingText: string;
};

type DownloadBuild = {
  manifest: ApkManifest | null;
  error: string;
};

export type DownloadBuilds = Record<DownloadKey, DownloadBuild>;

export const downloadTargets: DownloadTarget[] = [
  {
    key: 'tablet',
    title: 'Analitika Tablet',
    kind: 'Для планшета магазина',
    description: 'Остатки, заказы и сканирование FOB QR-кодов.',
    manifestPath: '/downloads/analitika-latest.json',
    missingText: 'APK для планшета пока не опубликован.',
  },
  {
    key: 'worker',
    title: 'Analitika FOB',
    kind: 'Для телефона сотрудника',
    description: 'Личный обновляемый QR-код для отметки прихода и ухода.',
    manifestPath: '/downloads/analitika-worker-latest.json',
    missingText: 'Мобильный FOB APK пока не опубликован.',
  },
];

const emptyBuilds = (): DownloadBuilds => ({
  tablet: { manifest: null, error: '' },
  worker: { manifest: null, error: '' },
});

const isManifest = (value: unknown): value is ApkManifest => {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<ApkManifest>;
  return (
    typeof manifest.version === 'string'
    && typeof manifest.fileName === 'string'
    && manifest.fileName.endsWith('.apk')
    && typeof manifest.url === 'string'
    && manifest.url.startsWith('/downloads/')
    && typeof manifest.buildSha === 'string'
    && typeof manifest.updatedAt === 'string'
    && Number.isFinite(Date.parse(manifest.updatedAt))
  );
};

const loadBuild = async (target: DownloadTarget): Promise<DownloadBuild> => {
  try {
    const response = await fetch(`${target.manifestPath}?t=${Date.now()}`, { cache: 'no-store' });
    if (response.status === 404) {
      return { manifest: null, error: '' };
    }
    if (!response.ok) {
      throw new Error(`Сервер вернул ошибку ${response.status}.`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return { manifest: null, error: '' };
    }
    const manifest: unknown = await response.json();
    if (!isManifest(manifest)) {
      throw new Error('Манифест APK поврежден.');
    }
    return { manifest, error: '' };
  } catch (error) {
    return { manifest: null, error: messageOf(error) };
  }
};

export const useApkDownloads = () => {
  const [builds, setBuilds] = useState<DownloadBuilds>(emptyBuilds);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const loaded = await Promise.all(
      downloadTargets.map(async (target) => [target.key, await loadBuild(target)] as const),
    );
    setBuilds((current) => Object.fromEntries(
      loaded.map(([key, build]) => [
        key,
        build.error && current[key].manifest ? { manifest: current[key].manifest, error: build.error } : build,
      ]),
    ) as DownloadBuilds);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  return { builds, loading, load };
};

export const ApkDownloadList = ({
  builds,
  loading,
  compact = false,
}: {
  builds: DownloadBuilds;
  loading: boolean;
  compact?: boolean;
}) => (
  <div className={`download-list${compact ? ' download-list-compact' : ''}`} aria-busy={loading}>
    {downloadTargets.map((target) => {
      const build = builds[target.key];
      const headingId = `download-${target.key}-title`;
      return (
        <article className="download-card" key={target.key} aria-labelledby={headingId}>
          <div>
            <p className="download-kind">{target.kind}</p>
            <h3 id={headingId}>{target.title}</h3>
            <p>{target.description}</p>
            {build.manifest ? (
              <small>
                Версия {build.manifest.version} · обновлено {formatDateTime(build.manifest.updatedAt)}
                {' · '}commit {build.manifest.buildSha}
              </small>
            ) : (
              <p className="download-status" role="status">
                {loading && !build.error ? 'Проверяем доступность...' : build.error || target.missingText}
              </p>
            )}
            {build.error && build.manifest && (
              <p className="download-warning" role="status">Не удалось проверить обновление; показана последняя доступная сборка.</p>
            )}
          </div>
          {build.manifest && (
            <a
              className="download-button"
              href={build.manifest.url}
              download={build.manifest.fileName}
              aria-label={`Скачать ${target.title} APK, версия ${build.manifest.version}`}
            >
              Скачать APK
            </a>
          )}
        </article>
      );
    })}
  </div>
);
