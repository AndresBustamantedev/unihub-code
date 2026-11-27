-- La función del trigger no debe ser invocable vía /rest/v1/rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
