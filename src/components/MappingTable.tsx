'use client';

import type { MappingRow, MappingStatus } from '@/lib/types/mapping';

interface MappingTableProps {
  rows: MappingRow[];
  query: string;
  selectedValues: Set<string>;
  targetValues: string[];
  onQueryChange: (query: string) => void;
  onToggle: (value: string) => void;
  onTargetChange: (value: string, targetValue: string, status?: MappingStatus) => void;
  onRejectSuggestion: (value: string) => void;
}

export function MappingTable({ rows, query, selectedValues, targetValues, onQueryChange, onToggle, onTargetChange, onRejectSuggestion }: MappingTableProps) {
  const filtered = rows.filter((row) => `${row.value} ${row.targetValue} ${row.suggestion.targetValue}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Rechercher une valeur source ou cible..."
          className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-pimup-500"
        />
      </div>
      <datalist id="target-values">
        {targetValues.map((targetValue) => (
          <option key={targetValue} value={targetValue} />
        ))}
      </datalist>
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Bulk</th>
              <th className="px-4 py-3">Valeur source</th>
              <th className="px-4 py-3">Count</th>
              <th className="px-4 py-3">Suggestion IA</th>
              <th className="px-4 py-3">Selector target_value</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <tr key={row.value} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selectedValues.has(row.value)} onChange={() => onToggle(row.value)} />
                </td>
                <td className="max-w-xs px-4 py-3 font-medium text-slate-900">{row.value || <span className="text-slate-400">(vide)</span>}</td>
                <td className="px-4 py-3 text-slate-600">{row.count}</td>
                <td className="px-4 py-3">
                  {row.suggestion.targetValue ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => onTargetChange(row.value, row.suggestion.targetValue, 'suggested')}
                        className={
                          row.suggestion.reason === 'source-history'
                            ? 'rounded-full bg-emerald-50 px-3 py-1 text-left text-xs font-medium text-emerald-700 hover:bg-emerald-100'
                            : 'rounded-full bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-700 hover:bg-blue-100'
                        }
                        title={row.suggestion.reason}
                      >
                        {row.suggestion.targetValue} ({Math.round(row.suggestion.confidenceScore * 100)}%)
                        {row.suggestion.reason === 'source-history' ? ' · source' : ''}
                      </button>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => onTargetChange(row.value, row.suggestion.targetValue, 'validated')} className="text-xs font-semibold text-emerald-700">
                          Valider
                        </button>
                        <button type="button" onClick={() => onRejectSuggestion(row.value)} className="text-xs font-semibold text-rose-600">
                          Rejeter
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400">Aucune</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <input
                    list="target-values"
                    value={row.targetValue}
                    onChange={(event) => onTargetChange(row.value, event.target.value, event.target.value ? 'validated' : 'unmapped')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-pimup-500"
                    placeholder="Rechercher ou ajouter une cible"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Tapez une nouvelle valeur pour l’ajouter au référentiel local.</p>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
