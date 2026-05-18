-- Run this in Supabase Dashboard → SQL Editor
-- Drops and recreates both product tables with proper text primary keys

-- ─── L'Oréal Professionnel ────────────────────────────────────────────────────
drop table if exists loreal_products cascade;

create table loreal_products (
  id            text primary key,          -- ean or slug
  name          text not null,
  brand         text,
  product_code  text,
  ean           text,
  aki_code      text,
  price         numeric(10,2),
  photo         text,
  url           text,
  sub_category  text,
  uom           text default 'EA',
  updated_at    timestamptz default now()
);

create index loreal_products_brand        on loreal_products(brand);
create index loreal_products_ean          on loreal_products(ean);
create index loreal_products_sub_category on loreal_products(sub_category);

alter table loreal_products enable row level security;
create policy "Public read" on loreal_products for select using (true);
create policy "Service write" on loreal_products for all using (auth.role() = 'service_role');

-- ─── Nazih Group ──────────────────────────────────────────────────────────────
drop table if exists nazih_products cascade;

create table nazih_products (
  id            text primary key,          -- url slug
  name          text not null,
  brand         text,
  ean           text,
  sku           text,
  price         numeric(10,2),
  photo         text,
  url           text,
  category      text,
  sub_category  text,
  updated_at    timestamptz default now()
);

create index nazih_products_brand        on nazih_products(brand);
create index nazih_products_ean          on nazih_products(ean);
create index nazih_products_sku          on nazih_products(sku);
create index nazih_products_category     on nazih_products(category);
create index nazih_products_sub_category on nazih_products(sub_category);

alter table nazih_products enable row level security;
create policy "Public read" on nazih_products for select using (true);
create policy "Service write" on nazih_products for all using (auth.role() = 'service_role');

-- ─── Wella Professionals ──────────────────────────────────────────────────────
drop table if exists wella_products cascade;

create table wella_products (
  id            text primary key,          -- product slug
  slug          text,
  name          text not null,
  brand         text default 'Wella Professionals',
  sku           text,
  ean           text,
  price         numeric(10,2),
  photo         text,
  images        jsonb,
  description   text,
  category      text,
  sub_category  text,
  size          text,
  url           text,
  updated_at    timestamptz default now()
);

create index wella_products_category     on wella_products(category);
create index wella_products_sub_category on wella_products(sub_category);
create index wella_products_sku          on wella_products(sku);

alter table wella_products enable row level security;
create policy "Public read wella_products" on wella_products for select using (true);
create policy "Service write wella_products" on wella_products for all using (auth.role() = 'service_role');

-- ─── Skeyndor ─────────────────────────────────────────────────────────────────
drop table if exists skeyndor_products cascade;
create table skeyndor_products (
  id            text primary key,
  name          text not null,
  brand         text default 'Skeyndor',
  ean           text,
  sku           text,
  price         numeric(10,2),
  currency      text default 'EUR',
  photo         text,
  images        jsonb,
  description   text,
  category      text,
  sub_category  text,
  url           text,
  updated_at    timestamptz default now()
);
create index skeyndor_products_category on skeyndor_products(category);
create index skeyndor_products_ean      on skeyndor_products(ean);
alter table skeyndor_products enable row level security;
create policy "Public read skeyndor_products" on skeyndor_products for select using (true);
create policy "Service write skeyndor_products" on skeyndor_products for all using (auth.role() = 'service_role');

-- ─── Victoria Vynn ────────────────────────────────────────────────────────────
drop table if exists victoriavynn_products cascade;
create table victoriavynn_products (
  id            text primary key,
  name          text not null,
  brand         text default 'Victoria Vynn',
  sku           text,
  ean           text,
  color         text,
  price         numeric(10,2),
  currency      text default 'PLN',
  photo         text,
  images        jsonb,
  description   text,
  category      text,
  url           text,
  updated_at    timestamptz default now()
);
create index victoriavynn_products_category on victoriavynn_products(category);
create index victoriavynn_products_sku      on victoriavynn_products(sku);
alter table victoriavynn_products enable row level security;
create policy "Public read victoriavynn_products" on victoriavynn_products for select using (true);
create policy "Service write victoriavynn_products" on victoriavynn_products for all using (auth.role() = 'service_role');

-- ─── Madi International ───────────────────────────────────────────────────────
drop table if exists madi_products cascade;
create table madi_products (
  id            text primary key,
  name          text not null,
  brand         text,
  sku           text,
  ean           text,
  price         numeric(10,2),
  photo         text,
  images        jsonb,
  description   text,
  category      text,
  sub_category  text,
  sub_family    text,
  color_code    text,
  color_name    text,
  url           text,
  updated_at    timestamptz default now()
);
create index madi_products_brand    on madi_products(brand);
create index madi_products_ean      on madi_products(ean);
create index madi_products_sku      on madi_products(sku);
create index madi_products_category on madi_products(category);
alter table madi_products enable row level security;
create policy "Public read madi_products"   on madi_products for select using (true);
create policy "Service write madi_products" on madi_products for all using (auth.role() = 'service_role');

-- ── Milia Cosmetics ────────────────────────────────────────────────────────────
drop table if exists milia_products cascade;
create table milia_products (
  id           text primary key,
  product_id   text,
  name         text not null,
  brand        text,
  sku          text,
  ean          text,
  price        numeric(10,2),
  currency     text default 'AED',
  photo        text,
  images       text,   -- JSON array
  description  text,
  category     text,
  tags         text,   -- JSON array
  available    boolean default true,
  url          text,
  created_at   timestamptz default now()
);
create index milia_products_brand    on milia_products(brand);
create index milia_products_sku      on milia_products(sku);
create index milia_products_category on milia_products(category);
alter table milia_products enable row level security;
create policy "Public read milia_products"   on milia_products for select using (true);
create policy "Service write milia_products" on milia_products for all using (auth.role() = 'service_role');
