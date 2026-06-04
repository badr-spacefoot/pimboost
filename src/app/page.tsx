'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database, FileJson, Sparkles } from 'lucide-react';
import { MappingTable } from '@/components/MappingTable';
import { SqlPreview } from '@/components/SqlPreview';
import { StatCard } from '@/components/StatCard';
import { getDistinctValues } from '@/lib/mapping/distinct';
import { flattenFieldPaths } from '@/lib/mapping/paths';
import { parseSourceFile } from '@/lib/mapping/parser';
import { buildKnowledgeBasePreview, exportKnowledgeBaseCsv, exportKnowledgeBaseJson, exportKnowledgeBaseSql, parseKnowledgeBaseFile } from '@/lib/mapping/knowledge-base';
import { containsSqlCaseSyntax, parseSqlCaseMappings } from '@/lib/mapping/sql-case-parser';
import { generateCaseWhenSql } from '@/lib/mapping/sql';
import { detectSourceTypologies, parseManualMappings } from '@/lib/mapping/source-profile';
import { SEED_SUGGESTIONS, suggestMapping } from '@/lib/mapping/suggestions';
import { testRules } from '@/lib/mapping/tester';
import type { KnowledgeBaseImportPreview, KnowledgeBaseMappingInput, MappingRow, MappingRuleInput, SourceRecord, SqlCaseParsePreview, SuggestionMemoryEntry } from '@/lib/types/mapping';

