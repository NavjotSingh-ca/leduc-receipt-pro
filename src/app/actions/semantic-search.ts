'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

const apiKey = process.env.GOOGLE_AI_KEY;

export async function semanticSearchAction(query: string, userId?: string) {
  if (!apiKey) {
    throw new Error('Google AI Key is missing.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

  // Generate embedding for the query string
  const result = await model.embedContent(query);
  const embedding = result.embedding.values;

  // Search Supabase pgvector
  // We explicitly cast the number[] to the format Postgres expects for vector types, usually '[x,y,z]'
  const embeddingStr = `[${embedding.join(',')}]`;

  const { data, error } = await supabase.rpc('match_receipts', {
    query_embedding: embeddingStr,
    match_threshold: 0.6,
    match_count: 50,
    p_user_id: userId || null,
  });

  if (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  return data as Array<{ id: string; similarity: number }>;
}
