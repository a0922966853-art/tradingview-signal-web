alter table public.trades
add column if not exists external_trade_id bigint,
add column if not exists status_updated_at timestamptz,
add column if not exists hit_tp1 boolean not null default false,
add column if not exists hit_tp2 boolean not null default false,
add column if not exists hit_tp3 boolean not null default false;

create unique index if not exists uq_trades_symbol_timeframe_external_trade
on public.trades(symbol, timeframe, external_trade_id)
where external_trade_id is not null;
