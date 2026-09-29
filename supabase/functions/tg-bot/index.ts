import { createClient } from "npm:@supabase/supabase-js@2";

// 1924 admin-bot: Telegram'da havolalar menyusi + CRM'ga tashqaridan yangi lid tushsa xabar.
// Bot tokeni faqat Supabase → Edge Functions → Secrets → TELEGRAM_BOT_TOKEN da (kodda ham, bazada ham yoʻq).
// Telegram soʻrovlari: X-Telegram-Bot-Api-Secret-Token = crm_maxfiy.tg_webhook.
// Ichki soʻrovlar (baza triggeri, sozlash): x-crm-secret = crm_maxfiy.tg_ichki.
// Rollar (tg_chatlar.rol): owner — hamma havola, adminlarni tasdiqlaydi/oladi (/adminlar); admin — faqat CRM va lid xabarlari.
// Yangi odam Start bosadi → owner'ga tasdiqlash tugmali soʻrov boradi; tasdiqlanmaguncha bot unga hech narsa koʻrsatmaydi.

const HEAD = { "Content-Type": "application/json; charset=utf-8" };
const SITE = "https://platform770uz-dev.github.io/zamonaviy-kasblar/";
const PAGES_OWNER: [string, string][][] = [
  [["📋 CRM", "crm.html"], ["👥 Nomzodlar", "admin.html"]],
  [["📝 Administrator vakansiyasi", "ishga.html"]],
  [["🎓 Brend-feys ustozi", "ustoz.html"], ["🎥 Mobilografiya ustozi", "mobilograf-ustoz.html"]],
  [["🎬 Mobilograf boʻlish", "mobilograf.html"]],
];
const PAGES_ADMIN: [string, string][][] = [[["📋 CRM", "crm.html"]]];
const BTN_OWNER = "📋 Menyu";
const BTN_ADMIN = "📋 CRM";
const MAX_PENDING = 5; // kutayotgan begonalar chegarasi: spamdan himoya

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const json = (o: Record<string, unknown>, status = 200) => new Response(JSON.stringify(o), { status, headers: HEAD });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kb = (pages: [string, string][][]) => ({ inline_keyboard: pages.map((row) => row.map(([text, page]) => ({ text, url: SITE + page }))) });
const menuOwner = kb(PAGES_OWNER);
const menuAdmin = kb(PAGES_ADMIN);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Token har chaqiruvda oʻqiladi — secret keyin qoʻshilsa ham qayta deploy kerak emas.
// Xato matnida URL (tokeni bilan) boʻlishi mumkin — tashqariga chiqmasin.
async function tg(method: string, payload: Record<string, unknown> = {}): Promise<any> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN yoʻq" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: String(e).replaceAll(token, "***").slice(0, 200) };
  }
}

const send = (chat_id: number, text: string, reply_markup?: unknown) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(reply_markup ? { reply_markup } : {}) });

const who = (r: { ism: string | null; username: string | null }, id: number) =>
  `${esc(r.ism || "—")}${r.username ? ` (@${esc(r.username)})` : ""} · <code>${id}</code>`;

async function askOwners(id: number, r: { ism: string | null; username: string | null }) {
  const { data: owners } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true);
  const buttons = { inline_keyboard: [[{ text: "✅ Подтвердить", callback_data: `ok:${id}` }, { text: "🚫 Отклонить", callback_data: `no:${id}` }]] };
  for (const o of owners ?? []) await send(o.chat_id, `🔔 <b>Новая заявка на доступ к боту</b>\n👤 ${who(r, id)}`, buttons);
}

