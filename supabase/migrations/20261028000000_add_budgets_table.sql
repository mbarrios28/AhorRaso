-- =============================================================================
-- AhorRaso - Migración Incremental de Esquema Canónico PostgreSQL (Supabase)
-- Versión: 20261028000000_add_budgets_table.sql
-- Módulos: budgets (RF-006 Establecer presupuesto por categoría, RNF-009 Confiabilidad)
-- Políticas: RLS (Row Level Security) estricta por auth.uid() = user_id (RNF-005)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5. TABLA: budgets (RF-006, RNF-009)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'biweekly', 'monthly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT check_budget_period_dates CHECK (period_end >= period_start)
);

-- Índices para optimizar rendimiento de lectura (< 3 s RNF-003) y sincronización
CREATE INDEX IF NOT EXISTS idx_budgets_user_period ON public.budgets (user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_user_category ON public.budgets (user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_updated ON public.budgets (user_id, updated_at);

-- Restricción de Unicidad estricta para evitar duplicados en el mismo periodo (RNF-009)
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique_period 
    ON public.budgets (user_id, category_id, period_start, period_type) 
    WHERE deleted_at IS NULL;

-- Seguridad a nivel de fila (RNF-005)
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budgets_owner_all" ON public.budgets
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
