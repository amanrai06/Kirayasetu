-- =============================================================
--  KirayaSetu — database setup (Supabase SQL Editor mein paste karke Run karo)
--  Ek hi baar chalana hai. Dobara chalane pe bhi safe hai.
-- =============================================================

-- ---------- 1. PROFILES (sabko dikhne wali info) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        text check (role in ('landlord','tenant')),
  city        text,
  created_at  timestamptz not null default now()
);

-- Phone number alag table mein — sirf approve hone ke baad dikhega
create table if not exists public.profile_private (
  id     uuid primary key references public.profiles(id) on delete cascade,
  phone  text
);

-- Naya user login kare to profile apne-aap bane
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.profile_private (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. LISTINGS (kamre — public info, sirf approx location) ----------
create table if not exists public.listings (
  id                 uuid primary key default gen_random_uuid(),
  landlord_id        uuid not null references public.profiles(id) on delete cascade,
  title              text not null,
  description        text,
  rent               integer not null check (rent > 0),
  deposit            integer default 0,
  room_type          text not null check (room_type in ('room','1rk','1bhk','2bhk','pg','shared')),
  furnished          text default 'unfurnished' check (furnished in ('unfurnished','semi','full')),
  electricity        text default 'separate' check (electricity in ('included','separate','meter')),
  water_included     boolean default true,
  tenant_pref        text default 'any' check (tenant_pref in ('any','family','bachelor','girls','boys')),
  food_pref          text default 'any' check (food_pref in ('any','veg')),
  amenities          text[] default '{}',
  city               text,
  locality           text,
  approx_lat         double precision,   -- ~300-500m hila hua (privacy)
  approx_lng         double precision,
  photos             text[] default '{}',
  video_url          text,
  media_verified     boolean default false,  -- live camera + GPS stamp se aaya
  status             text not null default 'live' check (status in ('live','rented','hidden')),
  last_confirmed_at  timestamptz not null default now(),  -- "abhi bhi khali hai?" check
  created_at         timestamptz not null default now()
);
create index if not exists listings_search_idx on public.listings (status, rent);

-- Exact location + ghar ka pata — sirf landlord aur APPROVED tenant dekh sake
create table if not exists public.listing_private (
  listing_id  uuid primary key references public.listings(id) on delete cascade,
  exact_lat   double precision not null,
  exact_lng   double precision not null,
  address     text
);

-- Exact location save hote hi public approx location ~300-500m random hila ke set karo
create or replace function public.set_approx_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dist_m  double precision := 300 + random() * 200;
  angle   double precision := random() * 2 * pi();
begin
  update public.listings
     set approx_lat = new.exact_lat + (dist_m * cos(angle)) / 111320.0,
         approx_lng = new.exact_lng + (dist_m * sin(angle)) / (111320.0 * cos(radians(new.exact_lat)))
   where id = new.listing_id;
  return new;
end $$;

drop trigger if exists on_listing_private_saved on public.listing_private;
create trigger on_listing_private_saved
  after insert or update of exact_lat, exact_lng on public.listing_private
  for each row execute function public.set_approx_location();

-- ---------- 3. REQUESTS (tenant → landlord) ----------
create table if not exists public.requests (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  tenant_id    uuid not null references public.profiles(id) on delete cascade,
  landlord_id  uuid not null references public.profiles(id) on delete cascade,
  message      text,
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected','visited','done','cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (listing_id, tenant_id)
);

-- landlord_id hamesha listing se hi aaye (koi fake na bhar sake) + updated_at
create or replace function public.request_fill()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select landlord_id into new.landlord_id from public.listings where id = new.listing_id;
    if new.landlord_id = new.tenant_id then
      raise exception 'Apne hi kamre pe request nahi bhej sakte';
    end if;
    new.status := 'pending';
  else
    -- listing/tenant/landlord badle nahi ja sakte
    new.listing_id := old.listing_id; new.tenant_id := old.tenant_id; new.landlord_id := old.landlord_id;
    if new.status <> old.status then
      -- Approve/Reject sirf landlord kar sake
      if new.status in ('approved','rejected') and auth.uid() is distinct from old.landlord_id then
        raise exception 'Sirf landlord approve/reject kar sakta hai';
      end if;
      -- Cancel sirf tenant
      if new.status = 'cancelled' and auth.uid() is distinct from old.tenant_id then
        raise exception 'Sirf tenant cancel kar sakta hai';
      end if;
      -- Visited/Done sirf approve hone ke baad
      if new.status in ('visited','done') and old.status not in ('approved','visited') then
        raise exception 'Pehle landlord approve kare';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists on_request_fill on public.requests;
create trigger on_request_fill
  before insert or update on public.requests
  for each row execute function public.request_fill();

-- Deal Done → kamra "rented" ho kar search se hat jaye
create or replace function public.request_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    update public.listings set status = 'rented' where id = new.listing_id;
  end if;
  return new;
end $$;

drop trigger if exists on_request_done on public.requests;
create trigger on_request_done
  after update of status on public.requests
  for each row execute function public.request_done();

-- ---------- 4. CHAT (in-app messages) ----------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ---------- 5. RATINGS ----------
create table if not exists public.ratings (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  from_user   uuid not null references public.profiles(id) on delete cascade,
  to_user     uuid not null references public.profiles(id) on delete cascade,
  stars       integer not null check (stars between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  unique (request_id, from_user)
);

-- ---------- 6. HELPER: kya is user ki request approve hai? ----------
create or replace function public.is_approved_for_listing(p_listing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests
     where listing_id = p_listing and tenant_id = auth.uid()
       and status in ('approved','visited','done'));
$$;

create or replace function public.is_approved_contact(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests
     where status in ('approved','visited','done')
       and ((tenant_id = auth.uid() and landlord_id = p_user)
         or (landlord_id = auth.uid() and tenant_id = p_user)));
$$;

create or replace function public.is_request_party(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests
     where id = p_request and auth.uid() in (tenant_id, landlord_id));
$$;

-- ---------- 7. SECURITY (Row Level Security) ----------
alter table public.profiles        enable row level security;
alter table public.profile_private enable row level security;
alter table public.listings        enable row level security;
alter table public.listing_private enable row level security;
alter table public.requests        enable row level security;
alter table public.messages        enable row level security;
alter table public.ratings         enable row level security;

-- profiles: naam/photo sab dekh sakte, edit sirf khud
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"   on public.profiles for select using (true);
create policy "profiles update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- phone: khud + approved contact hi dekh sake
drop policy if exists "phone read"   on public.profile_private;
drop policy if exists "phone write"  on public.profile_private;
drop policy if exists "phone insert" on public.profile_private;
create policy "phone read"   on public.profile_private for select using (id = auth.uid() or public.is_approved_contact(id));
create policy "phone write"  on public.profile_private for update using (id = auth.uid()) with check (id = auth.uid());
create policy "phone insert" on public.profile_private for insert with check (id = auth.uid());

-- listings: live sab dekhe, landlord apne sab dekhe/edit kare
drop policy if exists "listings read"   on public.listings;
drop policy if exists "listings insert" on public.listings;
drop policy if exists "listings update" on public.listings;
drop policy if exists "listings delete" on public.listings;
create policy "listings read"   on public.listings for select
  using (status = 'live' or landlord_id = auth.uid() or public.is_approved_for_listing(id));
create policy "listings insert" on public.listings for insert with check (landlord_id = auth.uid());
create policy "listings update" on public.listings for update using (landlord_id = auth.uid()) with check (landlord_id = auth.uid());
create policy "listings delete" on public.listings for delete using (landlord_id = auth.uid());

-- exact location: landlord + approved tenant
drop policy if exists "exact read"  on public.listing_private;
drop policy if exists "exact write" on public.listing_private;
create policy "exact read" on public.listing_private for select using (
  public.is_approved_for_listing(listing_id)
  or exists (select 1 from public.listings l where l.id = listing_id and l.landlord_id = auth.uid()));
create policy "exact write" on public.listing_private for all
  using      (exists (select 1 from public.listings l where l.id = listing_id and l.landlord_id = auth.uid()))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.landlord_id = auth.uid()));