async function listPeople(chatId: number) {
  const { data: rows } = await sb.from("tg_chatlar").select("chat_id, ism, username, rol, tasdiqlangan, bloklangan").order("created_at").limit(30);
  const others = (rows ?? []).filter((r) => r.rol !== "owner");
  if (!others.length) return await send(chatId, "Пока никого нет. Человек нажимает Start у бота — вам приходит заявка.");
  await send(chatId, `👥 Людей в боте: ${others.length}`);
  for (const r of others) {
    const st = r.tasdiqlangan ? "✅ админ" : r.bloklangan ? "🚫 отклонён" : "⏳ ждёт подтверждения";
    const btns = r.tasdiqlangan
      ? [{ text: "🚫 Убрать доступ", callback_data: `no:${r.chat_id}` }]
      : r.bloklangan
      ? [{ text: "✅ Подтвердить", callback_data: `ok:${r.chat_id}` }]
      : [{ text: "✅ Подтвердить", callback_data: `ok:${r.chat_id}` }, { text: "🚫 Отклонить", callback_data: `no:${r.chat_id}` }];
    await send(chatId, `${st}\n👤 ${who(r, r.chat_id)}`, { inline_keyboard: [btns] });
  }
}

async function onMessage(m: any) {
  if (!m?.chat || m.chat.type !== "private" || typeof m.text !== "string") return;
  const chatId = Number(m.chat.id);
  const ism = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ").slice(0, 120) || null;
  const username = m.from?.username ? String(m.from.username).slice(0, 64) : null;
  const text = m.text.trim();

  const { data: row } = await sb.from("tg_chatlar").select("rol, tasdiqlangan, bloklangan").eq("chat_id", chatId).maybeSingle();
  if (!row) {
    // Yangi odam: soʻrov yaratamiz va owner'ga tasdiqlashga yuboramiz (kutayotganlar juda koʻp boʻlsa — jim)
    const { count } = await sb.from("tg_chatlar").select("chat_id", { count: "exact", head: true }).eq("tasdiqlangan", false).eq("bloklangan", false);
    if ((count ?? 0) >= MAX_PENDING) return;
    const ins = await sb.from("tg_chatlar").insert({ chat_id: chatId, ism, username });
    if (!ins.error) await askOwners(chatId, { ism, username });
    await send(chatId, "⏳ Soʻrovingiz egasiga yuborildi. Tasdiqlangach, shu yerda xabar keladi.");
    return;
  }
  await sb.from("tg_chatlar").update({ ism, username }).eq("chat_id", chatId);
  if (row.bloklangan) return; // rad etilgan — jim
  if (!row.tasdiqlangan) {
    await send(chatId, "⏳ Soʻrovingiz hali tasdiqlanmagan. Egasi tasdiqlagach, xabar keladi.");
    return;
  }

  const owner = row.rol === "owner";
  if (owner && /^\/adminlar(@\w+)?$/.test(text)) return await listPeople(chatId);
  if (/^\/start/.test(text)) {
    await send(
      chatId,
      owner
        ? "👑 Вы владелец бота.\n• Кнопки ниже — все ссылки\n• /adminlar — подтвердить или убрать админов\n• Уведомления о новых лидах приходят сюда"
        : "✅ Tasdiqlandingiz! Tashqaridan yangi lid tushsa, shu yerga xabar keladi. Pastdagi «📋 CRM» tugmasi CRM'ni ochadi.",
      { keyboard: [[{ text: owner ? BTN_OWNER : BTN_ADMIN }]], resize_keyboard: true, is_persistent: true },
    );
  }
  await send(chatId, "Kerakli boʻlimni tanlang:", owner ? menuOwner : menuAdmin);
}

async function onCallback(cq: any) {
  const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: cq.id, text });
  const { data: me } = await sb.from("tg_chatlar").select("rol, tasdiqlangan").eq("chat_id", Number(cq.from?.id)).maybeSingle();
  if (me?.rol !== "owner" || !me.tasdiqlangan) { await answer("Нет доступа"); return; }
  const m = /^(ok|no):(\d{1,15})$/.exec(String(cq.data ?? ""));
  if (!m) { await answer("?"); return; }
  const id = Number(m[2]);
  const { data: t } = await sb.from("tg_chatlar").select("ism, username, rol").eq("chat_id", id).maybeSingle();
  if (!t || t.rol === "owner") { await answer("Не найдено"); return; }

  const yes = m[1] === "ok";
  await sb.from("tg_chatlar").update({ tasdiqlangan: yes, bloklangan: !yes }).eq("chat_id", id);
  if (yes) {
    await send(id, "✅ Tasdiqlandingiz! Tashqaridan yangi lid tushsa, shu yerga xabar keladi. Pastdagi «📋 CRM» tugmasi CRM'ni ochadi.", { keyboard: [[{ text: BTN_ADMIN }]], resize_keyboard: true, is_persistent: true });
    await send(id, "Kerakli boʻlimni tanlang:", menuAdmin);
  }
  if (cq.message?.chat?.id && cq.message?.message_id) {
    await tg("editMessageText", {
      chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: "HTML",
      text: `${yes ? "✅ Подтверждён" : "🚫 Отклонён / доступ убран"}\n👤 ${who(t, id)}`,
      reply_markup: { inline_keyboard: [] },
    });
  }
  await answer(yes ? "Подтверждён" : "Отклонён");
}

