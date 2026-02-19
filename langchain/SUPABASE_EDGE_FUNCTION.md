# Integración de Webhook de Chatwoot con Supabase Edge Function

## Cambios realizados

Se ha migrado de un servidor local (Express + ngrok) a una **Supabase Edge Function** serverless, que proporciona:

✅ **URL fija permanente** - Sin necesidad de actualizar cada vez que reinicies  
✅ **Sin ngrok** - No requiere tunel local  
✅ **Servidor 24/7** - La función está siempre activa  
✅ **Escalable** - Maneja múltiples solicitudes automáticamente  

## Estructura de archivos

```
supabase/
├── config.toml              # Configuración de Supabase
└── functions/
    └── chatwoot-webhook/
        └── index.ts         # Edge Function del webhook
```

## Pasos para desplegar

### 1. Instalar Supabase CLI (si no lo tienes)

```bash
npm install -g supabase
```

O en Windows:
```bash
choco install supabase-cli
```

### 2. Autenticar con Supabase

```bash
supabase login
```

Se abrirá una ventana del navegador para autenticate en Supabase.

### 3. Configurar el proyecto local

```bash
# Desde la raíz del proyecto
cd langchain
supabase link --project-ref tu-project-ref
```

Reemplaza `tu-project-ref` con el ID de tu proyecto (lo encuentras en la URL de Supabase: `https://app.supabase.com/project/[PROJECT_REF]`)

### 4. Variables de entorno en Supabase

Configura las variables de entorno en tu proyecto Supabase:

**En Supabase Dashboard:**
1. Ve a tu proyecto → **Settings** → **Edge Functions**
2. Busca la sección **Environment Variables**
3. Agrega las siguientes variables:

```
CHATWOOT_API_URL = https://app.chatwoot.com
CHATWOOT_ACCOUNT_ID = tu_account_id
CHATWOOT_API_TOKEN = tu_api_token
CHATWOOT_WEBHOOK_SECRET = tu_secret (opcional)
SUPABASE_URL = tu_supabase_url
SUPABASE_ANON_KEY = tu_supabase_anon_key
OPENAI_API_KEY = tu_openai_api_key
TAVILY_API_KEY = tu_tavily_api_key (opcional)
```

**O desde CLI:**

```bash
supabase secrets set CHATWOOT_API_URL=https://app.chatwoot.com
supabase secrets set CHATWOOT_ACCOUNT_ID=tu_account_id
supabase secrets set CHATWOOT_API_TOKEN=tu_api_token
supabase secrets set CHATWOOT_WEBHOOK_SECRET=tu_secret
supabase secrets set SUPABASE_URL=tu_supabase_url
supabase secrets set SUPABASE_ANON_KEY=tu_supabase_anon_key
supabase secrets set OPENAI_API_KEY=tu_openai_api_key
supabase secrets set TAVILY_API_KEY=tu_tavily_api_key
```

### 5. Desplegar la Edge Function

```bash
supabase functions deploy chatwoot-webhook
```

Supabase te mostrará la URL pública de la función:

```
✅ Function created successfully!
Deployed: chatwoot-webhook
URL: https://your-project.supabase.co/functions/v1/chatwoot-webhook
```

### 6. Configurar el webhook en Chatwoot

1. Ve a Chatwoot → **Settings** → **Integrations** → **Webhooks**
2. Haz click en **Add new webhook**
3. Configura:
   - **URL**: `https://your-project.supabase.co/functions/v1/chatwoot-webhook`
   - **Events**: Selecciona `message_created`
   - **Secret** (opcional): Si configuraste `CHATWOOT_WEBHOOK_SECRET`, ingrésalo aquí

4. Guarda el webhook

## Verificar que funciona

### Opción 1: Desde Supabase Dashboard
1. Ve a tu proyecto → **Edge Functions**
2. Selecciona `chatwoot-webhook`
3. Abre la pestaña **Invocations** para ver los logs

### Opción 2: Enviar un test desde Chatwoot
1. Ve a Chatwoot → **Settings** → **Integrations** → **Webhooks**
2. Busca tu webhook
3. Copia la URL y haz un test (envía un mensaje de prueba)
4. Revisa los logs en Supabase

## Comandos útiles

```bash
# Ver logs en tiempo real
supabase functions logs chatwoot-webhook --tail

# Actualizar la función (después de cambios)
supabase functions deploy chatwoot-webhook

# Ver variables de entorno
supabase secrets list

# Actualizar una variable
supabase secrets set VARIABLE_NAME=new_value

# Crear tabla de memorias (si no existe)
supabase db push
```

## Troubleshooting

### La función no se invoca
- Verifica que el webhook esté activo en Chatwoot
- Comprueba la URL exacta en la configuración del webhook
- Revisa los logs en Supabase Dashboard

### Error de variables de entorno
- Asegúrate de que todas las variables estén configuradas en Supabase
- Espera unos segundos después de actualizar variables antes de probar
- Redeploy la función después de cambiar variables

### Errores de CORS
- Las Edge Functions de Supabase manejan CORS automáticamente
- Los headers CORS están incluidos en la respuesta

### La firma no coincide
- Verifica que `CHATWOOT_WEBHOOK_SECRET` sea idéntico en Supabase y Chatwoot
- Si no usas secret, deja ambos campos en blanco

## Diferencias con la versión local

| Aspecto | Local (Express + ngrok) | Supabase Edge Function |
|---------|----------------------|----------------------|
| **Hosting** | Tu máquina | Servidores de Supabase |
| **URL** | Cambia cada vez | Permanente |
| **Uptime** | Solo cuando tu PC está encendida | 24/7 |
| **Escalabilidad** | Manual | Automática |
| **Base de datos** | Supabase | Supabase (misma) |
| **Costo** | Gratis (servicio local) | Gratis (dentro de límites Supabase) |

## Documentación de referencia

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Chatwoot Webhooks](https://www.chatwoot.com/docs/features/webhooks)
- [LangChain en Deno](https://js.langchain.com/docs/guides/deployment/deno)
