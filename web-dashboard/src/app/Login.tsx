import React, { useState } from 'react';
import { api } from '../api';
import { Session } from '../types';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Не удалось выполнить запрос.');

export const Login = ({ onLogin }: { onLogin: (session: Session) => void }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
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
      <form className="login-card" onSubmit={submit}>
        <h2>Вход</h2>
        <label>
          Логин
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Входим...' : 'Войти'}</button>
      </form>
    </main>
  );
};
