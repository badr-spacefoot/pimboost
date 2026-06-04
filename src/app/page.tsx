'use client';

import { useMemo, useState } from 'react';
import { Database, FileJson, Sparkles } from 'lucide-react';
import { MappingTable } from '@/components/MappingTable';
import { SqlPreview } from '@/components/SqlPreview';
import { StatCard } from '@/components/StatCard';
import { getDistinctValues } from '@/lib/mapping/distinct';
import { flattenFieldPaths } from '@/lib/mapping/paths';
import { parseSourceFile } from '@/lib/mapping/parser';
import { generateCaseWhenSql } from '@/lib/mapping/sql';
import { SEED_SUGGESTIONS, suggestMapping } from '@/lib/mapping/suggestions';
import { testRules } from '@/lib/mapping/tester';
import type { MappingRow, MappingRuleInput, SourceRecord, SuggestionMemoryEntry } from '@/lib/types/mapping';

export default function Home() {
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [fieldPath, setFieldPath] = useState('');
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [query, setQuery] = useState('');
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState('');
  const [projectName, setProjectName] = useState('Mapping draft');
  const [saveMessage, setSaveMessage] = useState('');
  const [suggestionMemory, setSuggestionMemory] = useState<SuggestionMemoryEntry[]>(SEED_SUGGESTIONS);

  const fields = useMemo(() => flattenFieldPaths(records), [records]);
  const sourceExpression = fields.find((field) => field.label === fieldPath)?.sqlExpression ?? fieldPath;
  const rules: MappingRuleInput[] = useMemo(
    () =>
      rows
        .filter((row) => row.targetValue.trim())
        .map((row) => ({
          sourceValue: row.value,
          targetValue: row.targetValue,
          matcherType: 'contains',
          confidenceScore: row.suggestion.confidenceScore,
          status: row.status === 'validated' ? 'validated' : 'draft',
        })),
    [rows],
  );
  const generatedRule = useMemo(() => generateCaseWhenSql(sourceExpression || 'raw_data', rules), [sourceExpression, rules]);
  const testResult = useMemo(() => testRules(records, fieldPath, rules), [records, fieldPath, rules]);

  async function handleUpload(file: File) {
    const parsed = await parseSourceFile(file);
    await loadRecords(parsed, file.name);
  }

  async function loadDemoData() {
    const response = await fetch('/samples/pimup-products.json');
    const parsed = (await response.json()) as SourceRecord[];
    await loadRecords(parsed, 'pimup-products.json');
  }

  async function loadRecords(parsed: SourceRecord[], nextSourceName: string) {
    setRecords(parsed);
    setSourceName(nextSourceName);
    setSaveMessage('');
    const detectedFields = flattenFieldPaths(parsed);
    const preferredField = detectedFields.find((field) => field.label === 'raw_data.name')?.label;
    const defaultField = preferredField ?? detectedFields[0]?.label ?? '';
    setFieldPath(defaultField);
    const memory = await loadSuggestionMemory(defaultField);
    rebuildRows(parsed, defaultField, memory);
  }

  async function loadSuggestionMemory(attributeName: string) {
    try {
      const response = await fetch(`/api/suggestions?attributeName=${encodeURIComponent(attributeName)}`);
      const memory = (await response.json()) as SuggestionMemoryEntry[];
      setSuggestionMemory(memory);
      return memory;
    } catch {
      return suggestionMemory.length ? suggestionMemory : SEED_SUGGESTIONS;
    }
  }

  function rebuildRows(nextRecords: SourceRecord[], nextFieldPath: string, memory = suggestionMemory) {
    const distinct = getDistinctValues(nextRecords, nextFieldPath);
    setRows(
      distinct.map((item) => {
        const suggestion = suggestMapping(item.value, nextFieldPath, memory);
        return {
          ...item,
          suggestion,
          targetValue: suggestion.targetValue,
          status: suggestion.targetValue ? 'suggested' : 'unmapped',
        };
      }),
    );
    setSelectedValues(new Set());
  }

  function updateTarget(sourceValue: string, targetValue: string, status: MappingRow['status'] = 'validated') {
    setRows((current) => current.map((row) => (row.value === sourceValue ? { ...row, targetValue, status } : row)));
  }

  function applyBulk() {
    if (!bulkTarget.trim()) return;
    setRows((current) => current.map((row) => (selectedValues.has(row.value) ? { ...row, targetValue: bulkTarget, status: 'validated' } : row)));
    setBulkTarget('');
    setSelectedValues(new Set());
  }

  async function saveDraft() {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: projectName,
        sourceName,
        attributeName: fieldPath,
        rules,
      }),
    });
    setSaveMessage(response.ok ? 'Mapping sauvegardé en draft PostgreSQL.' : 'Erreur de sauvegarde. Vérifiez DATABASE_URL.');
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-pimup-900 to-pimup-500 p-8 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-100">PIMuP interne</p>
        <h1 className="mt-3 text-4xl font-bold">PIMuP Mapping Assistant</h1>
        <p className="mt-3 max-w-3xl text-blue-50">
          Import CSV/JSON, suggestions de mapping, génération SQL PostgreSQL/JSONB et validation humaine en mode draft.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <FileJson className="text-pimup-700" />
              <h2 className="text-xl font-semibold">1. Upload source</h2>
            </div>
            <input
              type="file"
              accept=".csv,.json,application/json,text/csv"
              onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])}
              className="mt-5 w-full rounded-xl border border-dashed border-slate-300 p-4 text-sm"
            />
            <button
              type="button"
              onClick={loadDemoData}
              className="mt-3 w-full rounded-xl border border-pimup-700 px-4 py-2 text-sm font-semibold text-pimup-700 hover:bg-pimup-50"
            >
              Charger les données de démo locales
            </button>
            <p className="mt-3 text-sm text-slate-500">{records.length} produits importés {sourceName && `depuis ${sourceName}`}.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">2. Champ source</h2>
            <select
              value={fieldPath}
              onChange={async (event) => {
                setFieldPath(event.target.value);
                const memory = await loadSuggestionMemory(event.target.value);
                rebuildRows(records, event.target.value, memory);
              }}
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2"
            >
              {fields.map((field) => (
                <option key={field.label} value={field.label}>
                  {field.label} — {field.sqlExpression}
                </option>
              ))}
            </select>
            <p className="mt-3 text-xs text-slate-500">Expression SQL détectée : {sourceExpression || '—'}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Sauvegarde draft</h2>
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2" />
            <button onClick={saveDraft} disabled={!records.length || !rules.length} className="mt-3 w-full rounded-xl bg-pimup-700 px-4 py-2 font-semibold text-white disabled:bg-slate-300">
              Sauvegarder dans PostgreSQL
            </button>
            {saveMessage && <p className="mt-3 text-sm text-slate-600">{saveMessage}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Preview des 50 premières lignes</h2>
          <pre className="max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
            {records.length ? JSON.stringify(records.slice(0, 50), null, 2) : 'Importez un fichier CSV ou JSON pour commencer.'}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">3. Mapping des valeurs distinctes</h2>
            <p className="text-slate-500">Suggestions issues de la mémoire validée, similarité texte et mots-clés.</p>
          </div>
          <div className="flex gap-2">
            <input value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value)} placeholder="Valeur cible bulk" className="rounded-xl border border-slate-300 px-4 py-2" />
            <button onClick={applyBulk} className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white">Mapper sélection</button>
          </div>
        </div>
        <MappingTable
          rows={rows}
          query={query}
          selectedValues={selectedValues}
          onQueryChange={setQuery}
          onToggle={(value) => setSelectedValues((current) => {
            const next = new Set(current);
            next.has(value) ? next.delete(value) : next.add(value);
            return next;
          })}
          onTargetChange={updateTarget}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Sparkles className="text-pimup-700" />
            <h2 className="text-2xl font-bold">4. Rule Builder</h2>
          </div>
          <SqlPreview sql={generatedRule.sql} />
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Database className="text-pimup-700" />
            <h2 className="text-2xl font-bold">5. Rule Tester</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total produits" value={testResult.total} />
            <StatCard label="Produits matchés" value={testResult.matched} tone="success" />
            <StatCard label="Non matchés" value={testResult.unmatched} tone="warning" />
            <StatCard label="Couverture" value={`${Math.round(testResult.coverage * 100)}%`} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold">Conflits potentiels : {testResult.conflicts.length}</h3>
            <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-100 p-3 text-xs">{JSON.stringify(testResult.conflicts.slice(0, 5), null, 2)}</pre>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold">Exemples non matchés</h3>
            <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-100 p-3 text-xs">{JSON.stringify(testResult.unmatchedExamples, null, 2)}</pre>
          </div>
        </div>
      </section>
    </main>
  );
}
