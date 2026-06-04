'use client';

import { useEffect, useMemo, useState } from 'react';
import { knowledgeBaseToTrainingExample, summarizeTrainingExamples } from '@/lib/mapping/ai-training';
import { parseKnowledgeBaseFile } from '@/lib/mapping/knowledge-base';
import type { AiSuggestion, TrainingExampleInput, TrainingStats } from '@/lib/types/mapping';

export default function AiTrainingPage() {
  const [examples, setExamples] = useState<TrainingExampleInput[]>([]);
  const [message, setMessage] = useState('');
  const [sourceName, setSourceName] = useState('Puma B2B');
  const [attributeName, setAttributeName] = useState('family');
  const [sourcePath, setSourcePath] = useState('raw_data.attributes.articletype[0].value');
  const [context, setContext] = useState({ brand: 'Puma', sport: 'Football', category: 'Accessories' });
  const [valuesInput, setValuesInput] = useState('BB Caps\nTrucker Caps\nBackpacks\nFootball Socks\nRunning shoes\nHoodies');
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [importPreview, setImportPreview] = useState({ total: 0, valid: 0, invalid: 0 });
  const stats: TrainingStats = useMemo(() => summarizeTrainingExamples(examples), [examples]);

  useEffect(() => {
    async function loadExamples() {
      try {
        const response = await fetch('/api/ai/training-examples');
        const payload = (await response.json()) as { examples: TrainingExampleInput[] };
        setExamples(payload.examples ?? []);
      } catch {
        setExamples([]);
      }
    }
    loadExamples();
  }, []);

  async function importTrainingFile(file: File) {
    try {
      const rows = await parseKnowledgeBaseFile(file);
      const imported = rows.map(knowledgeBaseToTrainingExample);
      setImportPreview({ total: rows.length, valid: imported.filter((row) => row.sourceValue && row.targetValue && row.attributeName).length, invalid: imported.filter((row) => !row.sourceValue || !row.targetValue || !row.attributeName).length });
      setExamples((current) => [...imported, ...current]);
      setMessage(`${imported.length} exemple(s) importés en preview. Lancez la sauvegarde pour les stocker.`);
    } catch {
      setMessage('Impossible de lire ce fichier CSV/JSON de training examples.');
    }
  }

  async function saveTrainingExamples(generateEmbeddings = false) {
    const response = await fetch('/api/ai/training-examples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: examples, generateEmbeddings }),
    });
    setMessage(response.ok ? 'Training examples sauvegardés.' : 'Erreur de sauvegarde des training examples.');
  }

  async function generateEmbeddings() {
    const response = await fetch('/api/ai/generate-embeddings', { method: 'POST' });
    const payload = await response.json();
    setMessage(response.ok ? `${payload.generated} embedding(s) générés avec le moteur local.` : payload.error);
  }

  async function suggestBatch() {
    const response = await fetch('/api/ai/suggest-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceName, attributeName, sourcePath, context, values: valuesInput.split('\n').map((value) => value.trim()).filter(Boolean) }),
    });
    const payload = (await response.json()) as { suggestions: AiSuggestion[] };
    setSuggestions(payload.suggestions ?? []);
  }

  async function sendFeedback(suggestion: AiSuggestion, action: 'accept' | 'reject' | 'modify', correctedTargetValue?: string) {
    await fetch('/api/ai/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, sourceName, attributeName, sourcePath, sourceValue: suggestion.sourceValue, targetValue: suggestion.suggestedTarget, correctedTargetValue }),
    });
    setMessage(`Feedback ${action} enregistré pour ${suggestion.sourceValue}.`);
  }

  function exportDataset() {
    window.location.href = '/api/ai/export-dataset';
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-pimup-700">PIMuP Mapping Assistant</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">AI Training</h1>
        <p className="mt-2 text-slate-500">Moteur IA local entraînable : training examples, embeddings pgvector, scoring hybride et feedback humain obligatoire.</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Importer des mappings validés</h2>
          <input type="file" accept=".csv,.json,application/json,text/csv" onChange={(event) => event.target.files?.[0] && importTrainingFile(event.target.files[0])} className="mt-4 w-full rounded-xl border border-dashed border-slate-300 p-4 text-sm" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => saveTrainingExamples(false)} className="rounded-xl bg-pimup-700 px-4 py-2 text-sm font-semibold text-white">Sauvegarder</button>
            <button type="button" onClick={() => saveTrainingExamples(true)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sauver + embeddings</button>
            <button type="button" onClick={generateEmbeddings} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Générer embeddings</button>
          </div>
          {importPreview.total > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><strong>{importPreview.total}</strong><br />importées</div>
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><strong>{importPreview.valid}</strong><br />valides</div>
              <div className="rounded-xl bg-amber-50 p-3 text-amber-700"><strong>{importPreview.invalid}</strong><br />invalides</div>
            </div>
          )}
          {message && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</p>}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Total exemples" value={stats.total} />
          <Metric label="Sources" value={Object.keys(stats.bySource).length} />
          <Metric label="Attributs" value={Object.keys(stats.byAttribute).length} />
          <Metric label="Sports" value={Object.keys(stats.bySport).length} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <StatsPanel title="Par source" values={stats.bySource} />
        <StatsPanel title="Par attribut" values={stats.byAttribute} />
        <StatsPanel title="Par sport" values={stats.bySport} />
        <StatsPanel title="Par famille" values={stats.byFamily} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ExampleList title="Mappings les plus fiables" examples={stats.reliable} />
        <ExampleList title="Mappings souvent rejetés" examples={stats.rejected} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Batch AI suggestions</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} className="rounded-xl border border-slate-300 px-4 py-2" placeholder="source_name" />
          <input value={attributeName} onChange={(event) => setAttributeName(event.target.value)} className="rounded-xl border border-slate-300 px-4 py-2" placeholder="attribute_name" />
          <input value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} className="rounded-xl border border-slate-300 px-4 py-2" placeholder="source_path" />
          <input value={context.brand} onChange={(event) => setContext((current) => ({ ...current, brand: event.target.value }))} className="rounded-xl border border-slate-300 px-4 py-2" placeholder="brand" />
          <input value={context.sport} onChange={(event) => setContext((current) => ({ ...current, sport: event.target.value }))} className="rounded-xl border border-slate-300 px-4 py-2" placeholder="sport" />
          <input value={context.category} onChange={(event) => setContext((current) => ({ ...current, category: event.target.value }))} className="rounded-xl border border-slate-300 px-4 py-2" placeholder="category" />
        </div>
        <textarea value={valuesInput} onChange={(event) => setValuesInput(event.target.value)} rows={6} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={suggestBatch} className="rounded-xl bg-pimup-700 px-4 py-2 text-sm font-semibold text-white">Proposer les mappings</button>
          <button type="button" onClick={exportDataset} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Export training dataset JSONL</button>
        </div>
        <div className="mt-5 space-y-3">
          {suggestions.map((suggestion) => (
            <div key={suggestion.sourceValue} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{suggestion.sourceValue} → {suggestion.suggestedTarget || '—'}</p>
                  <p className="mt-1 text-sm text-slate-500">Score {Math.round(suggestion.confidence * 100)}% · {suggestion.reason}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => sendFeedback(suggestion, 'accept')} className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white">Accepter</button>
                  <button type="button" onClick={() => sendFeedback(suggestion, 'reject')} className="rounded-lg bg-rose-600 px-3 py-1 text-sm font-semibold text-white">Rejeter</button>
                  <button type="button" onClick={() => sendFeedback(suggestion, 'modify', window.prompt('Nouvelle target_value', suggestion.suggestedTarget) || suggestion.suggestedTarget)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold">Modifier</button>
                  <button type="button" onClick={() => suggestions.filter((item) => item.suggestedTarget === suggestion.suggestedTarget).forEach((item) => sendFeedback(item, 'accept'))} className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold">Appliquer similaires</button>
                </div>
              </div>
              <pre className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(suggestion.nearestExamples, null, 2)}</pre>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p></div>;
}

function StatsPanel({ title, values }: { title: string; values: Record<string, number> }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold">{title}</h3><pre className="mt-3 max-h-44 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{JSON.stringify(values, null, 2)}</pre></div>;
}

function ExampleList({ title, examples }: { title: string; examples: TrainingExampleInput[] }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold">{title}</h3><pre className="mt-3 max-h-52 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{JSON.stringify(examples, null, 2)}</pre></div>;
}
