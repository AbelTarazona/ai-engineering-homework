# Quick Deploy to Supabase

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Login to Supabase
supabase login

# 3. Link your project (replace with your project ref)
supabase link --project-ref your-project-ref

# 4. Set environment variables
supabase secrets set CHATWOOT_API_URL=https://app.chatwoot.com
supabase secrets set CHATWOOT_ACCOUNT_ID=your_account_id
supabase secrets set CHATWOOT_API_TOKEN=your_api_token
supabase secrets set CHATWOOT_WEBHOOK_SECRET=your_secret
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_ANON_KEY=your_anon_key
supabase secrets set OPENAI_API_KEY=your_openai_key
supabase secrets set TAVILY_API_KEY=your_tavily_key

# 5. Deploy the function
supabase functions deploy chatwoot-webhook

# 6. Get your webhook URL
# Output: https://your-project.supabase.co/functions/v1/chatwoot-webhook

# 7. Add to Chatwoot webhook settings with that URL
```

**Webhook URL will be:**
```
https://your-project.supabase.co/functions/v1/chatwoot-webhook
```

See [SUPABASE_EDGE_FUNCTION.md](./SUPABASE_EDGE_FUNCTION.md) for complete instructions.
