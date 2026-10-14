-- =============================================================================
-- AhorRaso - Migración Inicial de Esquema Canónico PostgreSQL (Supabase)
-- Versión: 20261013000000_init_schema.sql
-- Módulos: profile, categories, merchants, transactions (RF-001, RF-002, RF-004, RF-005)
-- Políticas: RLS (Row Level Security) estricta por auth.uid() = user_id (RNF-005)
-- =============================================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. TABLA: profile
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    currency TEXT NOT NULL DEFAULT 'PEN',
    locale TEXT NOT NULL DEFAULT 'es-PE',
    timezone TEXT NOT NULL DEFAULT 'America/Lima',
    initial_balance_cents BIGINT NOT NULL DEFAULT 0,
    onboarding_done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ
);

ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_owner_all" ON public.profile
    FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 2. TABLA: categories (RF-004, RF-005)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(40) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    icon TEXT NOT NULL,
    color VARCHAR(7) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_categories_user_type ON public.categories (user_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_name 
    ON public.categories (user_id, type, lower(trim(name))) 
    WHERE deleted_at IS NULL;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_owner_all" ON public.categories
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. TABLA: merchants
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    default_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_merchants_user ON public.merchants (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_unique_name 
    ON public.merchants (user_id, lower(trim(name))) 
    WHERE deleted_at IS NULL;

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchants_owner_all" ON public.merchants
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. TABLA: transactions (RF-001 Registrar Ingresos, RF-002 Registrar Gastos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    occurred_on DATE NOT NULL,
    category_id UUID NOT NULL REFERENCES public.categories(id),
    merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
    payment_method TEXT CHECK (payment_method IN ('cash', 'digital')),
    source VARCHAR(100),
    note VARCHAR(200),
    entry_method TEXT NOT NULL DEFAULT 'manual' CHECK (entry_method IN ('manual', 'voice')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    -- Reglas de integridad de negocio para gastos e ingresos:
    CONSTRAINT check_expense_payment_method CHECK (type != 'expense' OR payment_method IS NOT NULL),
    CONSTRAINT check_income_source CHECK (type != 'income' OR source IS NOT NULL)
);

-- Índices para optimizar rendimiento de lectura (< 3 s RNF-003) y sincronización
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON public.transactions (user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON public.transactions (user_id, category_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_merchant ON public.transactions (user_id, merchant_id);
CREATE INDEX IF NOT EXISTS idx_tx_updated ON public.transactions (user_id, updated_at);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_owner_all" ON public.transactions
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
