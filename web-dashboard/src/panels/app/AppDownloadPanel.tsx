import { ApkDownloadList, useApkDownloads } from '../../components/ApkDownloads';
import { PageHeader, RefreshButton } from '../../components/ui';

export const AppDownloadPanel = () => {
  const { builds, loading, load } = useApkDownloads();

  return (
    <section className="page-section">
      <PageHeader
        title="Приложения"
        subtitle="Отдельные Android APK для планшета магазина и телефона сотрудника."
        action={<RefreshButton onClick={() => void load()} />}
      />
      <ApkDownloadList builds={builds} loading={loading} />
    </section>
  );
};