-- requests: dono party dekhe; tenant bheje; dono status badle
drop policy if exists "requests read"   on public.requests;
drop policy if exists "requests insert" on public.requests;
drop policy if exists "requests update" on public.requests;
create policy "requests read"   on public.requests for select using (auth.uid() in (tenant_id, landlord_id));
create policy "requests insert" on public.requests for insert with check (tenant_id = auth.uid());
create policy "requests update" on public.requests for update
  using (auth.uid() in (tenant_id, landlord_id)) with check (auth.uid() in (tenant_id, landlord_id));

-- messages: request ke dono log
drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages insert" on public.messages;
create policy "messages read"   on public.messages for select using (public.is_request_party(request_id));
create policy "messages insert" on public.messages for insert
  with check (sender_id = auth.uid() and public.is_request_party(request_id));

-- ratings: sab padh sakte, sirf deal wale de sakte
drop policy if exists "ratings read"   on public.ratings;
drop policy if exists "ratings insert" on public.ratings;
create policy "ratings read"   on public.ratings for select using (true);
create policy "ratings insert" on public.ratings for insert with check (
  from_user = auth.uid() and exists (
    select 1 from public.requests r where r.id = request_id and r.status in ('visited','done')
      and auth.uid() in (r.tenant_id, r.landlord_id)
      and to_user in (r.tenant_id, r.landlord_id) and to_user <> auth.uid()));

