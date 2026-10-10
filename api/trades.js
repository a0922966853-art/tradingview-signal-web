import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const symbol = req.query.symbol
    ? String(req.query.symbol).toUpperCase()
    : null;

  const timeframe = req.query.timeframe
    ? String(req.query.timeframe)
    : null;

  // Supabase 單次可能只回傳 500 筆，
  // 所以這裡改成每次抓 500 筆，直到抓完。
  const BATCH_SIZE = 500;
  const MAX_ROWS = 5000;

  let from = 0;
  let allTrades = [];

  while (from < MAX_ROWS) {
    let query = supabase
      .from('trades')
      .select('*')
      .order('signal_time', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + BATCH_SIZE - 1);

    if (symbol) {
      query = query.eq('symbol', symbol);
    }

    if (timeframe) {
      query = query.eq('timeframe', timeframe);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({
        error: error.message
      });
    }

    const batch = data || [];

    allTrades.push(...batch);

    // 少於 500 筆代表已經抓到底
    if (batch.length < BATCH_SIZE) {
      break;
    }

    from += BATCH_SIZE;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  return res.status(200).json({
    trades: allTrades,
    count: allTrades.length
  });
}
