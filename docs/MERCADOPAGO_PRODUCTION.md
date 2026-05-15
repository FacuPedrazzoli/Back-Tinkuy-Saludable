# MercadoPago Production Guide — Tinkuy

## Prerequisites

- Cuenta vendedor en [MercadoPago Argentina](https://www.mercadopago.com.ar)
- Python/webhooks disponibles en tu servidor

---

## Step 1 — Crear cuenta vendedor en MP Argentina

1. Ir a https://www.mercadopago.com.ar
2. Registrarse como vendedor (vendedor = tipo de cuenta "Corporativa" o "Individual")
3. Completar datos fiscales y bancarios
4. Esperar aprobación (24-72hs para cuentas corporativas)

---

## Step 2 — Obtener ACCESS_TOKEN producción (NO sandbox)

1. Ir a https://dashboard.mercadopago.com.ar
2. Seleccionar tu aplicación o crear una nueva
3. Ir a **Credenciales > Producción**
4. Copiar el `ACCESS_TOKEN` que empieza con `APP_USR-` (NO con `TEST-`)
5. Copiar también el `PUBLIC_KEY` (empieza con `APP_USR-`)

**ATENCIÓN:**
- `TEST-...` = sandbox (pruebas)
- `APP_USR-...` = producción
- Nunca usar tokens de sandbox en producción

---

## Step 3 — Configurar Webhook URL en panel de MP

1. En el dashboard, ir a **Notificaciones > Webhooks**
2. Configurar la URL:
   ```
   https://tinkuy.com.ar/api/webhooks/mercadopago
   ```
3. Seleccionar eventos a escuchar: `payment`
4. Guardar

Alternativamente, la URL de notificación se pasa vía `notification_url` en el código (línea 85 de `src/modules/checkout/service.ts`).

---

## Step 4 — Verificación de firma del webhook

El código en `src/modules/checkout/webhook.handler.ts` implementa verificación HMAC-SHA256:

```typescript
function verifyMercadoPagoSignature(payload: string, signature: string, secret: string): boolean {
  const [timestampPart, hashPart] = signature.split(",");
  const timestamp = timestampPart.replace("t=", "");
  const expectedHash = hashPart.replace("v1=", "");
  const dataToSign = `${timestamp}${payload}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(dataToSign);
  const computedHash = hmac.digest("hex");
  return computedHash === expectedHash;
}
```

La firma viene en el header `x-signature` con formato:
```
t=1734523321,v1=abc123...,v0=...
```

El `MP_WEBHOOK_SECRET` se configura en variables de entorno.

---

## Step 5 — Test con $1 peso real (Pago Fácil / Rapipago)

### Test con monto mínimo real

1. En tu código de checkout, cambia temporalmente el monto a `$1` (o el item más barato)
2. Realizar una compra de prueba
3. Seleccionar medio de pago **Pago Fácil** o **Rapipago**
4. Anotar el **código de pago / operación** que genera MP
5. Ir a la boca de pago más cercana
6. Efectuar el pago con el código
7. El webhook debería notificar el pago después de unos minutos (puede tardar hasta 30min)

### Datos para testar en producción

| Medio de pago      | Instrucciones                                                    |
|--------------------|------------------------------------------------------------------|
| Pago Fácil         | Generar cupón, ir a任何一个 sucrusal, pagar con código de barras |
| Rapipago           | Generar cupón, ir a Rapipago, pagar con comprobante              |
| Tarjeta de crédito | Probar con monto bajo para evitar cargos reales (opcional)        |

### Verificar en dashboard MP

1. Ir a https://dashboard.mercadopago.com.ar > **Pagos**
2. Buscar por `external_reference` o email del cliente
3. Verificar que el pago aparece como `approved` después de confirmar

---

## Configuración de variables de entorno

Ver `.env.example` para el template completo:

```env
# Producción — tokens reales (APP_USR-)
MP_ACCESS_TOKEN=APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MP_PUBLIC_KEY=APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MP_WEBHOOK_SECRET=your_whsec_from_mp_dashboard

# URL de notificación (debe ser accesible públicamente)
MP_NOTIFICATION_URL=https://tinkuy.com.ar/api/webhooks/mercadopago

# Modo producción
MP_MODE=production
```

---

## Errores comunes

| Error                          | Causa                               | Solución                              |
|--------------------------------|-------------------------------------|---------------------------------------|
| `401 Invalid signature`        | Webhook secret incorrecto           | Verificar `MP_WEBHOOK_SECRET`         |
| `400 Only payment events...`   | Event type no es `payment`          | Ignorar eventos `merchant_order` etc  |
| Timeout en webhook             | Servidor no responde en 30s         | Mejorar performance del handler        |
| Payment amount mismatch        | Montos no coinciden                 | Verificar que `transaction_amount` = total del carrito |

---

## Links útiles

- Dashboard MP: https://dashboard.mercadopago.com.ar
- Docs Webhooks: https://www.mercadopago.com.ar/developers/es/docs/additional-content/notifications/webhooks
- Docs Preference API: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/checkout-customization/preferences
- Boca de pago Pago Fácil: https://www.pagofacil.com.ar/sucursales
- Boca de pago Rapipago: https://www.rapipago.com.ar/rapipago/sucursales.html
