import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tgyupsejfuvglbwjneob.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneXVwc2VqZnV2Z2xid2puZW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MTY4NDksImV4cCI6MjEwMjk5Mjg0OX0.vX_RvoGRxaHYtijcjaybDkI4x35FF63uv2rVJsj6Yvo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
