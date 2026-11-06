/**
 * The query pipeline: small stages from what the person typed to what the sources and the ranker
 * read. Each stage is a pure function.
 */

/** The query's words, lowercased, without numbers or punctuation. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word !== '' && !/^\d+$/.test(word));
}

/** What the ranker reads of a query. */
export type QueryIntent = {
  /** The words that name the thing. */
  subject: string[];
};

export function readIntent(query: string): QueryIntent {
  return {subject: words(query)};
}
