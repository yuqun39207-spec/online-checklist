import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cfpssaxyneqohbpluipb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmcHNzYXh5bmVxb2hicGx1aXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4Mzg1NjksImV4cCI6MjA4NzQxNDU2OX0.ONILoZGG3P-DyJqJM-s8H7asIW28goC0eOxhiYylnqE'

export const supabase = createClient(supabaseUrl, supabaseKey)
