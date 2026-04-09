import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ibjtjtmakpdulkraiaca.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlianRqdG1ha3BkdWxrcmFpYWNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2Nzg2NTEsImV4cCI6MjA5MTI1NDY1MX0.vMAFzvDZ-4R8Sn38kTG01a2e5JOWPoO2LAV-WYmUIY8'

export const supabase = createClient(supabaseUrl, supabaseKey)