const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-autopilot-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function supabaseRequest(url: string, key: string, bearer: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
      ...(init.body ? { "Content-Type": "application/json", Prefer: "return=minimal" } : {}),
      ...init.headers,
    },
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function description(row: Record<string, unknown>) {
  const source = normalizeText(row.seo_description) || normalizeText(row.excerpt) || normalizeText(row.content);
  if (!source) return "";
  return source.length > 155 ? `${source.slice(0, 152).replace(/\s+\S*$/, "").trim()}…` : source;
}

async function run(request: Request) {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!projectUrl || !publishableKey) return json({ error: "Supabase işlev yapılandırması eksik." }, 503);

  const workerSecret = Deno.env.get("SEO_AUTOPILOT_SECRET");
  const suppliedSecret = request.headers.get("x-autopilot-secret") || "";
  const cronAuthorized = !!workerSecret && suppliedSecret.length === workerSecret.length && suppliedSecret === workerSecret;
  const authorization = request.headers.get("Authorization") || "";
  let bearer = "";
  let adminAuthorized = false;

  if (!cronAuthorized && /^Bearer\s+\S+$/i.test(authorization)) {
    bearer = authorization.replace(/^Bearer\s+/i, "");
    const userResponse = await supabaseRequest(`${projectUrl}/auth/v1/user`, publishableKey, bearer);
    if (userResponse.ok) {
      const user = await userResponse.json();
      const params = new URLSearchParams({ select: "user_id", user_id: `eq.${user.id}`, limit: "1" });
      const adminResponse = await supabaseRequest(`${projectUrl}/rest/v1/admin_users?${params}`, publishableKey, bearer);
      if (adminResponse.ok) adminAuthorized = (await adminResponse.json()).length > 0;
    }
  }

  if (!cronAuthorized && !adminAuthorized) return json({ error: "Yalnızca oturum açmış site yöneticisi çalıştırabilir." }, 401);
  let body: { mode?: string };
  try { body = await request.json(); } catch { return json({ error: "İstek gövdesi geçerli JSON olmalıdır." }, 400); }
  if (body.mode !== "audit-and-fix") return json({ error: "Desteklenmeyen işlem." }, 400);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  const dbKey = cronAuthorized ? (serviceKey || publishableKey) : publishableKey;
  const dbBearer = cronAuthorized ? (serviceKey || publishableKey) : bearer;
  const query = new URLSearchParams({
    select: "id,title,excerpt,content,seo_title,seo_description,status",
    status: "eq.published",
    order: "updated_at.desc",
    limit: "250",
  });
  const rowsResponse = await supabaseRequest(`${projectUrl}/rest/v1/articles?${query}`, dbKey, dbBearer);
  if (!rowsResponse.ok) return json({ error: "Yayımlanmış makaleler okunamadı.", status: rowsResponse.status }, 502);
  const rows = await rowsResponse.json() as Array<Record<string, unknown>>;
  const plans = rows.map((row) => ({
    row,
    title: normalizeText(row.seo_title) || normalizeText(row.title).slice(0, 60),
    description: description(row),
  })).filter(({ row, title, description: desc }) => (!normalizeText(row.seo_title) && title) || (!normalizeText(row.seo_description) && desc));

  let fixed = 0;
  const canWrite = adminAuthorized || !!serviceKey;
  if (canWrite) {
    for (const plan of plans) {
      const patch: Record<string, string> = {};
      if (!normalizeText(plan.row.seo_title) && plan.title) patch.seo_title = plan.title;
      if (!normalizeText(plan.row.seo_description) && plan.description) patch.seo_description = plan.description;
      if (!Object.keys(patch).length) continue;
      const params = new URLSearchParams({ id: `eq.${plan.row.id}`, status: "eq.published" });
      const update = await supabaseRequest(`${projectUrl}/rest/v1/articles?${params}`, dbKey, dbBearer, { method: "PATCH", body: JSON.stringify(patch) });
      if (!update.ok) return json({ error: "SEO alanları kaydedilemedi.", status: update.status, fixed }, 502);
      fixed++;
    }
  }

  return json({
    ok: true,
    scanned: rows.length,
    candidates: plans.length,
    fixed,
    skipped: plans.length > 0 && !canWrite,
    message: plans.length > 0 && !canWrite ? "SEO taraması tamamlandı; otomatik düzeltme için Supabase service-role function secret yapılandırılmalıdır." : "SEO taraması ve güvenli metadata düzeltmesi tamamlandı.",
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Sadece POST isteği kabul edilir." }, 405);
  try { return await run(request); }
  catch (error) {
    console.error("SEO autopilot failed", error instanceof Error ? error.message : String(error));
    return json({ error: "SEO kontrolü sırasında beklenmeyen hata oluştu." }, 500);
  }
});
