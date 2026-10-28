-- =============================================================================
-- AhorRaso - Migración Incremental de Esquema Canónico PostgreSQL (Supabase)
-- Versión: 20261028010000_add_alerts_tables.sql
-- Módulos: alerts (RF-010 Configurar alertas y umbrales, RF-011 Recibir alertas, RNF-010 Anti-spam)
-- Políticas: RLS (Row Level Security) estricta por auth.uid() = user_id (RNF-005)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6. TABLA: notification_prefs (RF-010, RNF-010)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_prefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    thresholds JSONB NOT NULL DEFAULT '[50, 80, 100]'::jsonb,
    channel_in_app BOOLEAN NOT NULL DEFAULT TRUE,
    channel_push BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    client_updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_prefs_owner_all" ON public.notification_prefs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 7. TABLA: budget_alerts_history (RF-011, RNF-010: Historial y Anti-Spam)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_alerts_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    threshold_percent INT NOT NULL CHECK (threshold_percent > 0),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    spent_cents BIGINT NOT NULL,
    budget_amount_cents BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_budget_alerts_user_date 
    ON public.budget_alerts_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget 
    ON public.budget_alerts_history (budget_id);

-- Restricción de Unicidad Anti-Spam (RNF-010): Un umbral solo dispara 1 vez por periodo
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_alerts_history_unique 
    ON public.budget_alerts_history (user_id, budget_id, period_start, threshold_percent);

ALTER TABLE public.budget_alerts_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_alerts_history_owner_all" ON public.budget_alerts_history
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
