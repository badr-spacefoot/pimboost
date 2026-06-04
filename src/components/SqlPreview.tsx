'use client';

export function SqlPreview({ sql }: { sql: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-slate-100 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Règle SQL CASE WHEN</h3>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(sql)}
          className="rounded-lg bg-white px-3 py-1 text-sm font-medium text-slate-900 hover:bg-slate-200"
        >
          Copier
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-6">{sql}</pre>
    </div>
  );
}
