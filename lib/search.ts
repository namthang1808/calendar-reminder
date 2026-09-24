/**
 * Escapes Postgres LIKE/ILIKE wildcard characters in a user-supplied search
 * term before it's wrapped in `%...%`. Used with `.ilike(column, pattern)`
 * calls (never `.or()` string-built filters) so user input can never inject
 * PostgREST filter syntax -- `.ilike()` passes the pattern as a bound query
 * parameter, not a concatenated filter expression.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function toIlikePattern(term: string): string {
  return `%${escapeLikePattern(term)}%`;
}
