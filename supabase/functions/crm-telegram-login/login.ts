// Only signed Telegram Mini App data is accepted. The client never supplies an
// email or a Supabase user id, and approval is checked again by database RLS.
export async function validateTelegramData(raw: string, botToken: string, now = Date.now()) {
  if (!raw || raw.length > 12000 || !botToken) throw new Error("invalid Telegram data");
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new Error("duplicate Telegram fields");
  const hash = params.get("hash") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("invalid Telegram hash");
  params.delete("hash");
  const encoder = new TextEncoder();
  async function hmac(key: BufferSource, value: string) {
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
  }
  const secret = await hmac(encoder.encode("WebAppData"), botToken);
  const data = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join("\n");
  const digest = await hmac(secret, data);
  let mismatch = 0;
  for (let i = 0; i < digest.length; i++) mismatch |= digest[i] ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16);
  if (mismatch) throw new Error("invalid Telegram signature");
  const authDate = Number(params.get("auth_date"));
  const age = Math.floor(now / 1000) - authDate;
  if (!Number.isInteger(authDate) || authDate <= 0 || age < -30 || age > 300) throw new Error("expired Telegram data");
  const user = JSON.parse(params.get("user") ?? "null");
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot === true) throw new Error("invalid Telegram user");
  return user;
}

export function createLoginHandler(admin: any, botToken: () => string, origin = "https://platform770uz-dev.github.io") {
  return async (req: Request) => {
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "Vary": "Origin",
    };
    const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (req.headers.get("origin") && req.headers.get("origin") !== origin) return reply({ error: "origin_denied" }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
    if (!botToken()) return reply({ error: "login_not_configured" }, 503);
    let user: any;
    try {
      const text = await req.text();
      if (text.length > 16000) return reply({ error: "invalid_request" }, 400);
      const body = JSON.parse(text);
      user = await validateTelegramData(typeof body?.initData === "string" ? body.initData : "", botToken());
    } catch { return reply({ error: "telegram_auth_invalid" }, 401); }

    try {
      const chatResult = await admin.from("tg_chatlar").select("auth_user_id, tasdiqlangan, bloklangan").eq("chat_id", user.id).maybeSingle();
      if (chatResult.error) return reply({ error: "login_not_configured" }, 503);
      const chat = chatResult.data;
      if (!chat?.tasdiqlangan || chat.bloklangan) return reply({ error: "approval_required" }, 403);

      let authUserId = chat.auth_user_id;
      if (!authUserId) {
        const email = `tg${user.id}-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}@crm.invalid`;
        const created = await admin.auth.admin.createUser({
          email, email_confirm: true,
          app_metadata: { crm_telegram_chat_id: String(user.id) },
          user_metadata: { full_name: [user.first_name, user.last_name].filter(Boolean).join(" ").slice(0, 120) },
        });
        if (created.error || !created.data?.user) return reply({ error: "login_unavailable" }, 503);
        const newId = created.data.user.id;
        const bound = await admin.from("tg_chatlar").update({ auth_user_id: newId }).eq("chat_id", user.id)
          .eq("tasdiqlangan", true).eq("bloklangan", false).is("auth_user_id", null).select("auth_user_id");
        if (bound.error) {
          // A lost response may hide a committed binding. Do not delete a user
          // whose binding is uncertain; a subsequent login can safely recover it.
          return reply({ error: "login_unavailable" }, 503);
        }
        if (bound.data?.[0]) authUserId = bound.data[0].auth_user_id;
        else {
          // Another login won the binding race, or access was revoked meanwhile.
          await admin.auth.admin.deleteUser(newId);
          const current = await admin.from("tg_chatlar").select("auth_user_id, tasdiqlangan, bloklangan").eq("chat_id", user.id).maybeSingle();
          if (current.error) return reply({ error: "login_unavailable" }, 503);
          if (!current.data?.tasdiqlangan || current.data.bloklangan) return reply({ error: "approval_required" }, 403);
          authUserId = current.data.auth_user_id;
        }
      }
      if (!authUserId) return reply({ error: "login_unavailable" }, 503);
      const account = await admin.auth.admin.getUserById(authUserId);
      const authUser = account.data?.user;
      if (account.error || !authUser?.email || authUser.app_metadata?.crm_telegram_chat_id !== String(user.id)) {
        return reply({ error: "login_unavailable" }, 503);
      }
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email: authUser.email });
      if (link.error || !link.data?.properties?.hashed_token || link.data.user?.id !== authUserId) return reply({ error: "login_unavailable" }, 503);
      // Recheck after the auth calls so a revoked admin never receives the token.
      const current = await admin.from("tg_chatlar").select("auth_user_id, tasdiqlangan, bloklangan").eq("chat_id", user.id).maybeSingle();
      if (current.error) return reply({ error: "login_unavailable" }, 503);
      if (!current.data?.tasdiqlangan || current.data.bloklangan || current.data.auth_user_id !== authUserId) return reply({ error: "approval_required" }, 403);
      return reply({ token_hash: link.data.properties.hashed_token });
    } catch {
      // Do not log Telegram credentials, magic-link hashes, or service secrets.
      return reply({ error: "login_unavailable" }, 503);
    }
  };
}