function card(d: any, note: string | undefined, test: boolean) {
  const k = d.crm_kontaktlar ?? {};
  const out = [`${test ? "🧪 TEST · " : ""}🆕 <b>Yangi lid</b>`, `👤 ${esc(k.ism || d.nom)}`];
  if (k.telefon) out.push(`📞 ${esc(k.telefon)}`);
  const tgu = String(k.telegram ?? "").trim().replace(/^(https?:\/\/)?((t|telegram)\.me\/)?@?/i, "");
  if (/^[A-Za-z0-9_]{5,32}$/.test(tgu)) out.push(`✈️ <a href="https://t.me/${tgu}">@${tgu}</a>`);
  else if (k.telegram) out.push(`✈️ ${esc(k.telegram)}`);
  out.push(`🗂 ${esc(d.crm_voronkalar?.nom ?? "—")} → ${esc(d.crm_bosqichlar?.nom ?? "—")}`);
  if (d.manba) out.push(`📍 ${esc(d.manba)}`);
  if (Number(d.byudjet) > 0) out.push(`💰 ${Number(d.byudjet).toLocaleString("ru-RU")}`);
  if (note) out.push("", esc(note.slice(0, 1500)));
  return out.join("\n");
}

async function notify(body: any) {
  const ids: number[] = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((x: number) => Number.isSafeInteger(x) && x > 0).slice(0, 20);
  const soni = Math.max(Number(body.soni) || 0, ids.length);
  const { data: chats } = await sb.from("tg_chatlar").select("chat_id").eq("tasdiqlangan", true);
  if (!chats?.length || !soni) return json({ ok: true, kartalar: 0, sent: 0 });

  const texts: string[] = [];
  if (soni > 5) texts.push(`📥 CRM'ga birdaniga <b>${soni}</b> ta yangi lid tushdi.`);
  else {
    // crm-lead forma javoblarini crm_tarix'ga bitimdan keyin yozadi — biroz kutamiz
    await new Promise((r) => setTimeout(r, 2000));
    const [{ data: deals }, { data: notes }] = await Promise.all([
      sb.from("crm_bitimlar").select("id, nom, byudjet, manba, crm_voronkalar(nom), crm_bosqichlar(nom), crm_kontaktlar(ism, telefon, telegram)").in("id", ids).order("id"),
      sb.from("crm_tarix").select("bitim_id, matn").in("bitim_id", ids).eq("turi", "tizim").order("id"),
    ]);
    for (const d of deals ?? []) texts.push(card(d, notes?.find((n) => n.bitim_id === d.id)?.matn, body.test === true));
  }
  const btn = { inline_keyboard: [[{ text: "📋 CRM'da ochish", url: SITE + "crm.html" }]] };
  let sent = 0;
  for (const c of chats) for (const t of texts) if ((await send(c.chat_id, t, btn)).ok) sent++;
  return json({ ok: true, kartalar: texts.length, sent });
}

