import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://juijfnqiyrfnrqdcgjac.supabase.co',
  'sb_publishable_0nOKsSyhAUMJHxxLRT_3Xg_zlazgxhe',
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
);
