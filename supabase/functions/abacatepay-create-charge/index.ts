import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
const API_KEY = Deno.env.get('ABACATEPAY_API_KEY');
const BASE_V2 = 'https://api.abacatepay.com/v2';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS
    }
  });
}
async function abacatePOST(path, body) {
  const res = await fetch(`${BASE_V2}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  console.log(`AbacatePay ${path} ${res.status}:`, text);
  if (!res.ok) throw new Error(`AbacatePay ${path} ${res.status}: ${text}`);
  return JSON.parse(text);
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response(null, {
    headers: CORS
  });
  if (req.method !== 'POST') return new Response('Method not allowed', {
    status: 405
  });
  try {
    const { packageId, type, suiteId, checkIn, checkOut, customerName, customerPhone, customerEmail, customerTaxId, totalAmount, appOrigin, paymentMethod = 'pix', extras = {} } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const holdExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    // Busca reserva pending ativa do mesmo usuário na mesma suíte
    // (sem comparar timestamps exatos para evitar problemas de formato)
    const { data: existing } = await supabase.from('reservations').select('id').eq('suite_id', suiteId).eq('customer_email', customerEmail).eq('status', 'pending').gt('hold_expires_at', now).maybeSingle();
    let reservationId;
    const reusingExisting = !!existing?.id;
    if (reusingExisting) {
      reservationId = existing.id;
      await supabase.from('reservations').update({
        payment_method: paymentMethod,
        hold_expires_at: holdExpiresAt,
        payment_id: null,
        extras
      }).eq('id', reservationId);
      console.log('Reusing reservation:', reservationId, '| new method:', paymentMethod);
    } else {
      const { data: reservation, error: insertError } = await supabase.from('reservations').insert({
        package_id: packageId,
        type,
        suite_id: suiteId,
        check_in: checkIn,
        check_out: checkOut,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        status: 'pending',
        hold_expires_at: holdExpiresAt,
        extras
      }).select('id').single();
      if (insertError || !reservation) {
        const msg = insertError?.message ?? 'Erro ao criar reserva';
        console.error('DB insert error:', msg);
        const conflict = msg.includes('não está disponível') || msg.includes('overlap') || msg.includes('conflict');
        return json({
          error: conflict ? 'Esta suíte já está reservada neste horário. Tente outro horário ou suíte.' : msg
        });
      }
      reservationId = reservation.id;
      console.log('New reservation:', reservationId);
    }
    const origin = appOrigin ?? 'https://selectmotel.vercel.app';
    const amountCents = Math.round(Number(totalAmount) * 100);
    const phone = customerPhone.replace(/\D/g, '');
    const taxId = (customerTaxId ?? '').replace(/\D/g, '');
    const checkInFmt = new Date(checkIn).toLocaleDateString('pt-BR');
    let billingId = null;
    let billingUrl = null;
    let brCode = '';
    let qrCodeImage = null;
    try {
      if (paymentMethod === 'pix') {
        // Em prod, se o `customer` é enviado, TODOS os campos viram obrigatórios
        // (name+email+cellphone+taxId). Sem taxId → mandamos sem customer.
        const data: Record<string, unknown> = {
          amount: amountCents,
          expiresIn: 3600,
          description: `Reserva Select Motel — check-in ${checkInFmt}`,
          externalId: reservationId,
          metadata: { reservationId }
        };
        if (taxId) {
          data.customer = {
            name: customerName,
            email: customerEmail,
            cellphone: phone,
            taxId
          };
        }
        const resp = await abacatePOST('/transparents/create', { method: 'PIX', data });
        const d = resp.data ?? resp;
        billingId = d.id ?? d._id ?? null;
        brCode = d.brCode ?? d.pixCode ?? '';
        qrCodeImage = d.brCodeBase64 ?? d.qrCode?.base64 ?? null;
      } else {
        const customerResp = await abacatePOST('/customers/create', {
          name: customerName,
          email: customerEmail,
          cellphone: phone,
          taxId
        });
        const cd = customerResp.data ?? customerResp;
        const customerId = cd._id ?? cd.id;
        if (!customerId) throw new Error(`customerId não retornado: ${JSON.stringify(customerResp)}`);
        // externalId precisa ser único — se o cliente trocar de método ou retentar,
        // a mesma reservation cria outra cobrança e /products/create dá 400 'already exists'
        const productResp = await abacatePOST('/products/create', {
          externalId: `${reservationId}-${Date.now()}`,
          name: 'Reserva Select Motel',
          description: `Check-in ${checkInFmt}`,
          price: amountCents,
          currency: 'BRL'
        });
        const pd = productResp.data ?? productResp;
        const productId = pd._id ?? pd.id;
        if (!productId) throw new Error(`productId não retornado: ${JSON.stringify(productResp)}`);
        // card.maxInstallments > 1 faz aparecer o seletor de parcelas
        // (mínimo R$10 por parcela; a API recusa se total ÷ parcelas < R$10)
        const maxInstallments = Math.max(1, Math.min(12, Math.floor(amountCents / 1000)));
        const checkoutResp = await abacatePOST('/checkouts/create', {
          frequency: 'ONE_TIME',
          methods: ['CARD'],
          items: [{ id: productId, quantity: 1 }],
          returnUrl:     `${origin}/?payment=ok&ref=${reservationId}`,
          completionUrl: `${origin}/?payment=ok&ref=${reservationId}`,
          customerId,
          card: { maxInstallments },
          metadata: { reservationId }
        });
        const d = checkoutResp.data ?? checkoutResp;
        billingId = d._id ?? d.id ?? null;
        billingUrl = d.url ?? d.checkoutUrl ?? d.paymentUrl ?? null;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('AbacatePay error:', msg);
      if (!reusingExisting) {
        await supabase.from('reservations').delete().eq('id', reservationId);
      }
      return json({
        error: msg
      });
    }
    if (billingId) {
      await supabase.from('reservations').update({
        payment_id: billingId
      }).eq('id', reservationId);
    }
    return json({
      reservationId,
      billingId,
      billingUrl,
      brCode,
      qrCodeImage
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Unhandled error:', msg);
    return json({
      error: `Erro interno: ${msg}`
    });
  }
});
