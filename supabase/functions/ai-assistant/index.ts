const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const MODELS = ["gemini-3.6-flash", "gemini-3-flash-preview"];
const MAX_PROMPT_LENGTH = 20_000;
const REQUEST_TIMEOUT_MS = 45_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function callGemini(model: string, key: string, prompt: string, signal: AbortSignal) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
    signal,
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Sadece POST isteği kabul edilir." }, 405);

  // Supabase's publishable key is intentionally public. Enforce admin identity
  // in the function itself so a public key alone cannot spend the Gemini quota.
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!projectUrl || !supabaseKey) return json({ error: "Supabase kimlik doğrulama ayarı eksik." }, 503);
  if (!bearer) return json({ error: "Gemini özelliği için yönetici oturumu gerekli." }, 401);
  try {
    const userResponse = await fetch(`${projectUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(6_000),
    });
    if (!userResponse.ok) return json({ error: "Yönetici oturumu geçersiz veya süresi dolmuş." }, 401);
    const user = await userResponse.json();
    const adminQuery = new URLSearchParams({ select: "user_id", user_id: `eq.${user.id}`, limit: "1" });
    const adminResponse = await fetch(`${projectUrl}/rest/v1/admin_users?${adminQuery}`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(6_000),
    });
    if (!adminResponse.ok) return json({ error: "Yönetici yetkisi doğrulanamadı." }, 503);
    if ((await adminResponse.json()).length === 0) return json({ error: "Bu özellik yalnızca site yöneticilerine açıktır." }, 403);
  } catch {
    return json({ error: "Yönetici oturumu doğrulanamadı. Bağlantıyı kontrol edip yeniden deneyin." }, 503);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "Gemini bağlantısı yapılandırılmamış. Yönetici Supabase işlev sırlarını kontrol etmelidir." }, 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "İstek gövdesi geçerli JSON olmalıdır." }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  if (!prompt) return json({ error: "prompt alanı zorunludur." }, 400);
  if (prompt.length > MAX_PROMPT_LENGTH || systemPrompt.length > MAX_PROMPT_LENGTH) {
    return json({ error: "İstek çok uzun. Konuyu veya ek talimatı kısaltıp tekrar deneyin." }, 413);
  }

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\nKullanıcı isteği:\n${prompt}` : prompt;
  let lastStatus = 503;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    for (const [modelIndex, model] of MODELS.entries()) {
      // Provider overload/rate limits move directly to the fallback model.
      // A single quick retry is reserved for transient 5xx/network failures.
      for (let attempt = 0; attempt < 2; attempt++) {
        let response: Response;
        try {
          response = await callGemini(model, apiKey, fullPrompt, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) return json({ error: "Gemini isteği zaman aşımına uğradı. Biraz sonra yeniden deneyin." }, 504);
          console.error("Gemini connection failure", { model, attempt, error: String(error).slice(0, 300) });
          lastStatus = 502;
          if (attempt === 0) continue;
          break;
        }

        let result: Record<string, unknown> = {};
        try { result = await response.json(); } catch { /* handled below */ }
        if (response.ok) {
          const candidates = result.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
          const output = candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
          if (output) return json({ success: true, text: output, model });
          console.error("Gemini returned no text", { model, finishReason: (candidates?.[0] as any)?.finishReason });
          lastStatus = 502;
          break;
        }

        lastStatus = response.status;
        const errorObj = result.error as { message?: string; status?: string } | undefined;
        console.error("Gemini provider response", { model, status: response.status, providerStatus: errorObj?.status });
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          return json({ error: "Gemini ayarları isteği kabul etmedi. Yönetici API anahtarını ve model erişimini kontrol etmelidir.", status: response.status }, 502);
        }
        if ([429, 503].includes(response.status)) break;
        if (response.status >= 500 && attempt === 0) continue;
        break;
      }
      if (modelIndex < MODELS.length - 1) console.warn("Switching to Gemini fallback model", { from: model });
    }

    const status = lastStatus === 429 ? 429 : 503;
    return json({ error: status === 429
      ? "Gemini kullanım sınırına ulaşıldı. Biraz bekleyip daha küçük bir toplu üretim deneyin."
      : "Gemini modelleri şu anda yoğun veya geçici olarak erişilemiyor. Biraz sonra yeniden deneyin.", status: lastStatus }, status);
  } finally {
    clearTimeout(timeout);
  }
});
