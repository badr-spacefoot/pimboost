export type SourceRecord = Record<string, unknown>;

export type MappingStatus = 'unmapped' | 'suggested' | 'validated';
export type MatcherType = 'exact' | 'regex' | 'contains';

export interface FieldPath {
  label: string;
  sqlExpression: string;
}

export interface DistinctValue {
  value: string;
  count: number;
}

export interface MappingSuggestion {
  targetValue: string;
  confidenceScore: number;
  reason: 'memory' | 'similarity' | 'keyword' | 'none';
}

export interface MappingRow extends DistinctValue {
  suggestion: MappingSuggestion;
  targetValue: string;
  status: MappingStatus;
}

export interface MappingRuleInput {
  sourceValue: string;
  targetValue: string;
  matcherType: MatcherType;
  confidenceScore?: number;
  status?: 'draft' | 'validated' | 'rejected';
}

export interface GeneratedRule {
  sql: string;
  clauses: Array<{ targetValue: string; pattern: string; sourceValues: string[] }>;
}

export interface RuleTestResult {
  total: number;
  matched: number;
  unmatched: number;
  coverage: number;
  unmatchedExamples: SourceRecord[];
  examplesByTarget: Record<string, SourceRecord[]>;
  conflicts: Array<{ record: SourceRecord; matchedTargets: string[]; matchedRules: MappingRuleInput[] }>;
}

export interface SuggestionMemoryEntry {
  attributeName: string;
  sourceValueNormalized: string;
  targetValue: string;
  usageCount: number;
}
