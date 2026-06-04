'use client';

import type { MappingRow, MappingStatus } from '@/lib/types/mapping';

interface MappingTableProps {
  rows: MappingRow[];
  query: string;
  selectedValues: Set<string>;
  onQueryChange: (query: string) => void;
  onToggle: (value: string) => void;
  onTargetChange: (value: string, targetValue: string, status?: MappingStatus) => void;
}

export function MappingTable({ rows, query, selectedValues, onQueryChange, onToggle, onTargetChange }: MappingTableProps) {
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
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Bulk</th>
              <th className="px-4 py-3">Valeur source</th>
              <th className="px-4 py-3">Count</th>
              <th className="px-4 py-3">Suggestion</th>
              <th className="px-4 py-3">Valeur cible PIMuP</th>
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
                    <button
                      type="button"
                      onClick={() => onTargetChange(row.value, row.suggestion.targetValue, 'suggested')}
                      className="rounded-full bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-700 hover:bg-blue-100"
                      title={row.suggestion.reason}
                    >
                      {row.suggestion.targetValue} ({Math.round(row.suggestion.confidenceScore * 100)}%)
                    </button>
                  ) : (
                    <span className="text-slate-400">Aucune</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <input
                    value={row.targetValue}
                    onChange={(event) => onTargetChange(row.value, event.target.value, event.target.value ? 'validated' : 'unmapped')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-pimup-500"
                    placeholder="Ex: Casquette snapback"
                  />
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
