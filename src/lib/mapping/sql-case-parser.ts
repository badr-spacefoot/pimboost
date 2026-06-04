import type { KnowledgeBaseMappingInput, MappingCondition, MatcherType, SqlCaseParsePreview } from '@/lib/types/mapping';

const SQL_CASE_TOKENS = [/\bCASE\b/i, /\bWHEN\b/i, /\bTHEN\b/i, /\bELSE\b/i, /\bEND\b/i, /raw_data\s*->/i, /CONCAT\s*\(/i];
const KEYWORD_REGEX = /\b(CASE|WHEN|THEN|ELSE|END)\b/gi;

export function containsSqlCaseSyntax(input: string): boolean {
  return SQL_CASE_TOKENS.some((pattern) => pattern.test(input));
}

export function parseSqlCaseMappings(input: string, sourceName: string, attributeName: string): SqlCaseParsePreview {
  const mappings: KnowledgeBaseMappingInput[] = [];
  const debugCases: string[] = [];
  const errors: string[] = [];
  const keywords = collectKeywords(input);

  parseCaseBlock(input, keywords, 0, [[]], sourceName, attributeName, mappings, debugCases, errors);

  if (!mappings.length && !errors.length) errors.push('Aucun bloc WHEN ... THEN supporté détecté.');

  return {
    detected: mappings.length + debugCases.length + errors.length,
    valid: mappings.length,
    ignored: debugCases.length,
    errors,
    mappings,
    debugCases,
  };
}

export function conditionsToLabel(conditions: MappingCondition[] = []): string {
  return conditions.map((condition) => `${condition.sourcePath} ${condition.operator} ${condition.value}`).join(' AND ');
}

function parseCaseBlock(
  input: string,
  keywords: KeywordToken[],
  startIndex: number,
  parentGroups: MappingCondition[][],
  sourceName: string,
  attributeName: string,
  mappings: KnowledgeBaseMappingInput[],
  debugCases: string[],
  errors: string[],
): number {
  let index = startIndex;
  if (keywords[index]?.keyword === 'CASE') index += 1;

  while (index < keywords.length) {
    const token = keywords[index];
    if (token.keyword === 'END') return index + 1;
    if (token.keyword === 'ELSE') {
      const next = keywords[index + 1];
      const elseExpression = input.slice(token.end, next?.start ?? input.length).trim();
      if (/^CONCAT\s*\(/i.test(elseExpression)) debugCases.push(`ELSE ${elseExpression}`);
      index += 1;
      continue;
    }
    if (token.keyword !== 'WHEN') {
      index += 1;
      continue;
    }

    const thenToken = keywords[index + 1];
    if (!thenToken || thenToken.keyword !== 'THEN') {
      errors.push(`WHEN sans THEN : ${input.slice(token.end, keywords[index + 1]?.start ?? input.length).trim()}`);
      index += 1;
      continue;
    }

    const conditionText = input.slice(token.end, thenToken.start).trim();
    const conditionGroups = parseConditionGroups(conditionText);
    if (!conditionGroups.length) {
      errors.push(`Condition non supportée : ${conditionText}`);
      index += 2;
      continue;
    }

    const inheritedGroups = combineConditionGroups(parentGroups, conditionGroups);
    const afterThen = keywords[index + 2];
    const thenExpression = input.slice(thenToken.end, afterThen?.start ?? input.length).trim();

    if (afterThen?.keyword === 'CASE') {
      index = parseCaseBlock(input, keywords, index + 2, inheritedGroups, sourceName, attributeName, mappings, debugCases, errors);
      continue;
    }

    if (/^CONCAT\s*\(/i.test(thenExpression) || /^NULL$/i.test(thenExpression)) {
      debugCases.push(`WHEN ${conditionText} THEN ${thenExpression}`);
      index += 2;
      continue;
    }

    const targetMatch = thenExpression.match(/^('(?:''|[^'])*')/);
    if (!targetMatch) {
      errors.push(`THEN non supporté : ${thenExpression}`);
      index += 2;
      continue;
    }

    const targetValue = unquoteSqlString(targetMatch[1]);
    for (const conditions of inheritedGroups) mappings.push(toMapping(sourceName, attributeName, targetValue, conditions));
    index += 2;
  }

  return index;
}

function parseConditionGroups(conditionText: string): MappingCondition[][] {
  const andParts = splitTopLevelAnd(conditionText);
  let groups: MappingCondition[][] = [[]];
  for (const part of andParts) {
    const alternatives = parseSingleCondition(part.trim());
    if (!alternatives.length) return [];
    groups = combineConditionGroups(groups, alternatives.map((condition) => [condition]));
  }
  return groups;
}

function parseSingleCondition(condition: string): MappingCondition[] {
  const exactMatch = condition.match(/^([\s\S]+?)\s*=\s*('(?:''|[^'])*')\s*$/i);
  if (exactMatch) return [{ sourcePath: sqlJsonPathToDottedPath(exactMatch[1]), operator: '=', value: unquoteSqlString(exactMatch[2]) }];

  const inMatch = condition.match(/^([\s\S]+?)\s+IN\s*\(([\s\S]+)\)\s*$/i);
  if (inMatch) return splitSqlStringList(inMatch[2]).map((value) => ({ sourcePath: sqlJsonPathToDottedPath(inMatch[1]), operator: '=', value }));

  const regexMatch = condition.match(/^([\s\S]+?)\s*~\*\s*('(?:''|[^'])*')\s*$/i);
  if (regexMatch) return [{ sourcePath: sqlJsonPathToDottedPath(regexMatch[1]), operator: '~*', value: unquoteSqlString(regexMatch[2]) }];

  return [];
}

function toMapping(sourceName: string, attributeName: string, targetValue: string, conditions: MappingCondition[]): KnowledgeBaseMappingInput {
  const primary = conditions[conditions.length - 1];
  const matcherType: MatcherType = primary?.operator === '~*' ? 'regex' : 'exact';
  return {
    sourceName,
    attributeName,
    sourcePath: primary?.sourcePath,
    matcherType,
    sourceValue: conditionsToLabel(conditions),
    targetValue,
    conditions,
    ruleType: 'contextual',
    confidenceScore: 1,
    status: 'validated',
  };
}

function collectKeywords(input: string): KeywordToken[] {
  return Array.from(input.matchAll(KEYWORD_REGEX)).map((match) => ({ keyword: match[1].toUpperCase() as KeywordToken['keyword'], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
}

function splitTopLevelAnd(input: string): string[] {
  return input.split(/\s+AND\s+/i).map((part) => part.trim()).filter(Boolean);
}

function combineConditionGroups(left: MappingCondition[][], right: MappingCondition[][]): MappingCondition[][] {
  return left.flatMap((leftGroup) => right.map((rightGroup) => [...leftGroup, ...rightGroup]));
}

export function sqlJsonPathToDottedPath(expression: string): string {
  const cleanExpression = expression.trim();
  const root = cleanExpression.match(/^([a-zA-Z_][\w]*)/)?.[1] ?? 'raw_data';
  const tokens = Array.from(cleanExpression.matchAll(/->>?\s*(?:'([^']+)'|(\d+))/g)).map((match) => match[1] ?? match[2]);
  return tokens.reduce((path, token) => (/^\d+$/.test(token) ? `${path}[${token}]` : `${path}.${token}`), root);
}

function splitSqlStringList(input: string): string[] {
  return Array.from(input.matchAll(/'(?:''|[^'])*'/g)).map((match) => unquoteSqlString(match[0]));
}

function unquoteSqlString(input: string): string {
  const trimmed = input.trim();
  const withoutQuotes = trimmed.startsWith("'") && trimmed.endsWith("'") ? trimmed.slice(1, -1) : trimmed;
  return withoutQuotes.replace(/''/g, "'");
}

interface KeywordToken {
  keyword: 'CASE' | 'WHEN' | 'THEN' | 'ELSE' | 'END';
  start: number;
  end: number;
}
