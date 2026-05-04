import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.2"

const gemini = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY") || "");
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    // Webhook payload from Supabase Database Trigger
    const payload = await req.json();
    const receipt = payload.record;

    if (!receipt || !receipt.id) {
      return new Response("No record found in webhook payload", { status: 400 });
    }

    const { vendor_name, total_amount, category, notes, transaction_date } = receipt;
    const textToEmbed = `Receipt from ${vendor_name} on ${transaction_date} for ${total_amount}. Category: ${category}. Notes: ${notes || ''}`;

    // Generate Embedding via Gemini
    const model = gemini.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(textToEmbed);
    const embedding = result.embedding.values;

    // Update the receipt record with the embedding
    const { error } = await supabase
      .from('receipts')
      .update({ semantic_embedding: embedding })
      .eq('id', receipt.id);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, id: receipt.id }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
})