-- ---------- 8. SEARCH (budget + radius) ----------
create or replace function public.search_listings(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 5,
  p_min_rent integer default 0, p_max_rent integer default 1000000,
  p_room_type text default null)
returns table (
  id uuid, title text, rent integer, room_type text, furnished text, tenant_pref text,
  locality text, city text, approx_lat double precision, approx_lng double precision,
  photos text[], media_verified boolean, landlord_id uuid, distance_km double precision,
  created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select l.id, l.title, l.rent, l.room_type, l.furnished, l.tenant_pref, l.locality, l.city,
           l.approx_lat, l.approx_lng, l.photos, l.media_verified, l.landlord_id,
           6371 * 2 * asin(sqrt(
             power(sin(radians(l.approx_lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(l.approx_lat)) *
             power(sin(radians(l.approx_lng - p_lng) / 2), 2))) as distance_km,
           l.created_at
      from public.listings l
     where l.status = 'live'
       and l.approx_lat is not null
       and l.last_confirmed_at > now() - interval '7 days'   -- 7 din purani unconfirmed listing hide
       and l.rent between p_min_rent and p_max_rent
       and (p_room_type is null or l.room_type = p_room_type)
  ) s
  where s.distance_km <= p_radius_km
  order by s.distance_km
  limit 100;
$$;
grant execute on function public.search_listings to anon, authenticated;

-- ---------- 9. PHOTO/VIDEO STORAGE ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('room-media', 'room-media', true, 20971520)   -- 20 MB max per file
on conflict (id) do nothing;

drop policy if exists "media read"   on storage.objects;
drop policy if exists "media upload" on storage.objects;
drop policy if exists "media delete" on storage.objects;
create policy "media read"   on storage.objects for select using (bucket_id = 'room-media');
create policy "media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'room-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'room-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 10. REAL-TIME (turant update dono phone pe) ----------
do $$
declare t text;
begin
  foreach t in array array['listings','requests','messages'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ✅ Setup complete
select 'KirayaSetu database ready ✅' as status;
