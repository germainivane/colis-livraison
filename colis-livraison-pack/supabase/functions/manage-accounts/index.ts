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
  const siteUrl = Deno.env.get("SITE_URL");

  const requireOwner = async () => {
    const { data, error } = await admin
      .from("platform_owners")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();
    return !error && Boolean(data);
  };

  if (action === "list_companies") {
    if (!(await requireOwner())) return json({ error: "Seul le compte propriétaire peut consulter les sociétés." }, 403);
    const { data: companies, error: companiesError } = await admin
      .from("companies")
      .select("id,name,created_at")
      .order("created_at", { ascending: false });
    if (companiesError) return json({ error: "La liste des sociétés n’a pas pu être chargée." }, 500);

    const { data: admins, error: adminsError } = await admin
      .from("company_members")
      .select("user_id,company_id,full_name,active")
      .eq("role", "admin");
    if (adminsError) return json({ error: "Les administrateurs des sociétés n’ont pas pu être chargés." }, 500);

    const rows = await Promise.all((companies ?? []).map(async (company) => {
      const member = (admins ?? []).find((item) => item.company_id === company.id);
      if (!member) return null;
      const { data: authUserData } = await admin.auth.admin.getUserById(member.user_id);
      const authUser = authUserData?.user;
      return {
        company_id: company.id,
        company_name: company.name,
        created_at: company.created_at,
        admin_user_id: member.user_id,
        admin_name: member.full_name,
        admin_email: authUser?.email ?? "Adresse indisponible",
        activated: Boolean(authUser?.email_confirmed_at),
        active: member.active,
      };
    }));
    return json({ companies: rows.filter(Boolean) });
  }

  if (action === "reissue_admin_link") {
    if (!(await requireOwner())) return json({ error: "Seul le compte propriétaire peut récupérer ce lien." }, 403);
    const userId = text(input.userId, 80);
    if (!userId) return json({ error: "Compte administrateur introuvable." }, 400);
    const { data: member, error: memberError } = await admin
      .from("company_members")
      .select("user_id,role,full_name")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (memberError || !member) return json({ error: "Aucun administrateur correspondant à cette société." }, 404);

    const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(member.user_id);
    const authUser = authUserData?.user;
    if (authUserError || !authUser?.email) return json({ error: "Le compte administrateur est introuvable." }, 404);
    const { data: recovery, error: recoveryError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: authUser.email,
      options: {
        ...(siteUrl ? { redirectTo: siteUrl } : {}),
      },
    });
    if (recoveryError || !recovery.properties.action_link) {
      return json({ error: recoveryError?.message ?? "Le lien de récupération n’a pas pu être créé." }, 400);
    }
    return json({ ok: true, email: authUser.email, activationUrl: recovery.properties.action_link });
  }

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
    if (!(await requireOwner())) return json({ error: "Seul le compte propriétaire peut créer une société." }, 403);

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

  // Generate a one-time invite link without sending email. The owner/admin
  // shares this link privately with the intended recipient.
  const { data: invitation, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      ...(siteUrl ? { redirectTo: siteUrl } : {}),
      data: { full_name: fullName },
    },
  });
  if (inviteError || !invitation.user || !invitation.properties.action_link) {
    return json({
      error: inviteError?.message ?? "Le lien d’activation n’a pas pu être créé. Vérifie si cette adresse a déjà un compte dans Supabase.",
    }, 400);
  }

  const provision = inviteRole === "admin"
    ? await admin.rpc("provision_company_admin", {
      p_user_id: invitation.user.id,
      p_company_name: companyName,
      p_full_name: fullName,
      p_phone: phone,
    })
    : await admin.rpc("provision_courier", {
      p_user_id: invitation.user.id,
      p_company_id: companyId,
      p_full_name: fullName,
      p_phone: phone,
    });

  if (provision.error) {
    await admin.auth.admin.deleteUser(invitation.user.id);
    console.error("Account provisioning failed:", provision.error.message);
    return json({ error: "Le compte n’a pas pu être finalisé. Vérifie que l’e-mail n’est pas déjà utilisé." }, 500);
  }

  return json({
    ok: true,
    role: inviteRole,
    email,
    message: inviteRole === "admin"
      ? "Société créée. Le lien d’activation est prêt à partager avec l’administrateur."
      : "Livreur ajouté. Le lien d’activation est prêt à partager avec le livreur.",
    invitationUrl: invitation.properties.action_link,
  }, 201);
});
