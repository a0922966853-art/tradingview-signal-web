import { createClient } from '@supabase/supabase-js';

function normalizeDirection(v) {
  const s = String(v || '').toUpperCase();
  if (s === 'LONG') return 'BUY';
  if (s === 'SHORT') return 'SELL';
  return s;
}

function supabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
  const event = String(body.event || 'formal_trade');
  const supabase = supabaseClient();

  // ---------------- New formal trade ----------------
  if (event === 'formal_trade') {
    const direction = normalizeDirection(body.direction);
    if (!body.symbol || !['BUY','SELL'].includes(direction)) {
      return res.status(400).json({ error: 'symbol and direction are required' });
    }

    const trade = {
      signal_time: body.signal_time || new Date().toISOString(),
      symbol: String(body.symbol).toUpperCase(),
      timeframe: String(body.timeframe || '5'),
      external_trade_id: body.trade_id ?? null,
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
      hit_tp1: !!body.hit_tp1,
      hit_tp2: !!body.hit_tp2,
      hit_tp3: !!body.hit_tp3,
      status_updated_at: new Date().toISOString(),
      source: 'TradingView',
      raw: body
    };

    // If TradingView re-sends the same formal trade, update instead of duplicate.
    if (trade.external_trade_id != null) {
      const { data: existing } = await supabase
        .from('trades')
        .select('id')
        .eq('symbol', trade.symbol)
        .eq('timeframe', trade.timeframe)
        .eq('external_trade_id', trade.external_trade_id)
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from('trades')
          .update(trade)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ ok: true, action: 'updated_existing', trade: data });
      }
    }

    const { data, error } = await supabase
      .from('trades')
      .insert(trade)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, action: 'inserted', trade: data });
  }

  // ---------------- Trade status update ----------------
  if (event === 'trade_update') {
    if (!body.symbol || body.trade_id == null) {
      return res.status(400).json({ error: 'symbol and trade_id are required for trade_update' });
    }

    const symbol = String(body.symbol).toUpperCase();
    const timeframe = String(body.timeframe || '5');

    const patch = {
      status_updated_at: new Date().toISOString(),
      raw: body
    };

    if (body.result != null) patch.result = String(body.result).toUpperCase();
    if (body.exit_price != null) patch.exit_price = body.exit_price;
    if (body.hit_tp1 != null) patch.hit_tp1 = !!body.hit_tp1;
    if (body.hit_tp2 != null) patch.hit_tp2 = !!body.hit_tp2;
    if (body.hit_tp3 != null) patch.hit_tp3 = !!body.hit_tp3;

    const { data, error } = await supabase
      .from('trades')
      .update(patch)
      .eq('symbol', symbol)
      .eq('timeframe', timeframe)
      .eq('external_trade_id', body.trade_id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data?.length) return res.status(404).json({ error: 'trade not found' });

    return res.status(200).json({ ok: true, action: 'trade_updated', trade: data[0] });
  }

  return res.status(400).json({ error: 'Unsupported event' });
}
