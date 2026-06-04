'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database, FileJson, Sparkles } from 'lucide-react';
import { SqlPreview } from '@/components/SqlPreview';
import { StatCard } from '@/components/StatCard';
import { getDistinctValues } from '@/lib/mapping/distinct';
import { flattenFieldPaths, getValueByPath } from '@/lib/mapping/paths';
import { parseSourceFile } from '@/lib/mapping/parser';
import { exportKnowledgeBaseCsv, exportKnowledgeBaseJson, exportKnowledgeBaseSql } from '@/lib/mapping/knowledge-base';
import { buildBusinessKeywordStats, mappingReviewSummary, prepareMappingReviewRows } from '@/lib/mapping/mapping-review';
import { conditionsToHumanLabel, generateSqlFromKnowledgeRows, knowledgeRowMatches, testKnowledgeRows, validatedKnowledgeRows } from '@/lib/mapping/rule-execution';
import { parseSqlCaseMappings } from '@/lib/mapping/sql-case-parser';
import { SEED_SUGGESTIONS } from '@/lib/mapping/suggestions';
import type { KnowledgeBaseMappingInput, MappingRuleType, SourceRecord, SqlCaseParsePreview } from '@/lib/types/mapping';

const DEFAULT_SOURCE_NAMES = ['Nike B2B', 'Puma B2B', 'Ekkia', 'Bihr', 'DK Company', 'Tamaris', 'New Era'];
const DEFAULT_ATTRIBUTE_NAMES = ['family', 'size', 'color', 'season', 'gender', 'sport'];

