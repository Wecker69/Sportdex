create or replace view public.oeffentliche_profile
as
with beste_leistungen as (
  select
    l.nutzer_id,
    l.disziplin_id,
    case max(case l.medaille
      when 'gold' then 4
      when 'silber' then 3
      when 'bronze' then 2
      when 'keine' then 1
      when 'unbewertet' then 1
      else 0
    end)
      when 4 then 'gold'
      when 3 then 'silber'
      when 2 then 'bronze'
      when 1 then 'keine'
      else 'offen'
    end as medaille
  from public.leistung l
  group by l.nutzer_id, l.disziplin_id
),
follow_counts as (
  select
    n.id,
    coalesce(count(distinct f_in.follower_id) filter (where f_in.status = 'angenommen'), 0)::integer as followers,
    coalesce(count(distinct f_out.gefolgter_id) filter (where f_out.status = 'angenommen'), 0)::integer as following
  from public.nutzer n
  left join public.follow f_in on f_in.gefolgter_id = n.id
  left join public.follow f_out on f_out.follower_id = n.id
  group by n.id
)
select
  n.id,
  n.nutzername,
  n.profilbild,
  n.rank,
  coalesce(count(distinct bl.disziplin_id), 0)::integer as dex,
  coalesce(count(distinct bl.disziplin_id) filter (where bl.medaille in ('bronze', 'silber', 'gold')), 0)::integer as bronze,
  coalesce(count(distinct bl.disziplin_id) filter (where bl.medaille in ('silber', 'gold')), 0)::integer as silver,
  coalesce(count(distinct bl.disziplin_id) filter (where bl.medaille = 'gold'), 0)::integer as gold,
  coalesce(fc.followers, 0)::integer as followers,
  coalesce(fc.following, 0)::integer as following
from public.nutzer n
left join beste_leistungen bl on bl.nutzer_id = n.id
left join follow_counts fc on fc.id = n.id
group by n.id, n.nutzername, n.profilbild, n.rank, fc.followers, fc.following;

grant select on public.oeffentliche_profile to anon, authenticated;
