import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let query = supabase
    .from('trades')
    .select('*')
    .order('signal_time', { ascending: false })
    .limit(1000);

  if (req.query.symbol) {
    query = query.eq('symbol', String(req.query.symbol).toUpperCase());
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ trades: data || [] });
}
