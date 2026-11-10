-- Order management is independent of stock and marketplace sales imports.
CREATE TABLE shipping_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, name text NOT NULL,
 created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX shipping_product_code ON shipping_products(lower(code));
CREATE TABLE shipping_skus (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES shipping_products,
 code text NOT NULL, name text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX shipping_sku_code ON shipping_skus(lower(code));
CREATE TABLE order_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), filename text NOT NULL,
 uploaded_by uuid NOT NULL REFERENCES users, uploaded_at timestamptz NOT NULL DEFAULT now(),
 headers jsonb NOT NULL, source_rows jsonb NOT NULL,
 preview jsonb, preview_token text, mapping jsonb,
 status text NOT NULL DEFAULT 'UPLOADED' CHECK(status IN ('UPLOADED','PREVIEWED','COMMITTED')),
 order_count integer NOT NULL DEFAULT 0, committed_at timestamptz
);
CREATE TABLE shipping_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_code text NOT NULL,
 carrier text NOT NULL DEFAULT 'SPX', tracking_number text,
 kind text NOT NULL CHECK(kind IN ('CUSTOMER','KOC')),
 recipient_name text NOT NULL, phone text NOT NULL, city text NOT NULL, ward text NOT NULL, address text NOT NULL,
 status text NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERY_FAILED','DELIVERED','RETURNING','RETURNED','CANCELLED')),
 shipping_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK(shipping_cost>=0),
 revenue numeric(18,2) NOT NULL DEFAULT 0 CHECK(revenue>=0 AND (kind='CUSTOMER' OR revenue=0)),
 order_date date NOT NULL, shipped_on date, delivered_on date, collected_on date,
 video_url text NOT NULL DEFAULT '', video_published_on date,
 note text NOT NULL DEFAULT '', responsible_id uuid NOT NULL REFERENCES users,
 created_by uuid NOT NULL REFERENCES users, import_id uuid REFERENCES order_imports,
 last_import_id uuid REFERENCES order_imports, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 CHECK(delivered_on IS NULL OR delivered_on>=order_date),
 CHECK(shipped_on IS NULL OR shipped_on>=order_date),
 CHECK(delivered_on IS NULL OR shipped_on IS NULL OR delivered_on>=shipped_on),
 CHECK(status<>'DELIVERED' OR delivered_on IS NOT NULL),
 CHECK((video_url='' AND video_published_on IS NULL) OR (kind='KOC' AND video_url<>'' AND video_published_on IS NOT NULL))
);
CREATE UNIQUE INDEX shipping_order_code ON shipping_orders(lower(carrier),lower(order_code));
CREATE UNIQUE INDEX shipping_tracking ON shipping_orders(lower(carrier),lower(tracking_number)) WHERE tracking_number IS NOT NULL;
CREATE INDEX shipping_order_date ON shipping_orders(order_date);
CREATE INDEX shipping_collected_on ON shipping_orders(collected_on);
CREATE INDEX shipping_koc_due ON shipping_orders(delivered_on) WHERE kind='KOC' AND status='DELIVERED' AND video_url='';
CREATE TABLE shipping_order_items (
 order_id uuid NOT NULL REFERENCES shipping_orders ON DELETE CASCADE,
 sku_id uuid NOT NULL REFERENCES shipping_skus, quantity integer NOT NULL CHECK(quantity>0 AND quantity<=1000000),
 PRIMARY KEY(order_id,sku_id)
);
CREATE TABLE shipping_order_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES shipping_orders,
 actor_id uuid NOT NULL REFERENCES users, event_type text NOT NULL,
 before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
