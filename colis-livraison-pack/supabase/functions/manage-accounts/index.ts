import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const text = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === authorization) return json({ error: "Connexion requise." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  let secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    secretKey = keys.default ?? secretKey;
  } catch {
    // Older projects expose only SUPABASE_SERVICE_ROLE_KEY.
  }
  if (!supabaseUrl || !secretKey) return json({ error: "Configuration serveur incomplète." }, 500);

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Session invalide." }, 401);
  const callerId = authData.user.id;

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Données de requête invalides." }, 400);
  }

  const action = input.action;
  const email = text(input.email, 254).toLowerCase();
  const fullName = text(input.fullName, 120);
  const phone = text(input.phone, 40) || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || fullName.length < 2) {
    return json({ error: "Indique un nom complet et une adresse e-mail valide." }, 400);
  }

  let inviteRole: "admin" | "courier";
  let companyId: string | null = null;
  let companyName = "";

  if (action === "create_company_admin") {
    const { data: owner, error: ownerError } = await admin
      .from("platform_owners")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();
    if (ownerError || !owner) return json({ error: "Seul le compte propriétaire peut créer une société." }, 403);

    companyName = text(input.companyName, 120);
    if (companyName.length < 2) return json({ error: "Le nom de la société est obligatoire." }, 400);
    inviteRole = "admin";
  } else if (action === "create_courier") {
    const { data: member, error: memberError } = await admin
      .from("company_members")
      .select("company_id, role, active")
      .eq("user_id", callerId)
      .maybeSingle();
    if (memberError || !member || member.role !== "admin" || !member.active) {
      return json({ error: "Seul un administrateur actif peut inviter un livreur." }, 403);
    }
    companyId = member.company_id;
    inviteRole = "courier";
  } else {
    return json({ error: "Type de compte inconnu." }, 400);
  }

  const siteUrl = Deno.env.get("SITE_URL");
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    ...(siteUrl ? { redirectTo: siteUrl } : {}),
    data: { full_name: fullName },
  });
  if (inviteError || !invited.user) {
    return json({ error: inviteError?.message ?? "L’invitation n’a pas pu être envoyée." }, 400);
  }

  const provision = inviteRole === "admin"
    ? await admin.rpc("provision_company_admin", {
      p_user_id: invited.user.id,
      p_company_name: companyName,
      p_full_name: fullName,
      p_phone: phone,
    })
    : await admin.rpc("provision_courier", {
      p_user_id: invited.user.id,
      p_company_id: companyId,
      p_full_name: fullName,
      p_phone: phone,
    });

  if (provision.error) {
    await admin.auth.admin.deleteUser(invited.user.id);
    console.error("Account provisioning failed:", provision.error.message);
    return json({ error: "Le compte n’a pas pu être finalisé. Vérifie que l’e-mail n’est pas déjà utilisé." }, 500);
  }

  return json({
    ok: true,
    role: inviteRole,
    email,
    message: inviteRole === "admin"
      ? "Société créée. L’administrateur recevra un e-mail pour activer son compte."
      : "Livreur ajouté. Il recevra un e-mail pour activer son compte.",
  }, 201);
});