const DEFAULT_SOURCE_NAMES = ['Nike B2B', 'Puma B2B', 'Ekkia', 'Bihr', 'DK Company', 'Tamaris', 'New Era'];
const DEFAULT_ATTRIBUTE_NAMES = ['family', 'size', 'color', 'season', 'gender', 'sport'];

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
  const [sourceMappingCount, setSourceMappingCount] = useState(0);
  const [knownSourceNames, setKnownSourceNames] = useState<string[]>(DEFAULT_SOURCE_NAMES);
  const [manualMappingsInput, setManualMappingsInput] = useState('SNAPBACK => Casquette snapback\nRUNNING => Running');
  const [manualAttributeName, setManualAttributeName] = useState('family');
  const [manualMappingMessage, setManualMappingMessage] = useState('');
  const [targetValues, setTargetValues] = useState<string[]>(Array.from(new Set(SEED_SUGGESTIONS.map((suggestion) => suggestion.targetValue))).sort());
  const [targetAttributeName, setTargetAttributeName] = useState('family');
  const [newTargetValue, setNewTargetValue] = useState('');
  const [knowledgeBaseRows, setKnowledgeBaseRows] = useState<KnowledgeBaseMappingInput[]>([]);
  const [knowledgeBasePreview, setKnowledgeBasePreview] = useState<KnowledgeBaseImportPreview | null>(null);
  const [knowledgeBaseMessage, setKnowledgeBaseMessage] = useState('');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'sql'>('csv');
  const [sqlCaseInput, setSqlCaseInput] = useState("WHEN raw_data->'attributes'->'articletype'->0->>'value' = 'BB Caps'\nTHEN 'Casquette de baseball'");
  const [sqlCasePreview, setSqlCasePreview] = useState<SqlCaseParsePreview | null>(null);
  const [sqlCaseMessage, setSqlCaseMessage] = useState('');

  const fields = useMemo(() => flattenFieldPaths(records), [records]);
  const detectedTypologies = useMemo(() => detectSourceTypologies(records), [records]);
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
  const knownAttributeNames = useMemo(() => Array.from(new Set([...DEFAULT_ATTRIBUTE_NAMES, ...fields.map((field) => field.label), fieldPath, manualAttributeName].filter(Boolean))).sort((a, b) => a.localeCompare(b)), [fields, fieldPath, manualAttributeName]);
  const canAddManualMappings = Boolean(sourceName.trim() && manualAttributeName.trim());

  useEffect(() => {
    async function loadKnownSources() {
      try {
        const [projectsResponse, knowledgeBaseResponse] = await Promise.all([fetch('/api/projects'), fetch('/api/knowledge-base')]);
        const projects = (await projectsResponse.json()) as Array<{ sourceName?: string }>;
        const knowledgeBaseRows = (await knowledgeBaseResponse.json()) as Array<{ sourceName?: string }>;
        setKnownSourceNames(
          Array.from(new Set([...DEFAULT_SOURCE_NAMES, ...(projects.map((project) => project.sourceName).filter(Boolean) as string[]), ...(knowledgeBaseRows.map((row) => row.sourceName).filter(Boolean) as string[])])).sort((a, b) => a.localeCompare(b)),
        );
      } catch {
        setKnownSourceNames(DEFAULT_SOURCE_NAMES);
      }
    }

    loadKnownSources();
  }, []);

  useEffect(() => {
    async function loadTargetValues() {
      try {
        const selectedAttribute = targetAttributeName || fieldPath;
        const params = selectedAttribute ? `?attributeName=${encodeURIComponent(selectedAttribute)}` : '';
        const response = await fetch(`/api/target-values${params}`);
        const values = (await response.json()) as string[];
        setTargetValues((current) => Array.from(new Set([...current, ...values])).sort((a, b) => a.localeCompare(b)));
      } catch {
        setTargetValues((current) => current);
      }
    }

    loadTargetValues();
  }, [fieldPath, targetAttributeName]);

  async function handleUpload(file: File) {
    const parsed = await parseSourceFile(file);
    await loadRecords(parsed, sourceName.trim() || file.name);
  }

  async function loadDemoData() {
    const response = await fetch('/samples/pimup-products.json');
    const parsed = (await response.json()) as SourceRecord[];
    await loadRecords(parsed, sourceName.trim() || 'pimup-products.json');
  }

  async function loadRecords(parsed: SourceRecord[], nextSourceName: string) {
    setRecords(parsed);
    setSourceName(nextSourceName);
    setSaveMessage('');
    const detectedFields = flattenFieldPaths(parsed);
    const preferredField = detectedFields.find((field) => field.label === 'raw_data.name')?.label;
    const defaultField = preferredField ?? detectedFields[0]?.label ?? '';
    setFieldPath(defaultField);
    const memory = await loadSuggestionMemory(defaultField, nextSourceName);
    rebuildRows(parsed, defaultField, memory, nextSourceName);
  }

  async function loadSuggestionMemory(attributeName: string, nextSourceName = sourceName) {
    try {
      const params = new URLSearchParams({ attributeName });
      if (nextSourceName) params.set('sourceName', nextSourceName);
      const response = await fetch(`/api/suggestions?${params.toString()}`);
      const memory = (await response.json()) as SuggestionMemoryEntry[];
      setSuggestionMemory(memory);
      setSourceMappingCount(memory.filter((entry) => entry.sourceName === nextSourceName).length);
      return memory;
    } catch {
      setSourceMappingCount(0);
      return suggestionMemory.length ? suggestionMemory : SEED_SUGGESTIONS;
    }
  }

  function rebuildRows(nextRecords: SourceRecord[], nextFieldPath: string, memory = suggestionMemory, nextSourceName = sourceName) {
    const distinct = getDistinctValues(nextRecords, nextFieldPath);
    setRows(
      distinct.map((item) => {
        const suggestion = suggestMapping(item.value, nextFieldPath, memory, nextSourceName);
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
    if (targetValue.trim()) setTargetValues((current) => Array.from(new Set([...current, targetValue.trim()])).sort((a, b) => a.localeCompare(b)));
  }

  function rejectSuggestion(sourceValue: string) {
    setRows((current) => current.map((row) => (row.value === sourceValue ? { ...row, targetValue: '', status: 'unmapped' } : row)));
  }

  function applyBulk() {
    if (!bulkTarget.trim()) return;
    setRows((current) => current.map((row) => (selectedValues.has(row.value) ? { ...row, targetValue: bulkTarget, status: 'validated' } : row)));
    setBulkTarget('');
    setSelectedValues(new Set());
  }

  async function renameSource(nextSourceName: string) {
    setSourceName(nextSourceName);
    if (nextSourceName.trim()) setKnownSourceNames((current) => Array.from(new Set([...current, nextSourceName.trim()])).sort((a, b) => a.localeCompare(b)));
    setManualMappingMessage('');
    setSaveMessage('');
    const memory = await loadSuggestionMemory(fieldPath, nextSourceName);
    rebuildRows(records, fieldPath, memory, nextSourceName);
  }

  async function renameManualAttribute(nextAttributeName: string) {
    setManualAttributeName(nextAttributeName);
    setManualMappingMessage('');
    const attributeForSuggestions = fieldPath || nextAttributeName;
    if (attributeForSuggestions && sourceName.trim()) {
      const memory = await loadSuggestionMemory(attributeForSuggestions, sourceName.trim());
      rebuildRows(records, attributeForSuggestions, memory, sourceName.trim());
    }
  }

  function applyManualMappings() {
    if (containsSqlCaseSyntax(manualMappingsInput)) {
      setManualMappingMessage('Le contenu semble être une règle SQL complète. Merci d’utiliser l’import SQL Parser ou de fournir un mapping one-to-one simple.');
      return;
    }

    if (!sourceName.trim() || !manualAttributeName.trim()) {
      setManualMappingMessage('Renseignez Source Name et Attribute Name pour associer ces mappings à une source et un attribut.');
      return;
    }

    const manualMappings = parseManualMappings(manualMappingsInput, manualAttributeName.trim(), sourceName.trim());
    if (!manualMappings.length) {
      setManualMappingMessage('Aucun mapping valide détecté. Format attendu : valeur source => valeur cible.');
      return;
    }

    const mergedMemory = dedupeSuggestionMemory([...manualMappings, ...suggestionMemory]);
    const manualKnowledgeBaseRows = manualMappings.map((mapping) => ({
      sourceName: mapping.sourceName,
      attributeName: mapping.attributeName,
      sourceValue: mapping.sourceValueNormalized,
      targetValue: mapping.targetValue,
      confidenceScore: 1,
      status: 'validated' as const,
    }));
    setKnownSourceNames((current) => Array.from(new Set([...current, sourceName.trim()])).sort((a, b) => a.localeCompare(b)));
    setKnowledgeBaseRows((current) => [...manualKnowledgeBaseRows, ...current]);
    setTargetValues((current) => Array.from(new Set([...current, ...manualMappings.map((mapping) => mapping.targetValue)])).sort((a, b) => a.localeCompare(b)));
    setSuggestionMemory(mergedMemory);
    setSourceMappingCount(mergedMemory.filter((entry) => entry.sourceName === sourceName.trim()).length);
    if (manualAttributeName.trim() === fieldPath) rebuildRows(records, fieldPath, mergedMemory, sourceName.trim());
    setManualMappingMessage(`${manualMappings.length} mapping(s) associés à ${sourceName.trim()} / ${manualAttributeName.trim()}. Les suggestions futures de cette source seront prioritaires.`);
  }

  function previewSqlCaseMappings() {
    if (!sourceName.trim() || !manualAttributeName.trim()) {
      setSqlCaseMessage('Renseignez Source Name et Attribute Name avant de parser une règle SQL CASE.');
      return;
    }

    const preview = parseSqlCaseMappings(sqlCaseInput, sourceName.trim(), manualAttributeName.trim());
    setSqlCasePreview(preview);
    setSqlCaseMessage(preview.valid ? `${preview.valid} mapping(s) détectés depuis la règle SQL.` : 'Aucun mapping valide détecté dans la règle SQL.');
  }

  function addSqlCaseMappingsToPreview() {
    if (!sqlCasePreview?.mappings.length) {
      setSqlCaseMessage('Aucun mapping SQL valide à ajouter.');
      return;
    }

    setKnowledgeBaseRows((current) => [...sqlCasePreview.mappings, ...current]);
    setKnowledgeBasePreview(buildKnowledgeBasePreview([...sqlCasePreview.mappings, ...knowledgeBaseRows]));
    setTargetValues((current) => Array.from(new Set([...current, ...sqlCasePreview.mappings.map((mapping) => mapping.targetValue)])).sort((a, b) => a.localeCompare(b)));
    setSqlCaseMessage(`${sqlCasePreview.mappings.length} mapping(s) ajoutés au preview knowledge base. Validez puis sauvegardez.`);
  }

  function dedupeSuggestionMemory(entries: SuggestionMemoryEntry[]) {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = `${entry.sourceName ?? '*'}:${entry.attributeName}:${entry.sourceValueNormalized}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function importKnowledgeBaseFile(file: File) {
    try {
      const importedRows = await parseKnowledgeBaseFile(file);
      setKnowledgeBaseRows(importedRows);
      const localPreview = buildKnowledgeBasePreview(importedRows);
      setKnowledgeBasePreview(localPreview);
      setKnowledgeBaseMessage('Preview générée. Corrigez les lignes si besoin puis sauvegardez.');

      const response = await fetch('/api/knowledge-base/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: importedRows }),
      });
      if (response.ok) setKnowledgeBasePreview((await response.json()) as KnowledgeBaseImportPreview);
    } catch {
      setKnowledgeBaseMessage('Impossible de lire ce fichier de mappings. Vérifiez le format CSV/JSON.');
    }
  }

  function updateKnowledgeBaseRow(index: number, patch: Partial<KnowledgeBaseMappingInput>) {
    setKnowledgeBaseRows((current) => {
      const next = current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
      setKnowledgeBasePreview(buildKnowledgeBasePreview(next));
      return next;
    });
  }

  async function saveKnowledgeBaseRows() {
    const validRows = knowledgeBaseRows.filter((row) => row.attributeName && row.sourceValue && row.targetValue && row.status !== 'rejected');
    const response = await fetch('/api/knowledge-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: validRows.map((row) => ({ ...row, status: 'validated' })) }),
    });
    if (response.ok) {
      const savedRows = (await response.json()) as KnowledgeBaseMappingInput[];
      setKnowledgeBaseMessage(`${savedRows.length} mapping(s) sauvegardés dans mapping_knowledge_base.`);
      setTargetValues((current) => Array.from(new Set([...current, ...savedRows.map((row) => row.targetValue)])).sort((a, b) => a.localeCompare(b)));
      const memory = await loadSuggestionMemory(fieldPath, sourceName);
      rebuildRows(records, fieldPath, memory, sourceName);
    } else {
      setKnowledgeBaseMessage('Erreur de sauvegarde dans mapping_knowledge_base. Vérifiez DATABASE_URL.');
    }
  }

  async function addTargetValue() {
    if (!newTargetValue.trim()) return;
    const targetValue = newTargetValue.trim();
    setTargetValues((current) => Array.from(new Set([...current, targetValue])).sort((a, b) => a.localeCompare(b)));
    setNewTargetValue('');
    await fetch('/api/target-values', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributeName: targetAttributeName || fieldPath || 'family', targetValue }),
    });
  }

  function downloadExport() {
    const scopedRows = knowledgeBaseRows.length ? knowledgeBaseRows : rules.map((rule) => ({
      sourceName,
      attributeName: fieldPath,
      sourceValue: rule.sourceValue,
      targetValue: rule.targetValue,
      confidenceScore: rule.confidenceScore,
      status: rule.status,
    }));
    const content = exportFormat === 'csv' ? exportKnowledgeBaseCsv(scopedRows) : exportFormat === 'json' ? exportKnowledgeBaseJson(scopedRows) : exportKnowledgeBaseSql(scopedRows, sourceExpression || fieldPath);
    const blob = new Blob([content], { type: exportFormat === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pimup-mappings.${exportFormat}`;
    link.click();
    URL.revokeObjectURL(url);
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl font-bold">PIMuP Mapping Assistant</h1>
          <div className="flex gap-2">
            <a href="/ai-training" className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/25">AI Training</a>
            <a href="/target-values" className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/25">Target Values</a>
          </div>
        </div>
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
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="source-name">
              Nom de la source / fournisseur
            </label>
            <input
              id="source-name"
              list="known-source-names"
              value={sourceName}
              onChange={(event) => renameSource(event.target.value)}
              placeholder="Ex: supplier-running-2026.csv"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-pimup-500"
            />
            <datalist id="known-source-names">
              {knownSourceNames.map((knownSourceName) => (
                <option key={knownSourceName} value={knownSourceName} />
              ))}
            </datalist>
            <p className="mt-3 text-sm text-slate-500">{records.length} produits importés {sourceName && `depuis ${sourceName}`}.</p>
            {sourceName && (
              <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {sourceMappingCount > 0
                  ? `${sourceMappingCount} mappings existants détectés pour cette source et utilisés en priorité.`
                  : 'Aucun mapping existant détecté pour cette source : les suggestions globales restent utilisées.'}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">2. Champ source</h2>
            <select
              value={fieldPath}
              onChange={async (event) => {
                setFieldPath(event.target.value);
                const memory = await loadSuggestionMemory(event.target.value, sourceName);
                rebuildRows(records, event.target.value, memory, sourceName);
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
            <h2 className="text-xl font-semibold">3. Éditeur de mappings existants</h2>
            <p className="mt-2 text-sm text-slate-500">
              Ajoutez des mappings connus pour une source et un attribut. Ils seront associés à cette source puis utilisés en priorité dans les suggestions futures.
            </p>
            <div className="mt-4 grid gap-3">
              <label className="block text-sm font-semibold text-slate-700" htmlFor="manual-source-name">
                Source Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="manual-source-name"
                list="known-source-names"
                required
                value={sourceName}
                onChange={(event) => renameSource(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-pimup-500"
                placeholder="Nike B2B, Puma B2B, Ekkia, Bihr..."
              />
              <label className="block text-sm font-semibold text-slate-700" htmlFor="manual-attribute-name">
                Attribute Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="manual-attribute-name"
                list="known-attribute-names"
                required
                value={manualAttributeName}
                onChange={(event) => renameManualAttribute(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-pimup-500"
                placeholder="family, size, color, season, gender, sport"
              />
              <datalist id="known-attribute-names">
                {knownAttributeNames.map((attributeName) => (
                  <option key={attributeName} value={attributeName} />
                ))}
              </datalist>
            </div>
            {!canAddManualMappings && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Source Name et Attribute Name sont obligatoires avant de pouvoir ajouter des mappings à la knowledge base locale.
              </p>
            )}
            <textarea
              value={manualMappingsInput}
              onChange={(event) => setManualMappingsInput(event.target.value)}
              rows={5}
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-mono focus:border-pimup-500"
              placeholder={"SNAPBACK => Casquette snapback\nRUNNING => Running"}
            />
            {containsSqlCaseSyntax(manualMappingsInput) && (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Le contenu semble être une règle SQL complète. Merci d’utiliser l’import SQL Parser ou de fournir un mapping one-to-one simple.
              </p>
            )}
            <button
              type="button"
              onClick={applyManualMappings}
              disabled={!canAddManualMappings || containsSqlCaseSyntax(manualMappingsInput)}
              className="mt-3 w-full rounded-xl bg-pimup-700 px-4 py-2 font-semibold text-white hover:bg-pimup-800 disabled:bg-slate-300 disabled:text-slate-500"
            >
              Ajouter à cette source
            </button>
            {manualMappingMessage && <p className="mt-3 text-sm text-slate-600">{manualMappingMessage}</p>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Import SQL CASE Parser</h2>
            <p className="mt-2 text-sm text-slate-500">
              Collez ici une règle SQL CASE WHEN complète. Les blocs WHEN/THEN supportés seront convertis en mappings avec source_path et matcher_type. Les ELSE CONCAT(...) sont ignorés.
            </p>
            <textarea
              value={sqlCaseInput}
              onChange={(event) => setSqlCaseInput(event.target.value)}
              rows={6}
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-mono focus:border-pimup-500"
              placeholder={"WHEN raw_data->'attributes'->'articletype'->0->>'value' = 'BB Caps'\nTHEN 'Casquette de baseball'"}
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={previewSqlCaseMappings} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Prévisualiser SQL
              </button>
              <button type="button" onClick={addSqlCaseMappingsToPreview} disabled={!sqlCasePreview?.mappings.length} className="rounded-xl bg-pimup-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
                Ajouter au preview
              </button>
            </div>
            {sqlCaseMessage && <p className="mt-3 text-sm text-slate-600">{sqlCaseMessage}</p>}
            {sqlCasePreview && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Lignes détectées" value={sqlCasePreview.detected} />
                  <StatCard label="Mappings valides" value={sqlCasePreview.valid} tone="success" />
                  <StatCard label="Ignorés" value={sqlCasePreview.ignored} tone="warning" />
                  <StatCard label="Erreurs" value={sqlCasePreview.errors.length} tone="warning" />
                </div>
                <div className="max-h-48 overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Target Value</th>
                        <th className="px-3 py-2">Conditions</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sqlCasePreview.mappings.map((mapping, index) => (
                        <tr key={`${mapping.sourcePath}-${mapping.sourceValue}-${index}`}>
                          <td className="px-3 py-2">{mapping.targetValue}</td>
                          <td className="px-3 py-2">{mapping.conditions?.map((condition) => `${condition.sourcePath} ${condition.operator} ${condition.value}`).join(' AND ') ?? mapping.sourceValue}</td>
                          <td className="px-3 py-2">valid</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(sqlCasePreview.debugCases.length > 0 || sqlCasePreview.errors.length > 0) && (
                  <pre className="max-h-32 overflow-auto rounded-xl bg-slate-100 p-3 text-xs text-slate-700">{JSON.stringify({ ignored: sqlCasePreview.debugCases, errors: sqlCasePreview.errors }, null, 2)}</pre>
                )}
              </div>
            )}
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

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Typologies détectées</h2>
            {detectedTypologies.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {detectedTypologies.map((typology) => (
                  <div key={typology.label} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-emerald-900">{typology.label}</p>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-emerald-700">
                        {Math.round(typology.confidenceScore * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-emerald-700">Mots-clés : {typology.matchedKeywords.join(', ')}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Importez une source pour détecter les sports, thématiques ou familles typologiques potentielles.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Preview des 50 premières lignes</h2>
            <pre className="max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {records.length ? JSON.stringify(records.slice(0, 50), null, 2) : 'Importez un fichier CSV ou JSON pour commencer.'}
            </pre>
          </div>
        </div>
      </section>


      <section className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Target Values</h2>
          <p className="mt-2 text-sm text-slate-500">Gérez les valeurs cibles autorisées utilisées par le selector du tableau.</p>
          <input
            value={targetAttributeName}
            onChange={(event) => setTargetAttributeName(event.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm"
            placeholder="attribute_name ex: family"
          />
          <div className="mt-3 flex gap-2">
            <input
              value={newTargetValue}
              onChange={(event) => setNewTargetValue(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm"
              placeholder="Nouvelle valeur cible"
            />
            <button type="button" onClick={addTargetValue} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Ajouter
            </button>
          </div>
          <div className="mt-4 flex max-h-52 flex-wrap gap-2 overflow-auto">
            {targetValues.map((targetValue) => (
              <span key={targetValue} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {targetValue}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Import mappings one-to-one CSV/JSON</h2>
          <p className="mt-2 text-sm text-slate-500">Colonnes obligatoires : source_value, target_value, attribute_name. Les colonnes source_name, family, sport, category, brand, gender, confidence_score et status sont optionnelles.</p>
          <input
            type="file"
            accept=".csv,.json,application/json,text/csv"
            onChange={(event) => event.target.files?.[0] && importKnowledgeBaseFile(event.target.files[0])}
            className="mt-4 w-full rounded-xl border border-dashed border-slate-300 p-4 text-sm"
          />
          {knowledgeBasePreview && (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
              <StatCard label="Importées" value={knowledgeBasePreview.total} />
              <StatCard label="Valides" value={knowledgeBasePreview.valid} tone="success" />
              <StatCard label="Invalides" value={knowledgeBasePreview.invalid} tone="warning" />
              <StatCard label="Doublons" value={knowledgeBasePreview.duplicates} tone="warning" />
              <StatCard label="Existants" value={knowledgeBasePreview.existing} />
              <StatCard label="Conflits" value={knowledgeBasePreview.conflicts.length} tone="warning" />
            </div>
          )}
          {knowledgeBaseMessage && <p className="mt-3 text-sm text-slate-600">{knowledgeBaseMessage}</p>}
            {knowledgeBasePreview && knowledgeBasePreview.conflicts.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="font-semibold text-amber-900">Conflits potentiels à arbitrer</h3>
                <div className="mt-3 space-y-2">
                  {knowledgeBasePreview.conflicts.slice(0, 8).map((conflict) => (
                    <div key={`${conflict.index}-${conflict.sourceValue}`} className="grid gap-2 rounded-lg bg-white p-3 text-xs md:grid-cols-[1fr_180px]">
                      <p>
                        <strong>{conflict.sourceValue}</strong> / {conflict.attributeName} : existant <strong>{conflict.existingTargetValue}</strong>, import <strong>{conflict.importedTargetValue}</strong>
                      </p>
                      <select
                        onChange={(event) => {
                          if (event.target.value === 'keep') updateKnowledgeBaseRow(conflict.index, { targetValue: conflict.existingTargetValue, status: 'validated' });
                          if (event.target.value === 'replace') updateKnowledgeBaseRow(conflict.index, { targetValue: conflict.importedTargetValue, status: 'validated' });
                          if (event.target.value === 'exception') updateKnowledgeBaseRow(conflict.index, { sourceName: sourceName || knowledgeBaseRows[conflict.index]?.sourceName || 'source-exception', status: 'validated' });
                          if (event.target.value === 'ignore') updateKnowledgeBaseRow(conflict.index, { status: 'rejected' });
                        }}
                        className="rounded border border-amber-200 px-2 py-1"
                        defaultValue="keep"
                      >
                        <option value="keep">Garder l’existant</option>
                        <option value="replace">Remplacer</option>
                        <option value="exception">Créer une exception source</option>
                        <option value="ignore">Ignorer</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          {knowledgeBaseRows.length > 0 && (
            <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">source</th>
                    <th className="px-3 py-2">attribute</th>
                    <th className="px-3 py-2">source_value</th>
                    <th className="px-3 py-2">target_value</th>
                    <th className="px-3 py-2">status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {knowledgeBaseRows.slice(0, 50).map((row, index) => (
                    <tr key={`${row.sourceName}-${row.attributeName}-${row.sourceValue}-${index}`}>
                      <td className="px-3 py-2"><input value={row.sourceName ?? ''} onChange={(event) => updateKnowledgeBaseRow(index, { sourceName: event.target.value })} className="w-32 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-2"><input value={row.attributeName} onChange={(event) => updateKnowledgeBaseRow(index, { attributeName: event.target.value })} className="w-28 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-2"><input value={row.sourceValue} onChange={(event) => updateKnowledgeBaseRow(index, { sourceValue: event.target.value })} className="w-36 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-2"><input list="target-values" value={row.targetValue} onChange={(event) => updateKnowledgeBaseRow(index, { targetValue: event.target.value })} className="w-48 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-2">
                        <select value={row.status ?? 'validated'} onChange={(event) => updateKnowledgeBaseRow(index, { status: event.target.value as KnowledgeBaseMappingInput['status'] })} className="rounded border border-slate-200 px-2 py-1">
                          <option value="validated">validated</option>
                          <option value="draft">draft</option>
                          <option value="rejected">ignore</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={saveKnowledgeBaseRows} disabled={!knowledgeBaseRows.length} className="rounded-xl bg-pimup-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
              Sauvegarder dans mapping_knowledge_base
            </button>
            <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'csv' | 'json' | 'sql')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="csv">Export CSV</option>
              <option value="json">Export JSON</option>
              <option value="sql">Export SQL CASE WHEN</option>
            </select>
            <button type="button" onClick={downloadExport} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
              Télécharger
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">4. Mapping des valeurs distinctes</h2>
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
          targetValues={targetValues}
          onQueryChange={setQuery}
          onToggle={(value) => setSelectedValues((current) => {
            const next = new Set(current);
            next.has(value) ? next.delete(value) : next.add(value);
            return next;
          })}
          onTargetChange={updateTarget}
          onRejectSuggestion={rejectSuggestion}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Sparkles className="text-pimup-700" />
            <h2 className="text-2xl font-bold">5. Rule Builder</h2>
          </div>
          <SqlPreview sql={generatedRule.sql} />
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Database className="text-pimup-700" />
            <h2 className="text-2xl font-bold">6. Rule Tester</h2>
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
