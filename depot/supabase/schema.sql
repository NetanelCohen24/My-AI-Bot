-- Depot · Supabase schema
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- Access model: every signed-in user of your company can read & write everything.
-- (Create users in Authentication → Users, and turn OFF public sign-ups.)

create table if not exists suppliers (
  id text primary key, created_at timestamptz default now(),
  name text not null, phone text, email text, lead_days int default 3, active boolean default true
);

create table if not exists customers (
  id text primary key, created_at timestamptz default now(),
  code text, name text not null, chain text, city text, region text, phone text, address text, active boolean default true
);

create table if not exists products (
  id text primary key, created_at timestamptz default now(),
  sku text unique not null, barcode text, name text not null, category text, unit text,
  cost numeric default 0, price numeric default 0, min_qty numeric default 0, reorder_qty numeric default 0,
  supplier_id text references suppliers(id) on delete set null,
  track_expiry boolean default false, shelf_days int, active boolean default true
);

create table if not exists lots (
  id text primary key, created_at timestamptz default now(),
  product_id text not null references products(id) on delete restrict,
  lot_no text not null, expiry date, received_at timestamptz default now(),
  unique (product_id, lot_no)
);

create table if not exists movements (
  id text primary key, created_at timestamptz default now(),
  ts timestamptz not null default now(),
  type text not null check (type in ('receipt','shipment','return','count','adjust','writeoff','opening')),
  product_id text not null references products(id) on delete restrict,
  lot_id text references lots(id) on delete restrict,
  qty numeric not null, ref_type text, ref_id text, note text, user_email text
);
create index if not exists movements_product_idx on movements(product_id);
create index if not exists movements_ts_idx on movements(ts);

create table if not exists orders (
  id text primary key, created_at timestamptz default now(),
  number text unique not null, customer_id text references customers(id) on delete restrict,
  status text not null default 'confirmed' check (status in ('draft','confirmed','picking','shipped','cancelled')),
  due_date date, note text, shipped_at timestamptz, user_email text
);

create table if not exists order_lines (
  id text primary key, created_at timestamptz default now(),
  order_id text not null references orders(id) on delete cascade,
  product_id text not null references products(id) on delete restrict,
  qty numeric not null, price numeric default 0
);

create table if not exists purchase_orders (
  id text primary key, created_at timestamptz default now(),
  number text unique not null, supplier_id text references suppliers(id) on delete restrict,
  status text not null default 'sent' check (status in ('draft','sent','received','cancelled')),
  note text, received_at timestamptz, user_email text
);

create table if not exists po_lines (
  id text primary key, created_at timestamptz default now(),
  po_id text not null references purchase_orders(id) on delete cascade,
  product_id text not null references products(id) on delete restrict,
  qty numeric not null, received_qty numeric default 0, cost numeric default 0
);

-- Movements are an audit trail: no updates or deletes, even by signed-in users.
do $$
declare t text;
begin
  foreach t in array array['suppliers','customers','products','lots','movements','orders','order_lines','purchase_orders','po_lines'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "team read" on %I', t);
    execute format('create policy "team read" on %I for select to authenticated using (true)', t);
    execute format('drop policy if exists "team insert" on %I', t);
    execute format('create policy "team insert" on %I for insert to authenticated with check (true)', t);
    if t <> 'movements' then
      execute format('drop policy if exists "team update" on %I', t);
      execute format('create policy "team update" on %I for update to authenticated using (true) with check (true)', t);
      execute format('drop policy if exists "team delete" on %I', t);
      execute format('create policy "team delete" on %I for delete to authenticated using (true)', t);
    end if;
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
