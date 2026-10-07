alter table public.trades
add column if not exists source_key text;

create unique index if not exists uq_trades_source_key
on public.trades(source_key);

create index if not exists idx_trades_symbol_timeframe_signal_time
on public.trades(symbol, timeframe, signal_time desc);