export default function Home() {
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [sourceName, setSourceName] = useState('Puma B2B');
  const [brandName, setBrandName] = useState('Puma');
  const [attributeName, setAttributeName] = useState('family');
  const [mappingType, setMappingType] = useState<MappingRuleType>('sql_case');
  const [fieldPath, setFieldPath] = useState('');
  const [knownSourceNames, setKnownSourceNames] = useState<string[]>(DEFAULT_SOURCE_NAMES);
  const [sqlCaseInput, setSqlCaseInput] = useState(`CASE
  WHEN raw_data->>'model_category' = 'Pants' THEN
    CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Pantalon chino' END
  WHEN raw_data->>'model_category' = 'Shorts' THEN
    CASE WHEN raw_data->>'model_description' ~* 'Chino' THEN 'Short chino' END
END`);
  const [sqlCasePreview, setSqlCasePreview] = useState<SqlCaseParsePreview | null>(null);
  const [reviewRows, setReviewRows] = useState<KnowledgeBaseMappingInput[]>([]);
  const [parserMessage, setParserMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'sql'>('sql');

  const fields = useMemo(() => flattenFieldPaths(records), [records]);
  const sourceExpression = fields.find((field) => field.label === fieldPath)?.sqlExpression ?? fieldPath;
  const validatedRows = useMemo(() => validatedKnowledgeRows(reviewRows), [reviewRows]);
  const reviewSummary = useMemo(() => mappingReviewSummary(reviewRows), [reviewRows]);
  const keywordStats = useMemo(() => buildBusinessKeywordStats(reviewRows), [reviewRows]);
  const generatedSql = useMemo(() => generateSqlFromKnowledgeRows(validatedRows, sourceExpression || 'raw_data'), [validatedRows, sourceExpression]);
  const testResult = useMemo(() => testKnowledgeRows(records, validatedRows, fieldPath), [records, validatedRows, fieldPath]);
  const targetValues = useMemo(() => Array.from(new Set([...SEED_SUGGESTIONS.map((suggestion) => suggestion.targetValue), ...reviewRows.map((row) => row.targetValue).filter(Boolean)])).sort(), [reviewRows]);
  const attributeNames = useMemo(() => Array.from(new Set([...DEFAULT_ATTRIBUTE_NAMES, ...fields.map((field) => field.label), attributeName].filter(Boolean))).sort(), [fields, attributeName]);
  const coverageRows = useMemo(() => {
    if (!records.length || !fieldPath) return [];
    return getDistinctValues(records, fieldPath).map((distinct) => {
      const sampleRecords = records.filter((record) => String(getValueByPath(record, fieldPath) ?? '') === distinct.value);
      const targets = new Set<string>();
      for (const record of sampleRecords) {
        for (const rule of validatedRows) if (knowledgeRowMatches(record, rule, fieldPath)) targets.add(rule.targetValue);
      }
      const keywordStat = keywordStats.find((stat) => distinct.value.toUpperCase().includes(stat.keywordNormalized));
      return { ...distinct, targets: [...targets], keywordStat };
    });
  }, [records, fieldPath, validatedRows, keywordStats]);

  useEffect(() => {
    async function loadKnownSources() {
      try {
        const [projectsResponse, knowledgeBaseResponse] = await Promise.all([fetch('/api/projects'), fetch('/api/knowledge-base')]);
        const projects = (await projectsResponse.json()) as Array<{ sourceName?: string }>;
        const knowledgeBaseRows = (await knowledgeBaseResponse.json()) as Array<{ sourceName?: string }>;
        setKnownSourceNames(Array.from(new Set([...DEFAULT_SOURCE_NAMES, ...projects.map((project) => project.sourceName).filter(Boolean) as string[], ...knowledgeBaseRows.map((row) => row.sourceName).filter(Boolean) as string[]])).sort());
      } catch {
        setKnownSourceNames(DEFAULT_SOURCE_NAMES);
      }
    }

    loadKnownSources();
  }, []);

  async function handleUpload(file: File) {
    const parsedRecords = await parseSourceFile(file);
    setRecords(parsedRecords);
    const parsedFields = flattenFieldPaths(parsedRecords);
    const preferredField = parsedFields.find((field) => field.label === 'raw_data.name' || field.label === 'name' || field.label.includes('model_description')) ?? parsedFields[0];
    setFieldPath(preferredField?.label ?? '');
    if (!sourceName.trim()) setSourceName(file.name);
  }

  async function loadDemoData() {
    const response = await fetch('/samples/pimup-products.json');
    const blob = await response.blob();
    await handleUpload(new File([blob], 'pimup-products.json', { type: 'application/json' }));
  }

  function previewSqlCaseMappings() {
    if (!sourceName.trim() || !attributeName.trim()) {
      setParserMessage('Source Name et Attribute Name sont obligatoires avant de parser le SQL.');
      return;
    }

    const preview = parseSqlCaseMappings(sqlCaseInput, sourceName.trim(), attributeName.trim());
    const preparedRows = prepareMappingReviewRows(preview.mappings.map((mapping) => ({ ...mapping, brand: brandName.trim() || undefined })));
    setSqlCasePreview({ ...preview, mappings: preparedRows, valid: preparedRows.filter((row) => row.status !== 'needs_context' && row.status !== 'rejected').length });
    setReviewRows(preparedRows);
    setParserMessage(preparedRows.length ? `${preparedRows.length} règle(s) détectée(s). Validez-les dans l’étape 4 avant export ou sauvegarde.` : 'Aucune règle SQL exploitable détectée.');
  }

  function updateReviewRow(index: number, patch: Partial<KnowledgeBaseMappingInput>) {
    setReviewRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function saveValidatedRows() {
    const response = await fetch('/api/knowledge-base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: validatedRows.map((row) => ({ ...row, status: 'validated' })) }),
    });
    setSaveMessage(response.ok ? `${validatedRows.length} règle(s) validée(s) sauvegardée(s).` : 'Sauvegarde impossible : vérifiez DATABASE_URL.');
  }

  function downloadExport() {
    const content = exportFormat === 'csv' ? exportKnowledgeBaseCsv(validatedRows) : exportFormat === 'json' ? exportKnowledgeBaseJson(validatedRows) : exportKnowledgeBaseSql(validatedRows, sourceExpression || 'raw_data');
    const blob = new Blob([content], { type: exportFormat === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pimup-validated-rules.${exportFormat}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-pimup-900 to-pimup-500 p-8 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-100">PIMuP interne</p>
        <h1 className="mt-3 text-4xl font-bold">PIMuP Mapping Assistant</h1>
        <p className="mt-3 max-w-3xl text-blue-50">Workflow simplifié : configuration source, upload data, parser SQL, validation humaine, coverage et export.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold">1. Source Configuration</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-5">
          <label className="text-sm font-semibold text-slate-700">Source Name
            <input list="known-source-names" value={sourceName} onChange={(event) => setSourceName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Puma B2B" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Brand
            <input value={brandName} onChange={(event) => setBrandName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Puma" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Attribute Name
            <input list="attribute-names" value={attributeName} onChange={(event) => setAttributeName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="family" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Source Path principal
            <select value={fieldPath} onChange={(event) => setFieldPath(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choisir après upload</option>
              {fields.map((field) => <option key={field.label} value={field.label}>{field.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Mapping Type
            <select value={mappingType} onChange={(event) => setMappingType(event.target.value as MappingRuleType)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="sql_case">SQL CASE</option>
              <option value="contextual">Contextual Rules</option>
              <option value="one_to_one">One-to-one</option>
            </select>
          </label>
        </div>
        <datalist id="known-source-names">{knownSourceNames.map((name) => <option key={name} value={name} />)}</datalist>
        <datalist id="attribute-names">{attributeNames.map((name) => <option key={name} value={name} />)}</datalist>
        <datalist id="target-values">{targetValues.map((value) => <option key={value} value={value} />)}</datalist>
      </section>

      <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><FileJson className="text-pimup-700" /><h2 className="text-2xl font-bold">2. Upload Data</h2></div>
          <input type="file" accept=".csv,.json,application/json,text/csv" onChange={(event) => event.target.files?.[0] && handleUpload(event.target.files[0])} className="mt-5 w-full rounded-xl border border-dashed border-slate-300 p-4 text-sm" />
          <button type="button" onClick={loadDemoData} className="mt-3 w-full rounded-xl border border-pimup-700 px-4 py-2 text-sm font-semibold text-pimup-700 hover:bg-pimup-50">Charger les données de démo locales</button>
          <p className="mt-3 text-sm text-slate-500">{records.length} produit(s) importé(s). Source path actif : <strong>{fieldPath || '—'}</strong></p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Preview des 50 premières lignes</h3>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{records.length ? JSON.stringify(records.slice(0, 50), null, 2) : 'Importez un fichier CSV ou JSON pour commencer.'}</pre>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold">3. SQL Parser</h2>
        <p className="mt-2 text-sm text-slate-500">Collez une règle SQL CASE WHEN. Le bouton Prévisualiser SQL produit une liste visible de règles détectées, sans sauvegarde automatique.</p>
        <textarea value={sqlCaseInput} onChange={(event) => setSqlCaseInput(event.target.value)} rows={10} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm focus:border-pimup-500" />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={previewSqlCaseMappings} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Prévisualiser SQL</button>
          {parserMessage && <p className="text-sm text-slate-600">{parserMessage}</p>}
        </div>
        {sqlCasePreview && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Règles détectées" value={reviewSummary.detected} />
              <StatCard label="Règles valides" value={reviewSummary.valid} tone="success" />
              <StatCard label="Règles ambiguës" value={reviewSummary.ambiguous} tone="warning" />
              <StatCard label="Règles rejetées" value={reviewSummary.rejected} tone="warning" />
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500"><tr><th className="px-3 py-2">Conditions détectées</th><th className="px-3 py-2">Target value</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Raison</th><th className="px-3 py-2">Needs Context</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {reviewRows.map((row, index) => (
                    <tr key={`${row.sourceValue}-${row.targetValue}-${index}`}>
                      <td className="px-3 py-2">{row.conditions?.length ? conditionsToHumanLabel(row.conditions) : row.sourceValue}</td>
                      <td className="px-3 py-2 font-semibold">{row.targetValue}</td>
                      <td className="px-3 py-2">{Math.round((row.confidenceScore ?? 0) * 100)}%</td>
                      <td className="px-3 py-2 text-slate-500">{row.reason}</td>
                      <td className="px-3 py-2">{row.status === 'needs_context' ? 'Oui' : 'Non'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(sqlCasePreview.debugCases.length > 0 || sqlCasePreview.errors.length > 0) && <pre className="max-h-32 overflow-auto rounded-xl bg-slate-100 p-3 text-xs">{JSON.stringify({ ignored: sqlCasePreview.debugCases, errors: sqlCasePreview.errors }, null, 2)}</pre>}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold">4. Mapping Review & Validation</h2>
        <p className="mt-2 text-sm text-slate-500">Validez les règles avant de les ajouter au projet. Les règles rejetées ne seront ni testées ni exportées.</p>
        <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left uppercase text-slate-500"><tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">Conditions</th><th className="px-3 py-2">Target value</th><th className="px-3 py-2">Business score</th><th className="px-3 py-2">Validation / Rejection / Sources</th><th className="px-3 py-2">Needs Context</th><th className="px-3 py-2">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {reviewRows.length ? reviewRows.map((row, index) => (
                <tr key={`${row.sourceValue}-${index}`}>
                  <td className="px-3 py-2"><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{row.status}</span></td>
                  <td className="min-w-72 px-3 py-2">{row.conditions?.length ? conditionsToHumanLabel(row.conditions) : row.sourceValue}</td>
                  <td className="px-3 py-2"><input list="target-values" value={row.targetValue} onChange={(event) => updateReviewRow(index, { targetValue: event.target.value, status: 'suggested' })} className="w-56 rounded border border-slate-200 px-2 py-1" /></td>
                  <td className="px-3 py-2">{Math.round((row.confidenceScore ?? 0) * 100)}%</td>
                  <td className="px-3 py-2">{row.validationCount ?? 0} / {row.rejectionCount ?? 0} / {row.sourceCount ?? 1}</td>
                  <td className="px-3 py-2">{row.status === 'needs_context' ? 'Oui — contexte obligatoire' : 'Non'}</td>
                  <td className="px-3 py-2"><div className="flex flex-wrap gap-1"><button type="button" onClick={() => updateReviewRow(index, { status: 'validated', validationCount: (row.validationCount ?? 0) + 1 })} className="rounded bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">Accepter</button><button type="button" onClick={() => updateReviewRow(index, { status: 'suggested' })} className="rounded bg-blue-100 px-2 py-1 font-semibold text-blue-700">Modifier</button><button type="button" onClick={() => updateReviewRow(index, { status: 'rejected', rejectionCount: (row.rejectionCount ?? 0) + 1 })} className="rounded bg-rose-100 px-2 py-1 font-semibold text-rose-700">Rejeter</button></div></td>
                </tr>
              )) : <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Aucune règle détectée. Utilisez l’étape 3 pour prévisualiser un SQL CASE.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold">5. Coverage & Export</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <StatCard label="Total produits" value={testResult.total} />
          <StatCard label="Produits couverts" value={testResult.matched} tone="success" />
          <StatCard label="Non couverts" value={testResult.unmatched} tone="warning" />
          <StatCard label="Coverage" value={`${Math.round(testResult.coverage * 100)}%`} />
          <StatCard label="Règles validées" value={validatedRows.length} />
          <StatCard label="Conflits" value={testResult.conflicts.length} tone="warning" />
        </div>
        {keywordStats.length > 0 && (
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs"><thead className="bg-slate-50 text-left uppercase text-slate-500"><tr><th className="px-3 py-2">Keyword</th><th className="px-3 py-2">Validé/Rejeté</th><th className="px-3 py-2">Sources</th><th className="px-3 py-2">Confidence</th><th className="px-3 py-2">Targets connues</th><th className="px-3 py-2">Needs Context</th></tr></thead><tbody className="divide-y divide-slate-100">{keywordStats.map((stat) => <tr key={`${stat.attributeName}-${stat.keywordNormalized}`}><td className="px-3 py-2 font-semibold">{stat.keyword}</td><td className="px-3 py-2">{stat.validationCount} / {stat.rejectionCount}</td><td className="px-3 py-2">{stat.sourceCount}</td><td className="px-3 py-2">{Math.round(stat.confidenceScore * 100)}%</td><td className="px-3 py-2">{stat.targets.map((target) => `${target.targetValue}: ${target.count}`).join(' · ')}</td><td className="px-3 py-2">{stat.reliability === 'context_required' ? 'Oui' : 'Non'}</td></tr>)}</tbody></table>
          </div>
        )}
        {coverageRows.length > 0 && (
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs"><thead className="bg-slate-50 text-left uppercase text-slate-500"><tr><th className="px-3 py-2">Valeur distincte</th><th className="px-3 py-2">Count</th><th className="px-3 py-2">Mapping trouvé</th><th className="px-3 py-2">Rating keyword</th></tr></thead><tbody className="divide-y divide-slate-100">{coverageRows.map((row) => <tr key={row.value}><td className="px-3 py-2 font-semibold">{row.value || '(vide)'}</td><td className="px-3 py-2">{row.count}</td><td className="px-3 py-2">{row.targets.length ? row.targets.join(', ') : 'Mapping manquant'}</td><td className="px-3 py-2">{row.keywordStat ? `${Math.round(row.keywordStat.confidenceScore * 100)}% · ${row.keywordStat.reliability}` : '—'}</td></tr>)}</tbody></table>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3"><div className="flex items-center gap-2"><Sparkles className="text-pimup-700" /><h3 className="text-xl font-semibold">Rule Builder</h3></div><p className="text-sm text-slate-500">SQL généré uniquement à partir des règles validées.</p><SqlPreview sql={generatedSql} /></div>
          <div className="space-y-3"><div className="flex items-center gap-2"><Database className="text-pimup-700" /><h3 className="text-xl font-semibold">Rule Tester</h3></div><pre className="max-h-72 overflow-auto rounded-xl bg-slate-100 p-3 text-xs">{JSON.stringify({ conflicts: testResult.conflicts.slice(0, 5), unmatchedExamples: testResult.unmatchedExamples, examplesByTarget: testResult.examplesByTarget }, null, 2)}</pre></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={saveValidatedRows} disabled={!validatedRows.length} className="rounded-xl bg-pimup-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">Sauvegarder les règles validées</button>
          <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'csv' | 'json' | 'sql')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="sql">Export SQL CASE WHEN</option><option value="csv">Export CSV</option><option value="json">Export JSON</option></select>
          <button type="button" onClick={downloadExport} disabled={!validatedRows.length} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:text-slate-300">Télécharger</button>
          {saveMessage && <p className="text-sm text-slate-600">{saveMessage}</p>}
        </div>
      </section>
    </main>
  );
}
