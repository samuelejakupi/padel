-- Verifica il trigger sul database senza conservare utenti di prova.
begin;
do $test$
declare test_id uuid := gen_random_uuid(); blocked boolean := false;
begin
  insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data)
  values(test_id, 'admin-regression-test@theboyz.local', '{"display_name":"Test Admin"}', '{"provider":"email"}');
  update auth.users set raw_app_meta_data = raw_app_meta_data || '{"theboyz_provisioned":true}'::jsonb where id=test_id;
  set constraints auth.on_auth_user_created immediate;
  if not exists(select 1 from public.profiles where id=test_id and display_name='Test Admin')
     or not exists(select 1 from public.member_logins where profile_id=test_id and username='admin-regression-test')
     or exists(select 1 from public.admin_members where profile_id=test_id) then
    raise exception 'Provisioning admin non corretto';
  end if;
  set constraints auth.on_auth_user_created deferred;
  begin
    insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
    values(gen_random_uuid(),'public-regression-test@theboyz.local','{"display_name":"Test pubblico","theboyz_provisioned":true}','{"provider":"email"}');
    set constraints auth.on_auth_user_created immediate;
  exception when raise_exception then
    if sqlerrm = 'Registrazione pubblica disabilitata' then blocked := true; else raise; end if;
  end;
  if not blocked then raise exception 'Registrazione pubblica non bloccata'; end if;
end $test$;
select 'Creazione admin riuscita; registrazione pubblica bloccata; nessun privilegio admin assegnato' as risultato;
rollback;
