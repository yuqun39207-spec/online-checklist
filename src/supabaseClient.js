import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cfpssaxyneqohbpluipb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmcHNzYXh5bmVxb2hicGx1aXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4Mzg1NjksImV4cCI6MjA4NzQxNDU2OX0.ONILoZGG3P-DyJqJM-s8H7asIW28goC0eOxhiYylnqE'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  global: {
    headers: {
      'x-client-info': 'checklist-app'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
})

// 带重试的请求包装器
export async function retryRequest(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn()
      if (result.error) {
        if (i === maxRetries - 1) throw result.error
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        continue
      }
      return result
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
    }
  }
}

