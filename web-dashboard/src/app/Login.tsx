import React, { useState } from 'react';
import { api } from '../api';
import { ApkDownloadList, useApkDownloads } from '../components/ApkDownloads';
import { Session } from '../types';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Не удалось выполнить запрос.');

export const Login = ({ onLogin }: { onLogin: (session: Session) => void }) => {
  const { builds, loading: downloadsLoading } = useApkDownloads();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        <form className="login-card" onSubmit={submit} autoComplete="off" aria-busy={loading}>
          <h2>Вход</h2>
          <label>
            Логин
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              name="username"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              name="password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </label>
          {error && <p className="error" role="alert" id="login-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Входим...' : 'Войти'}</button>
        </form>

        <section className="login-downloads" aria-labelledby="login-downloads-title">
          <h2 id="login-downloads-title">Скачать приложения</h2>
          <p>Выберите приложение для устройства и роли.</p>
          <ApkDownloadList builds={builds} loading={downloadsLoading} compact />
        </section>
      </div>
    </main>
  );
};
