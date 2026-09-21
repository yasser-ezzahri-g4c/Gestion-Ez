-- DANGER: irreversible reset of every application data table.
-- Authentication accounts are intentionally handled through the Supabase Auth Admin API.
begin;

truncate table
  public.dossier_care_categories,
  public.care_actions,
  public.medical_dossiers,
  public.beneficiaries,
  public.doctors,
  public.care_categories,
  public.period_categories,
  public.purchases,
  public.monthly_budgets,
  public.weekly_budgets,
  public.categories,
  public.places,
  public.utility_elec_readings,
  public.utility_water_shares,
  public.utility_bills,
  public.utility_persons,
  public.wallet_movements,
  public.wallet_categories
restart identity cascade;

commit;
