# AhorRaso — Runbook de Operaciones

Guía operativa para mantener el MVP funcionando **las 24 horas con $0 USD**.
Complementa [`ARQUITECTURA_TECNICA.md` §5.4](./ARQUITECTURA_TECNICA.md).

| Área | Responsable | Frecuencia |
| :--- | :--- | :--- |
| Keep-alive y backups | Dev B | Automatizado |
| Dependencias y seguridad | Dev C | Semanal |
| Cuotas de IA y rendimiento | Dev C | Semanal |
| Incidentes | Rotativo | Bajo demanda |

---

## 1. Keep-alive de Supabase (obligatorio)

Los proyectos del plan Free se **pausan tras 7 días sin actividad**. Este workflow
evita la pausa con una consulta ligera cada 5 días.

```yaml
# .github/workflows/keep-alive.yml
name: Supabase keep-alive
on:
  schedule:
    - cron: "0 6 */5 * *"   # cada 5 días a las 06:00 UTC
  workflow_dispatch: {}

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Consulta ligera al proyecto
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          curl -fsS -o /dev/null -w "HTTP %{http_code}\n" \
            -H "apikey: $SUPABASE_ANON_KEY" \
            "$SUPABASE_URL/rest/v1/"
```

**Verificación manual:** si el proyecto aparece *Paused* en el dashboard, se
reactiva con un click (no se pierden datos), pero el keep-alive debe arreglarse
para que no vuelva a ocurrir.

---

## 2. Backup diario de la base de datos (RNF-012)

Supabase Free **no incluye backups automáticos**. Se hace `pg_dump` diario,
cifrado y con retención de 7 días.

```yaml
# .github/workflows/backup.yml
name: Backup Postgres
on:
  schedule:
    - cron: "0 3 * * *"      # diario 03:00 UTC
  workflow_dispatch: {}

jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - name: Dump
        env:
          DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}   # connection string (pooler)
        run: |
          supabase db dump --db-url "$DATABASE_URL" --file backup.sql
          gzip -9 backup.sql
          gpg --batch --yes --symmetric --cipher-algo AES256 \
              --passphrase "${{ secrets.BACKUP_PASSPHRASE }}" backup.sql.gz
      - uses: actions/upload-artifact@v4
        with:
          name: db-backup-${{ github.run_id }}
          path: backup.sql.gz.gpg
          retention-days: 7
```

> ⚠️ `SUPABASE_DB_URL` y `BACKUP_PASSPHRASE` viven en **GitHub Secrets**.
> El *passphrase* se guarda también en el gestor de contraseñas del equipo.

**Restauración probada (mensual, obligatorio):**

```bash
gpg -d backup.sql.gz.gpg | gunzip > restored.sql
psql "$DATABASE_URL_DEV" -f restored.sql   # o supabase db reset + restore
# Verificar: conteo de usuarios, 10 transacciones de muestra, RLS activa.
```

---

## 3. Migraciones y releases

| Paso | Comando | Quién |
| :--- | :--- | :--- |
| 1. Migración nueva | `supabase migration new <nombre>` | autor del PR |
| 2. Validar en local | `supabase db reset` + tests | autor |
| 3. Revisar diff | `supabase db diff` | reviewer |
| 4. Aplicar a prod | `supabase db push` (tras merge a `main`) | Dev B |
| 5. Rollback | `supabase migration repair` + migración correctora | Dev B |

**Reglas:**
- Una migración por PR; **nunca** editar una migración ya aplicada.
- Las migraciones destructivas requieren backup previo (§2) y ventana de mantenimiento.
- El schema se modifica solo con la CLI, nunca desde el dashboard en producción.

### Release de la app

```bash
# APK interno para QA (sin tienda)
eas build -p android --profile preview

# Producción
git tag v1.0.0 && git push --tags
eas build -p android --profile production
eas submit -p android            # a Play Console

# Hotfix solo-JS (sin re-build nativo)
eas update --branch production --message "fix: cálculo de saldo"
```

---

## 4. Secretos y rotación

