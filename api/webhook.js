import { createClient } from '@supabase/supabase-js';

function normalizeDirection(v) {
  const s = String(v || '').toUpperCase();
  if (s === 'LONG') return 'BUY';
  if (s === 'SHORT') return 'SELL';
  return s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const direction = normalizeDirection(body.direction);

  if (!body.symbol || !['BUY','SELL'].includes(direction)) {
    return res.status(400).json({ error: 'symbol and direction are required' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const trade = {
    signal_time: body.signal_time || new Date().toISOString(),
    symbol: String(body.symbol).toUpperCase(),
    timeframe: String(body.timeframe || '5'),
    direction,
    mode: body.mode != null ? String(body.mode) : null,
    entry: body.entry ?? null,
    sl: body.sl ?? null,
    tp1: body.tp1 ?? null,
    tp2: body.tp2 ?? null,
    tp3: body.tp3 ?? null,
    quality: body.quality ?? null,
    result: body.result || 'OPEN',
    exit_price: body.exit_price ?? null,
    source: 'TradingView',
    raw: body
  };

  const { data, error } = await supabase
    .from('trades')
    .insert(trade)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, trade: data });
}
