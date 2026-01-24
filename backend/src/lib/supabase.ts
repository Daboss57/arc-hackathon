import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const supabaseUrl = config.SUPABASE_URL;
const supabaseServiceKey = config.SUPABASE_SERVICE_ROLE_KEY;

export const supabase =
    supabaseUrl && supabaseServiceKey
        ? createClient(supabaseUrl, supabaseServiceKey, {
              auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;

