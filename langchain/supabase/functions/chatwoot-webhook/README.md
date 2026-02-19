# Chatwoot Webhook Edge Function

Esta es la Edge Function de Supabase que maneja los webhooks de Chatwoot.

## Descripción

Cuando Chatwoot envía un mensaje entrante a través del webhook:

1. **Verifica** la firma HMAC (si está configurada)
2. **Limpia** el contenido HTML del mensaje
3. **Detecta intención**: Si la pregunta necesita buscar memorias personales o información web
4. **Construye respuesta**: Usa LangChain + OpenAI con contexto de Supabase (memorias) y/o Tavily (búsqueda web)
5. **Envía respuesta**: De vuelta a Chatwoot como mensaje del agente

## Variables de entorno requeridas

Estas deben configurarse en Supabase Dashboard → Settings → Edge Functions → Environment Variables:

```
CHATWOOT_API_URL           # https://app.chatwoot.com
CHATWOOT_ACCOUNT_ID        # Tu ID de cuenta
CHATWOOT_API_TOKEN         # Tu token de API
CHATWOOT_WEBHOOK_SECRET    # Tu secret del webhook (opcional)

SUPABASE_URL               # La URL de tu proyecto
SUPABASE_ANON_KEY          # Tu clave anónima

OPENAI_API_KEY             # Tu API key de OpenAI
TAVILY_API_KEY             # Tu API key de Tavily (optional)
```

## Flujo de ejecución

```
Chatwoot sends webhook
         ↓
   ┌─────────────────────┐
   │ Verify signature    │
   └─────────────────────┘
         ↓
   ┌─────────────────────┐
   │ Clean HTML content  │
   └─────────────────────┘
         ↓
   ┌─────────────────────────────────────┐
   │ Detect: Needs memory? Needs web?   │
   └─────────────────────────────────────┘
         ↓
   ┌──────────────────────────────────────┐
   │ Fetch memories from Supabase (RPC)  │
   │ Fetch web results from Tavily       │
   └──────────────────────────────────────┘
         ↓
   ┌──────────────────────────────────┐
   │ Build system prompt with context │
   └──────────────────────────────────┘
         ↓
   ┌──────────────────────────────┐
   │ Call OpenAI gpt-4-turbo      │
   └──────────────────────────────┘
         ↓
   ┌──────────────────────────────────────┐
   │ Send response back to Chatwoot       │
   └──────────────────────────────────────┘
```

## Tecnologías

- **Deno** - runtime seguro basado en V8
- **Supabase Edge Functions** - serverless en Deno
- **LangChain** - orquestación de LLMs
- **OpenAI** - generación de texto
- **Supabase** - almacenamiento de memorias
- **Tavily API** - búsqueda web

## Testing local

Para probar localmente antes de deployar:

```bash
# Crear un archivo test.json con el payload de Chatwoot
cat > test.json << 'EOF'
{
  "event": "message_created",
  "message_type": "incoming",
  "content": "Hola, ¿qué es machine learning?",
  "conversation": {
    "id": 123
  },
  "sender": {
    "type": "contact"
  }
}
EOF

# Hacer request a la función (si está deployada)
curl -X POST https://your-project.supabase.co/functions/v1/chatwoot-webhook \
  -H "Content-Type: application/json" \
  -d @test.json
```

## Debug

Ver logs en tiempo real:

```bash
supabase functions logs chatwoot-webhook --tail
```

## Más información

Ver [SUPABASE_EDGE_FUNCTION.md](../../SUPABASE_EDGE_FUNCTION.md) para instrucciones completas de deployment.
