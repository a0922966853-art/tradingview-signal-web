import { createClient } from '@supabase/supabase-js';

function normalizeDirection(v) {
  const s = String(v || '').toUpperCase();
  if (s === 'LONG') return 'BUY';
  if (s === 'SHORT') return 'SELL';
  return s;
}

function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function isoFromBody(body) {
  if (body.signal_time_ms != null) {
    const n = Number(body.signal_time_ms);
    if (Number.isFinite(n)) return new Date(n).toISOString();
  }
  if (body.signal_time) return new Date(body.signal_time).toISOString();
  return new Date().toISOString();
}

function sourceKey(body) {
  const symbol = String(body.symbol || '').toUpperCase();
  const timeframe = String(body.timeframe || '5');
  const direction = normalizeDirection(body.direction);
  const mode = String(body.mode ?? '');
  const signalMs = body.signal_time_ms != null
    ? String(body.signal_time_ms)
    : String(new Date(body.signal_time || 0).getTime());
  const entry = body.entry == null ? '' : Number(body.entry).toFixed(5);
  return [symbol,timeframe,signalMs,direction,mode,entry].join('|');
}

function mapTrade(body, source='TradingView') {
  return {
    signal_time: isoFromBody(body),
    symbol: String(body.symbol || '').toUpperCase(),
    timeframe: String(body.timeframe || '5'),
    external_trade_id: body.trade_id ?? null,
    source_key: sourceKey(body),
    direction: normalizeDirection(body.direction),
    mode: body.mode != null ? String(body.mode) : null,
    entry: body.entry ?? null,
    sl: body.sl ?? null,
    tp1: body.tp1 ?? null,
    tp2: body.tp2 ?? null,
    tp3: body.tp3 ?? null,
    quality: body.quality ?? null,
    result: String(body.result || 'OPEN').toUpperCase(),
    exit_price: body.exit_price ?? null,
    hit_tp1: !!body.hit_tp1,
    hit_tp2: !!body.hit_tp2,
    hit_tp3: !!body.hit_tp3,
    status_updated_at: new Date().toISOString(),
    source,
    raw: body
  };
}

async function upsertOne(supabase, trade) {
  // Adopt a clearly matching pre-v4 row first, avoiding duplicates.
  const { data: legacy } = await supabase
    .from('trades')
    .select('id')
    .eq('symbol', trade.symbol)
    .eq('timeframe', trade.timeframe)
    .eq('direction', trade.direction)
    .eq('mode', trade.mode)
    .eq('entry', trade.entry)
    .eq('sl', trade.sl)
    .eq('tp1', trade.tp1)
    .is('source_key', null)
    .limit(1);

  if (legacy?.length) {
    const { data, error } = await supabase
      .from('trades')
      .update(trade)
      .eq('id', legacy[0].id)
      .select()
      .single();
    if (error) throw error;
    return { action:'adopted_legacy', trade:data };
  }

  const { data, error } = await supabase
    .from('trades')
    .upsert(trade, { onConflict:'source_key' })
    .select()
    .single();

  if (error) throw error;
  return { action:'upserted', trade:data };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error:'Unauthorized' });
  }

  const body = req.body || {};
  const event = String(body.event || 'formal_trade');
  const supabase = db();

  try {
    if (event === 'formal_trade') {
      const direction = normalizeDirection(body.direction);
      if (!body.symbol || !['BUY','SELL'].includes(direction)) {
        return res.status(400).json({ error:'symbol and direction are required' });
      }
      const result = await upsertOne(supabase, mapTrade(body));
      return res.status(200).json({ ok:true, ...result });
    }

    if (event === 'history_backfill') {
      const trades = Array.isArray(body.trades) ? body.trades : [];
      if (!body.symbol || !trades.length) {
        return res.status(400).json({ error:'symbol and trades are required' });
      }

      let saved = 0;
      for (const item of trades) {
        const merged = {
          ...item,
          symbol: item.symbol || body.symbol,
          timeframe: item.timeframe || body.timeframe || '5'
        };
        const direction = normalizeDirection(merged.direction);
        if (!['BUY','SELL'].includes(direction)) continue;
        await upsertOne(supabase, mapTrade(merged, 'TradingView歷史補傳'));
        saved++;
      }
      return res.status(200).json({ ok:true, action:'history_backfill', saved });
    }

    if (event === 'trade_update') {
      if (!body.symbol) return res.status(400).json({ error:'symbol is required for trade_update' });

      const patch = {
        ...(body.result != null ? { result:String(body.result).toUpperCase() } : {}),
        ...(body.exit_price != null ? { exit_price:body.exit_price } : {}),
        ...(body.hit_tp1 != null ? { hit_tp1:!!body.hit_tp1 } : {}),
        ...(body.hit_tp2 != null ? { hit_tp2:!!body.hit_tp2 } : {}),
        ...(body.hit_tp3 != null ? { hit_tp3:!!body.hit_tp3 } : {}),
        status_updated_at:new Date().toISOString(),
        raw:body
      };

      let query = supabase.from('trades').update(patch);

      if (body.signal_time_ms != null && body.direction && body.mode != null && body.entry != null) {
        query = query.eq('source_key', sourceKey(body));
      } else if (body.trade_id != null) {
        query = query
          .eq('symbol', String(body.symbol).toUpperCase())
          .eq('timeframe', String(body.timeframe || '5'))
          .eq('external_trade_id', body.trade_id);
      } else {
        return res.status(400).json({ error:'trade_update needs source fields or trade_id' });
      }

      const { data, error } = await query.select();
      if (error) throw error;
      if (!data?.length) return res.status(404).json({ error:'trade not found' });
      return res.status(200).json({ ok:true, action:'trade_updated', trade:data[0] });
    }

    return res.status(400).json({ error:'Unsupported event' });
  } catch (error) {
    return res.status(500).json({ error:error.message });
  }
}
