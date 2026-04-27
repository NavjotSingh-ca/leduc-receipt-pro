'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const apiKey = process.env.GOOGLE_AI_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function semanticSearchAction(query: string, accessToken?: string, userId?: string) {
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

  // Use authenticated client if token is provided
  const client = accessToken
    ? createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      })
    : supabase;

  const { data, error } = await client.rpc('match_receipts', {
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
