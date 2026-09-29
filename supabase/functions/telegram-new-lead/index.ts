import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function publishableKey(): string {
  const value = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (value) {
    try {
      const keys = JSON.parse(value);
      return keys.default || Object.values(keys)[0] || "";
    } catch {
      return "";
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

function clean(value: unknown, max = 140): string {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey = publishableKey();
  const authorization = req.headers.get("Authorization");

  if (!token || !chatId || !supabaseUrl || !apiKey) {
    return reply({ error: "Telegram notification is not configured" }, 503);
  }
  if (!authorization) return reply({ error: "Unauthorized" }, 401);

  try {
    const adminCheck = await fetch(`${supabaseUrl}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!adminCheck.ok) return reply({ error: "Admin verification failed" }, 401);
    if (await adminCheck.json() !== true) return reply({ error: "Forbidden" }, 403);

    let body: { leads?: unknown };
    try {
      body = await req.json();
    } catch {
      return reply({ error: "Invalid JSON" }, 400);
    }
    if (!Array.isArray(body.leads) || body.leads.length < 1 || body.leads.length > 50) {
      return reply({ error: "Expected between 1 and 50 leads" }, 400);
    }

    const leads = body.leads as Array<Record<string, unknown>>;
    const title = leads.length === 1 ? "🔔 Новый лид в CRM" : `📥 Новые лиды в CRM: ${leads.length}`;
    const entries = leads.map((lead, index) => {
      const details = [
        `${index + 1}. #${clean(lead.id, 30)} — ${clean(lead.name) || "Без имени"}`,
        clean(lead.funnel, 100) ? `Воронка: ${clean(lead.funnel, 100)}` : "",
        clean(lead.phone, 40) ? `Телефон: ${clean(lead.phone, 40)}` : "",
        clean(lead.source, 100) ? `Источник: ${clean(lead.source, 100)}` : "",
      ].filter(Boolean);
      return details.join("\n");
    });
    const text = `${title}\n\n${entries.join("\n\n")}`.slice(0, 3800);

    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const telegramResult = await telegramResponse.json().catch(() => null);
    if (!telegramResponse.ok || !telegramResult?.ok) {
      console.error("Telegram sendMessage failed with status", telegramResponse.status);
      return reply({ error: "Telegram could not send the notification" }, 502);
    }
    return reply({ ok: true });
  } catch (error) {
    console.error("Telegram notification failed", error instanceof Error ? error.message : "unknown error");
    return reply({ error: "Notification request failed" }, 500);
  }
});
