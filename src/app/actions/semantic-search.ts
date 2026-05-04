'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const apiKey = process.env.GOOGLE_AI_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function semanticSearchAction(query: string) {
  if (!apiKey) {
    throw new Error('Google AI Key is missing.');
  }

  // Get authenticated user from cookies
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {}, // Server actions can't set cookies
    },
  });

  const { data: authData } = await supabase.auth.getUser(); // ← NOW WORKS
  const userId = authData?.user?.id || null;

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
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  return data as Array<{ id: string; similarity: number }>;
}