| Secreto | Dónde vive | Rotación | ¿En el bundle de la app? |
| :--- | :--- | :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` (cliente) | al crear nuevo proyecto | Sí (pública por diseño; la protege RLS) |
| `SUPABASE_URL` | GitHub Secrets + `.env` | rara vez | Sí (pública) |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` | **Supabase Secrets** | cada 90 días o si se filtra | **Nunca** |
| `SERVICE_ROLE_KEY` | Solo Edge Functions | cada 90 días | **Nunca** |
| `SUPABASE_DB_URL` | GitHub Secrets | anual | **Nunca** |
| `BACKUP_PASSPHRASE` | Gestor de contraseñas | anual | **Nunca** |

```bash
# Rotar una clave de IA (30 segundos)
supabase secrets set GROQ_API_KEY=gsk_nuevo   # despliega al toque
# Luego revocar la anterior en la consola del proveedor
```

**Verificación de que no hay secretos en el cliente (corre en CI):**

```bash
# .github/workflows/ci.yml → job "secrets-audit"
! grep -rniE "gsk_|sk-proj-|SERVICE_ROLE|SUPABASE_DB_URL" apps/mobile/src \
  --include="*.ts" --include="*.tsx" --exclude-dir=__tests__
```

---

## 5. Monitoreo y alertas

| Qué | Herramienta | Umbral de alerta |
| :--- | :--- | :--- |
| Uptime del backend | UptimeRobot Free (5 min) | 1 fallo → email |
| Errores de la app | PostHog Error Tracking | > 50 excepciones/día o 1 error nuevo crítico |
| Rendimiento del dashboard | PostHog evento `time_to_dashboard_ms` | p90 > 3.000 ms (RNF-003) |
| Cuota de IA | Tabla `ai_usage` + vista PostHog | > 70 % de la cuota diaria |
| Uso de la DB | Supabase Dashboard → Usage | > 400 MB (80 % de 500 MB) |
| Egress | Supabase Dashboard → Usage | > 4 GB (80 % de 5 GB) |

---

## 6. Control de cuotas de IA

```sql
-- Uso de IA por usuario hoy (ejecutar en SQL Editor o desde la app admin)
select user_id, count(*) as llamadas
from ai_usage
where day = current_date
group by user_id
order by llamadas desc
limit 20;

-- Consumo total de la última semana
select day, sum(count) as llamadas_totales
from ai_usage
where day > current_date - 7
group by day
order by day;
```

**Acciones si se acerca el límite:**

1. Subir la duración del cache (`ai_cache.ttl`) de 7 a 14 días.
2. Reducir la cuota por usuario (parámetro en Edge Function).
3. Forzar el *fallback determinista* (deshabilitar LLM por 24 h con feature flag).
4. Verificar límites actuales en las consolas de Groq/Gemini/OpenRouter antes de cambiar de proveedor.

---

## 7. Checklist de incidentes

| # | Paso | Tiempo objetivo |
| :-- | :--- | :--- |
| 1 | Confirmar el alcance (¿app caída? ¿datos? ¿solo IA?) | 5 min |
| 2 | Publicar **modo degradado**: la app debe seguir funcionando offline con SQLite | 15 min |
| 3 | Si Supabase está *Paused* → reactivar y revisar keep-alive | 5 min |
| 4 | Si un Edge Function falla → revisar logs (`supabase functions logs <fn>`) | 10 min |
| 5 | Si la IA agotó cuota → activar fallback determinista | 2 min |
| 6 | Comunicar al equipo (issue con etiqueta `incident`) y a usuarios si aplica | 15 min |
| 7 | Post-mortem en `docs/` con causa raíz y acción preventiva | 48 h |

---

## 8. Verificación semanal (10 minutos)

- [ ] `npm audit` / Dependabot: sin vulnerabilidades críticas.
- [ ] Backup del último día existe y **se restauró en dev** al menos una vez al mes.
- [ ] Keep-alive corrió (Actions → *Supabase keep-alive* → último estado ✅).
- [ ] Supabase → Usage: DB < 400 MB, egress < 4 GB.
- [ ] `ai_usage`: consumo < 70 % de la cuota diaria.
- [ ] PostHog: p90 de `time_to_dashboard_ms` < 3.000 ms.
- [ ] Builds: quedan builds de EAS disponibles este mes (Free: 15 + 15).
