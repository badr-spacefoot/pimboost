'use client';

import { useEffect, useState } from 'react';

export default function TargetValuesPage() {
  const [attributeName, setAttributeName] = useState('family');
  const [values, setValues] = useState<string[]>([]);
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    async function loadValues() {
      try {
        const response = await fetch(`/api/target-values?attributeName=${encodeURIComponent(attributeName)}`);
        setValues((await response.json()) as string[]);
      } catch {
        setValues([]);
      }
    }

    loadValues();
  }, [attributeName]);

  async function addValue() {
    if (!newValue.trim()) return;
    const targetValue = newValue.trim();
    setValues((current) => Array.from(new Set([...current, targetValue])).sort((a, b) => a.localeCompare(b)));
    setNewValue('');
    await fetch('/api/target-values', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributeName, targetValue }),
    });
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pimup-700">PIMuP Mapping Assistant</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Target Values</h1>
        <p className="mt-2 text-slate-500">Gérez les valeurs cibles autorisées par attribut. Cette liste alimente le selector du tableau de mapping.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-semibold text-slate-700" htmlFor="attribute-name">attribute_name</label>
        <input
          id="attribute-name"
          value={attributeName}
          onChange={(event) => setAttributeName(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2"
          placeholder="family"
        />
        <div className="mt-4 flex gap-2">
          <input
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2"
            placeholder="Nouvelle valeur cible"
          />
          <button type="button" onClick={addValue} className="rounded-xl bg-pimup-700 px-4 py-2 font-semibold text-white">Ajouter</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Valeurs disponibles pour {attributeName || '—'}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {values.map((value) => (
            <span key={value} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{value}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
