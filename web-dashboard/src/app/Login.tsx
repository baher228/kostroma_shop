import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Session } from '../types';
import { formatDateTime } from '../shared/format';

type ApkManifest = {
  version: string;
  fileName: string;
  url: string;
  buildSha: string;
  updatedAt: string;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Не удалось выполнить запрос.');

export const Login = ({ onLogin }: { onLogin: (session: Session) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [manifest, setManifest] = useState<ApkManifest | null>(null);

  useEffect(() => {
    fetch('/downloads/analitika-latest.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((nextManifest: ApkManifest | null) => setManifest(nextManifest))
      .catch(() => setManifest(null));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      onLogin(await api.login(username, password));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-stack">
        <form className="login-card" onSubmit={submit} autoComplete="off">
          <h2>Вход</h2>
          <label>
            Логин
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoCapitalize="none"
              autoComplete="off"
              name="analitika-login"
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              name="analitika-passcode"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Входим...' : 'Войти'}</button>
        </form>

        <section className="login-download-card" aria-label="Скачать Android APK">
          <div>
            <p className="eyebrow">Android APK</p>
            <h2>Приложение Analitika</h2>
            {manifest ? (
              <>
                <p>{manifest.fileName}</p>
                <small>Версия {manifest.version} · обновлено {formatDateTime(manifest.updatedAt)}</small>
              </>
            ) : (
              <p>APK скоро будет доступен для скачивания.</p>
            )}
          </div>
          {manifest && <a className="download-button" href={manifest.url} download={manifest.fileName}>Скачать APK</a>}
        </section>
      </div>
    </main>
  );
};
