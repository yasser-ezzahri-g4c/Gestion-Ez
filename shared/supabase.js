export const SUPABASE_URL = "https://nvajehtowtehymgpqwvn.supabase.co";
export const SUPABASE_KEY = "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52YWplaHRvd3RlaHltZ3Bxd3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjQ5MTksImV4cCI6MjEwNTE0MDkxOX0.7cnl3q4sBzQjdWtYm2n8DavGvhP1OjHLFPwruPJ6Uos";

export const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
