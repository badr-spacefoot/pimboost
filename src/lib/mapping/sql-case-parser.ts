import type { KnowledgeBaseMappingInput, MatcherType, SqlCaseParsePreview } from '@/lib/types/mapping';

const SQL_CASE_TOKENS = [/\bCASE\b/i, /\bWHEN\b/i, /\bTHEN\b/i, /\bELSE\b/i, /\bEND\b/i, /raw_data\s*->/i, /CONCAT\s*\(/i];

export function containsSqlCaseSyntax(input: string): boolean {
  return SQL_CASE_TOKENS.some((pattern) => pattern.test(input));
}

export function parseSqlCaseMappings(input: string, sourceName: string, attributeName: string): SqlCaseParsePreview {
  const mappings: KnowledgeBaseMappingInput[] = [];
  const ignored: string[] = [];
  const errors: string[] = [];
  const whenThenRegex = /WHEN\s+([\s\S]*?)\s+THEN\s+('(?:''|[^'])*'|CONCAT\s*\([\s\S]*?\)|NULL)/gi;
  const matches = Array.from(input.matchAll(whenThenRegex));

  for (const match of matches) {
    const condition = match[1].trim();
    const thenExpression = match[2].trim();
    if (/^CONCAT\s*\(/i.test(thenExpression) || /^NULL$/i.test(thenExpression)) {
      ignored.push(`WHEN ${condition} THEN ${thenExpression}`);
      continue;
    }

    const targetValue = unquoteSqlString(thenExpression);
    const parsedCondition = parseSqlCondition(condition);
    if (!parsedCondition) {
      errors.push(`Condition non supportée : ${condition}`);
      continue;
    }

    for (const sourceValue of parsedCondition.sourceValues) {
      mappings.push({
        sourceName,
        attributeName,
        sourcePath: parsedCondition.sourcePath,
        matcherType: parsedCondition.matcherType,
        sourceValue,
        targetValue,
        confidenceScore: 1,
        status: 'validated',
      });
    }
  }

  const elseConcatMatches = input.match(/ELSE\s+CONCAT\s*\([\s\S]*?\)/gi) ?? [];
  ignored.push(...elseConcatMatches);

  if (!matches.length) errors.push('Aucun bloc WHEN ... THEN supporté détecté.');

  return {
    detected: matches.length,
    valid: mappings.length,
    ignored: ignored.length,
    errors,
    mappings,
    debugCases: ignored,
  };
}

function parseSqlCondition(condition: string): { sourcePath: string; matcherType: MatcherType; sourceValues: string[] } | undefined {
  const exactMatch = condition.match(/^([\s\S]+?)\s*=\s*('(?:''|[^'])*')\s*$/i);
  if (exactMatch) return { sourcePath: sqlJsonPathToDottedPath(exactMatch[1]), matcherType: 'exact', sourceValues: [unquoteSqlString(exactMatch[2])] };

  const inMatch = condition.match(/^([\s\S]+?)\s+IN\s*\(([\s\S]+)\)\s*$/i);
  if (inMatch) return { sourcePath: sqlJsonPathToDottedPath(inMatch[1]), matcherType: 'exact', sourceValues: splitSqlStringList(inMatch[2]) };

  const regexMatch = condition.match(/^([\s\S]+?)\s*~\*\s*('(?:''|[^'])*')\s*$/i);
  if (regexMatch) return { sourcePath: sqlJsonPathToDottedPath(regexMatch[1]), matcherType: 'regex', sourceValues: [unquoteSqlString(regexMatch[2])] };

  return undefined;
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