// ishga.html testini topshirgan nomzod — faqat owner'ga (bu yollash masalasi, adminlarga koʻrsatilmaydi)
async function notifyNomzod(body: any) {
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "bad id" }, 400);
  const { data: n } = await sb.from("nomzodlar").select("ism, telefon, vakansiya, test_sek").eq("id", id).maybeSingle();
  const { data: owners } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true);
  if (!n || !owners?.length) return json({ ok: true, sent: 0 });
  const sek = Number(n.test_sek);
  const text = [
    "🧑‍💼 <b>Новый кандидат — тест пройден</b>",
    `👤 ${esc(n.ism)}`,
    `📞 ${esc(n.telefon)}`,
    `💼 ${esc(n.vakansiya)}`,
    ...(Number.isFinite(sek) && n.test_sek != null ? [`⏱ Время теста: ${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, "0")}`] : []),
    "",
    "Баллы и красные флаги — в разделе «Nomzodlar».",
  ].join("\n");
  const btn = { inline_keyboard: [[{ text: "👥 Nomzodlar", url: SITE + "admin.html" }]] };
  let sent = 0;
  for (const o of owners) if ((await send(o.chat_id, text, btn)).ok) sent++;
  return json({ ok: true, sent });
}

async function setup(body: any, webhookSecret: string | undefined) {
  if (!webhookSecret) return json({ ok: false, qadam: "tg_webhook kaliti yoʻq" }, 500);
  const me = await tg("getMe");
  if (!me.ok) return json({ ok: false, qadam: "getMe", xato: me.description }, 400);
  const hook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-bot`;
  const info = await tg("getWebhookInfo");
  const cur = String(info.result?.url ?? "");
  // Bot boshqa joyga ulangan boʻlsa — ustidan yozmaymiz (faqat majburiy: true bilan)
  if (cur && cur !== hook && body.majburiy !== true) {
    let host = "?";
    try { host = new URL(cur).host; } catch { /* notoʻgʻri URL */ }
    return json({ ok: false, qadam: "band", bot: me.result.username, webhook_host: host }, 409);
  }
  const wh = await tg("setWebhook", { url: hook, secret_token: webhookSecret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  // Boshqa loyihadan qolgan buyruqlar va menyu tugmasini tozalaymiz
  for (const scope of [{ type: "default" }, { type: "all_private_chats" }]) {
    for (const language_code of ["", "ru", "uz", "en"]) await tg("deleteMyCommands", { scope, ...(language_code ? { language_code } : {}) });
  }
  const cmd = await tg("setMyCommands", { commands: [{ command: "menu", description: "Havolalar menyusi" }] });
  const { data: owners } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner");
  for (const o of owners ?? []) {
    await tg("setMyCommands", {
      scope: { type: "chat", chat_id: o.chat_id },
      commands: [{ command: "menu", description: "Меню ссылок" }, { command: "adminlar", description: "Админы: подтвердить / убрать" }],
    });
  }
  const mb = await tg("setChatMenuButton", { menu_button: { type: "commands" } });
  const desc = await tg("getMyDescription");
  const sdesc = await tg("getMyShortDescription");
  return json({
    ok: wh.ok === true, bot: me.result.username, nom: me.result.first_name, webhook: wh.description,
    commands: cmd.ok === true, menu_button: mb.ok === true,
    tavsif: desc.result?.description ?? "", qisqa_tavsif: sdesc.result?.short_description ?? "",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const { data: rows } = await sb.from("crm_maxfiy").select("kalit, qiymat").in("kalit", ["tg_webhook", "tg_ichki"]);
  const sec: Record<string, string> = Object.fromEntries((rows ?? []).map((r) => [r.kalit, r.qiymat]));
  const tgSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const crmSecret = req.headers.get("x-crm-secret") ?? "";
  const fromTelegram = !!tgSecret && !!sec.tg_webhook && safeEqual(tgSecret, sec.tg_webhook);
  const internal = !!crmSecret && !!sec.tg_ichki && safeEqual(crmSecret, sec.tg_ichki);
  if (!fromTelegram && !internal) return json({ error: "unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  if (fromTelegram) {
    try {
      if (body?.callback_query) await onCallback(body.callback_query);
      else await onMessage(body?.message);
    } catch (e) { console.error("tg update:", String(e).slice(0, 200)); }
    return json({ ok: true }); // Telegram'ga doim 200 — aks holda u shu yangilanishni qayta-qayta yuboradi
  }
  if (body?.turi === "setup") return await setup(body, sec.tg_webhook);
  if (body?.turi === "yangi_lid") return await notify(body);
  if (body?.turi === "yangi_nomzod") return await notifyNomzod(body);
  return json({ error: "nomaʼlum turi" }, 400);
});
