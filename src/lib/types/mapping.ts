export type SourceRecord = Record<string, unknown>;

export type MappingStatus = 'unmapped' | 'detected' | 'suggested' | 'validated' | 'rejected' | 'ignored' | 'conflict' | 'needs_context';
export type MatcherType = 'exact' | 'regex' | 'contains';
export type MappingRuleType = 'one_to_one' | 'contextual' | 'regex' | 'sql_case';
export type MappingConditionOperator = '=' | '~*' | 'IN' | 'contains';

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
  reason: 'source-history' | 'memory' | 'similarity' | 'keyword' | 'none';
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
  sourceName?: string;
  reason?: 'source-history' | 'memory';
}

export interface TypologyDetection {
  label: string;
  matchedKeywords: string[];
  confidenceScore: number;
}

export interface MappingCondition {
  sourcePath: string;
  operator: MappingConditionOperator;
  value: string;
  conditionGroup?: string;
}

export interface KnowledgeBaseMappingInput {
  id?: string;
  sourceName?: string;
  attributeName: string;
  sourceValue: string;
  targetValue: string;
  sourcePath?: string;
  matcherType?: MatcherType;
  ruleType?: MappingRuleType;
  conditions?: MappingCondition[];
  family?: string;
  sport?: string;
  category?: string;
  brand?: string;
  gender?: string;
  confidenceScore?: number;
  status?: MappingStatus | 'draft';
  validationCount?: number;
  rejectionCount?: number;
  sourceCount?: number;
  reason?: string;
}

export interface KnowledgeBaseImportPreview {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  existing: number;
  newMappings: number;
  conflicts: Array<{
    index: number;
    sourceValue: string;
    attributeName: string;
    conditions?: MappingCondition[];
    existingTargetValue: string;
    importedTargetValue: string;
  }>;
  rows: Array<{
    row: KnowledgeBaseMappingInput;
    errors: string[];
    duplicate: boolean;
    existing: boolean;
  }>;
}


export interface SqlCaseParsePreview {
  detected: number;
  valid: number;
  ignored: number;
  errors: string[];
  mappings: KnowledgeBaseMappingInput[];
  debugCases: string[];
}


export interface KeywordTargetStat {
  targetValue: string;
  count: number;
}

export interface KeywordStatSummary {
  keyword: string;
  keywordNormalized: string;
  attributeName: string;
  sourceName?: string;
  contextSignature?: string;
  validationCount: number;
  rejectionCount: number;
  sourceCount: number;
  confidenceScore: number;
  targetValueMostFrequent?: string;
  targets: KeywordTargetStat[];
  lastUsedAt?: string;
  reliability: 'high' | 'medium' | 'low' | 'context_required';
  reason: string;
}

export interface TrainingExampleInput {
  id?: string;
  sourceName?: string;
  attributeName: string;
  sourcePath?: string;
  sourceValue: string;
  sourceValueNormalized?: string;
  targetValue: string;
  family?: string;
  sport?: string;
  category?: string;
  brand?: string;
  gender?: string;
  matcherType?: MatcherType;
  confidenceScore?: number;
  status?: MappingStatus | 'draft';
  validationCount?: number;
  rejectionCount?: number;
  sourceCount?: number;
  reason?: string;
}

export interface AiSuggestBatchPayload {
  sourceName?: string;
  attributeName: string;
  sourcePath?: string;
  context?: {
    brand?: string;
    sport?: string;
    category?: string;
    family?: string;
    gender?: string;
  };
  values: string[];
}

export interface AiSuggestion {
  sourceValue: string;
  suggestedTarget: string;
  confidence: number;
  matcherType: 'semantic' | 'exact' | 'contains' | 'similarity';
  reason: string;
  nearestExamples: Array<{ sourceValue: string; targetValue: string; similarity: number }>;
  status?: 'draft';
}

export interface TrainingStats {
  total: number;
  bySource: Record<string, number>;
  byAttribute: Record<string, number>;
  bySport: Record<string, number>;
  byFamily: Record<string, number>;
  reliable: TrainingExampleInput[];
  rejected: TrainingExampleInput[];
}
