# Integración con Chatwoot Cloud

> ⚡ **Opción recomendada:** Usa [Supabase Edge Function](./SUPABASE_EDGE_FUNCTION.md) para una URL permanente y servidor 24/7 sin ngrok.

## 1. Requisitos previos

- Cuenta en [Chatwoot Cloud](https://www.chatwoot.com/)
- **OPCIÓN A (Recomendada)**: Supabase con Edge Functions configurada → [Ver instrucciones](./SUPABASE_EDGE_FUNCTION.md)
- **OPCIÓN B (Local)**: [ngrok](https://ngrok.com/) instalado (descarga desde https://ngrok.com/download)
- Variables de entorno configuradas en `.env`:

```env
# Chatwoot API
CHATWOOT_API_URL=https://app.chatwoot.com
CHATWOOT_ACCOUNT_ID=tu_account_id
CHATWOOT_API_TOKEN=tu_api_token

# Webhook (opcional)
CHATWOOT_WEBHOOK_SECRET=tu_secret

# Puerto (opcional, default: 3000)
PORT=3000
```

## 2. Iniciar el servidor webhook

En una terminal, ejecuta:

```bash
npm run chatwoot
```

El servidor iniciará en `http://localhost:3000/chatwoot`

## 3. Exponer el servidor con ngrok

En **otra terminal**, ejecuta:

```bash
ngrok http 3000
```

ngrok mostrará una URL pública similar a:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3000
```

**Copia la URL HTTPS** (ej: `https://abc123.ngrok-free.app`)

## 4. Configurar webhook en Chatwoot

1. Ve a Chatwoot → **Settings** → **Integrations** → **Webhooks**
2. Haz click en **Add new webhook**
3. Configura:
   - **URL**: `https://abc123.ngrok-free.app/chatwoot` (tu URL de ngrok + `/chatwoot`)
   - **Events**: Selecciona `message_created`
   - **Secret** (opcional): Si configuraste `CHATWOOT_WEBHOOK_SECRET`, ingrésalo aquí

4. Guarda el webhook

## 5. Probar la integración

1. En Chatwoot, abre una conversación
2. Envía un mensaje como cliente
3. El agente AI debería responder automáticamente

## Obtener credenciales de Chatwoot

### Account ID
Revisa la URL de tu dashboard:
```
https://app.chatwoot.com/app/accounts/[ACCOUNT_ID]/dashboard
```

### API Token
1. Ve a **Profile Settings** (icono de perfil)
2. **Access Token**
3. Copia el token

## Troubleshooting

### El webhook no responde
- Verifica que ambos servicios estén corriendo (servidor + ngrok)
- Revisa los logs del servidor para errores
- Verifica que la URL del webhook sea correcta (incluye `/chatwoot`)

### Error de firma inválida
- Asegúrate de que `CHATWOOT_WEBHOOK_SECRET` coincida en `.env` y en la configuración del webhook
- Si no usas secret, elimina `CHATWOOT_WEBHOOK_SECRET` del `.env`

### ngrok URL cambia al reiniciar
- Con la versión gratuita de ngrok, la URL cambia cada vez
- Actualiza la URL del webhook en Chatwoot cada vez que reinicies ngrok
- O usa una cuenta de ngrok con dominio fijo
