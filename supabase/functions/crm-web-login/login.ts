const ORIGIN = "https://platform770uz-dev.github.io";
const MAX_BODY = 1024;

export function pinMatches(input: unknown, expected: string) {
  if (typeof input !== "string" || !/^\d{4}$/.test(input) || !/^\d{4}$/.test(expected)) return false;
  let mismatch = 0;
  for (let i = 0; i < 4; i++) mismatch |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function ipDigest(ip: string) {
  const bytes = new TextEncoder().encode(`crm-web-pin:${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function requestIp(req: Request) {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (cf || real || forwarded || "unknown").slice(0, 128);
}

async function loadOrCreateWebUser(admin: any) {
  const found = await admin.from("crm_web_login").select("auth_user_id, enabled").eq("id", "shared").maybeSingle();
  if (found.error) throw new Error("web login table unavailable");
  if (found.data) return found.data;

  const email = `crm-web-${crypto.randomUUID().replaceAll("-", "")}@crm.invalid`;
  const created = await admin.auth.admin.createUser({
    email, email_confirm: true,
    app_metadata: { crm_web_pin: true },
    user_metadata: { full_name: "CRM web" },
  });
  if (created.error || !created.data?.user?.id) throw new Error("web account unavailable");
  const userId = created.data.user.id;
  const inserted = await admin.from("crm_web_login").insert({ id: "shared", auth_user_id: userId }).select("auth_user_id, enabled").maybeSingle();
  if (inserted.error || !inserted.data) {
    await admin.auth.admin.deleteUser(userId);
    const raced = await admin.from("crm_web_login").select("auth_user_id, enabled").eq("id", "shared").maybeSingle();
    if (raced.error || !raced.data) throw new Error("web account unavailable");
    return raced.data;
  }
  return inserted.data;
}

export function createWebLoginHandler(admin: any, getPin: () => string, origin = ORIGIN) {
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
  const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });

  return async (req: Request) => {
    const suppliedOrigin = req.headers.get("origin");
    if (suppliedOrigin && suppliedOrigin !== origin) return reply({ error: "origin_denied" }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
    const expected = getPin();
    if (!/^\d{4}$/.test(expected)) return reply({ error: "login_not_configured" }, 503);

    let pin: unknown;
    try {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return reply({ error: "invalid_request" }, 400);
      pin = JSON.parse(raw)?.pin;
    } catch { return reply({ error: "invalid_request" }, 400); }

    let key: string;
    let allowed: any;
    try {
      key = await ipDigest(requestIp(req));
      allowed = await admin.rpc("crm_web_pin_attempt", { p_ip_hash: key, p_failed: false });
      if (allowed.error || typeof allowed.data !== "boolean") return reply({ error: "login_unavailable" }, 503);
      if (!allowed.data) return reply({ error: "too_many_attempts" }, 429);
    } catch { return reply({ error: "login_unavailable" }, 503); }

    if (!pinMatches(pin, expected)) {
      try {
        const result = await admin.rpc("crm_web_pin_attempt", { p_ip_hash: key, p_failed: true });
        if (result.error || typeof result.data !== "boolean") return reply({ error: "login_unavailable" }, 503);
        if (!result.data) return reply({ error: "too_many_attempts" }, 429);
      } catch { return reply({ error: "login_unavailable" }, 503); }
      return reply({ error: "pin_invalid" }, 401);
    }

    try {
      const account = await loadOrCreateWebUser(admin);
      if (!account.enabled) return reply({ error: "web_access_disabled" }, 403);
      const authUser = await admin.auth.admin.getUserById(account.auth_user_id);
      if (authUser.error || authUser.data?.user?.app_metadata?.crm_web_pin !== true || !authUser.data.user.email) {
        return reply({ error: "login_unavailable" }, 503);
      }
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email: authUser.data.user.email });
      if (link.error || !link.data?.properties?.hashed_token || link.data.user?.id !== account.auth_user_id) {
        return reply({ error: "login_unavailable" }, 503);
      }
      const current = await admin.from("crm_web_login").select("auth_user_id, enabled").eq("id", "shared").maybeSingle();
      if (current.error) return reply({ error: "login_unavailable" }, 503);
      if (!current.data?.enabled || current.data.auth_user_id !== account.auth_user_id) return reply({ error: "web_access_disabled" }, 403);
      return reply({ token_hash: link.data.properties.hashed_token });
    } catch {
      return reply({ error: "login_unavailable" }, 503);
    }
  };
}

