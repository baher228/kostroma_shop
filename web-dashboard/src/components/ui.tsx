import React from 'react';

export const PageHeader = ({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) => (
  <header className="page-header">
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
    {action}
  </header>
);

export const Metric = ({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) => (
  <article className="metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{hint}</small>
  </article>
);

export const Feedback = ({ error, notice }: { error?: string; notice?: string }) => (
  <>
    {error && <p className="error">{error}</p>}
    {notice && <p className="notice">{notice}</p>}
  </>
);

export const RefreshButton = ({ onClick }: { onClick: () => void }) => (
  <button className="secondary" onClick={() => void onClick()}>Обновить</button>
);

export const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="table-scroll">
    <table>{children}</table>
  </div>
);

export const Modal = ({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className="modal-card">
      <header>
        <h3>{title}</h3>
        <button className="ghost" onClick={onClose}>Закрыть</button>
      </header>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

export const NumberInput = ({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) => (
  <input aria-label={label} placeholder={label} value={String(value)} onChange={(event) => onChange(event.target.value)} />
);
