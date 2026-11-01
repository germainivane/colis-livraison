import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const config = window.COLIS_SUPABASE || {};
const supabaseReady = Boolean(config.url && config.publishableKey && !config.publishableKey.includes('COLLER_LA_CLE'));
const supabase = supabaseReady ? createClient(config.url, config.publishableKey) : null;
const $ = (selector) => document.querySelector(selector);
let deliveries = [];
let couriers = [];
let user = null;
let profile = null;
let role = 'admin';
let view = 'login';
let loginRole = 'admin';
let adminPage = 'overview';
let courierPage = 'missions';
let filter = 'Tous';
let searchTerm = '';
let accountModal = null;
let ownerCompanies = [];
let ownerCompaniesError = '';
let generatedInvite = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem('colisPendingInvite') || 'null');
    return saved && saved.creatorId && Date.now() - saved.createdAt < 24 * 60 * 60 * 1000 ? saved : null;
  } catch { return null; }
})();
let needsPasswordSetup = window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery') || window.location.hash.includes('type=magiclink');

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const initials = (name = '') => name === 'À attribuer' ? '?' : name.split(/[ .]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const statusClass = (status) => status === 'En cours' ? 'progress' : ['À récupérer', 'À attribuer'].includes(status) ? 'waiting' : status === 'Livrée' ? 'done' : '';
const formatTime = (value) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

function showError(error, fallback = 'Une erreur est survenue. Réessaie.') {
  console.error(error);
  toast(error?.message || fallback);
}

function navItems() {
  if (role === 'owner') return [['companies', '▦', 'Sociétés']];
  return role === 'admin'
    ? [['overview', '▦', 'Vue d’ensemble'], ['deliveries', '◉', 'Livraisons'], ['team', '♙', 'Livreurs']]
    : [['missions', '▣', 'Mes missions'], ['history', '◷', 'Historique']];
}

function setPage(page) {
  if (role === 'admin') adminPage = page;
  if (role === 'courier') courierPage = page;
  render();
}

function showLogin(forRole = 'admin') {
  role = 'admin';
  view = 'login';
  loginRole = forRole === 'courier' ? 'courier' : 'admin';
  window.location.hash = loginRole === 'admin' ? 'connexion-administrateur' : 'connexion-livreur';
  render();
}

function metrics() {
  return {
    total: deliveries.length,
    pending: deliveries.filter((item) => ['À attribuer', 'À récupérer'].includes(item.status)).length,
    progress: deliveries.filter((item) => item.status === 'En cours').length,
    done: deliveries.filter((item) => item.status === 'Livrée').length,
  };
}

function heading(eyebrow, title, subtitle, action = '') {
  return `<div class="heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${action}</div>`;
}

function metricCard(label, value, note, icon) {
  return `<div class="metric"><div class="metric-top">${label}<span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`;
}

function currentCourierId() { return user?.id; }

function filteredDeliveries(source = deliveries) {
  const query = searchTerm.trim().toLowerCase();
  return source.filter((item) => (filter === 'Tous' || item.status === filter) && (!query || [item.reference, item.recipient_name, item.recipient_phone, item.pickup_address, item.dropoff_address, item.courier_name].some((value) => String(value || '').toLowerCase().includes(query))));
}

function deliveryRow(item, canAssign = false) {
  const courierCell = canAssign && item.status !== 'Livrée'
    ? `<select class="assign-select" data-assign="${item.id}" aria-label="Attribuer un livreur"><option value="">À attribuer</option>${couriers.filter((courier) => courier.active).map((courier) => `<option value="${courier.user_id}" ${item.courier_id === courier.user_id ? 'selected' : ''}>${escapeHtml(courier.full_name)}</option>`).join('')}</select>`
    : `<div class="courier"><div class="avatar">${initials(item.courier_name || 'À attribuer')}</div><div class="courier-name">${escapeHtml(item.courier_name || 'À attribuer')}</div></div>`;
  return `<tr><td><div class="order-id">${escapeHtml(item.reference)}</div><div class="route">${formatTime(item.created_at)} · ${escapeHtml(item.parcel_type)}</div></td><td><div style="font-weight:600">${escapeHtml(item.recipient_name)}</div><div class="route">${escapeHtml(item.recipient_phone)}</div></td><td><div>${escapeHtml(item.pickup_address)}</div><div class="route">→ ${escapeHtml(item.dropoff_address)}</div></td><td>${courierCell}</td><td><span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td></tr>`;
}

function tablePanel(rows, { controls = true, assign = false } = {}) {
  return `<section class="panel"><div class="panel-head"><div><h2>${role === 'admin' ? 'Suivi des livraisons' : 'Détail des missions'}</h2><div class="route" style="margin-top:5px">${role === 'admin' ? 'Retrouvez les commandes de votre société' : 'Adresse, destinataire et progression de vos courses'}</div></div>${role === 'admin' ? '<button class="button secondary small" id="exportOrders">↓　Exporter</button>' : ''}</div>${controls ? `<div class="table-tools"><label class="search"><input id="orderSearch" placeholder="N° commande, nom, adresse…" value="${escapeHtml(searchTerm)}"></label><div class="filters">${['Tous', 'À attribuer', 'À récupérer', 'En cours', 'Livrée'].map((item) => `<button class="filter ${filter === item ? 'active' : ''}" data-filter="${item}">${item}</button>`).join('')}</div></div>` : ''}<div class="table-wrap"><table><thead><tr><th>Commande</th><th>Destinataire</th><th>Itinéraire</th><th>Livreur</th><th>Statut</th></tr></thead><tbody>${rows.length ? rows.map((item) => deliveryRow(item, assign)).join('') : '<tr><td colspan="5" class="empty">Aucune livraison à afficher.</td></tr>'}</tbody></table></div></section>`;
}

function activityPanel() {
  const active = couriers.filter((item) => item.active);
  return `<section class="panel"><div class="panel-head"><div><h2>Équipe de livraison</h2><div class="route" style="margin-top:5px">${active.length} livreur(s) actif(s)</div></div><button class="link-button" data-goto="team">Voir l’équipe　→</button></div><div class="activity">${active.slice(0, 4).map((item) => `<div class="activity-item"><div class="avatar">${initials(item.full_name)}</div><div class="activity-text"><b>${escapeHtml(item.full_name)}</b><br>${escapeHtml(item.phone || 'Téléphone non renseigné')}<div class="activity-time">${deliveries.filter((delivery) => delivery.courier_id === item.user_id && ['En cours', 'À récupérer'].includes(delivery.status)).length} mission(s) en cours</div></div></div>`).join('')}</div></section>`;
}

function adminView() {
  const stats = metrics();
  if (adminPage === 'team') return `${heading('Votre société', 'Livreurs', 'Invitez les livreurs de votre équipe.', '<button class="button" id="addCourier">＋　Inviter un livreur</button>')}<section class="team-grid">${couriers.map((courier) => `<article class="team-card"><div class="team-card-head"><div class="avatar large">${initials(courier.full_name)}</div><span class="status ${courier.active ? '' : 'done'}">${courier.active ? 'Actif' : 'Désactivé'}</span></div><h2>${escapeHtml(courier.full_name)}</h2><div class="route">${escapeHtml(courier.phone || 'Téléphone non renseigné')}</div><div class="team-card-foot"><span>${deliveries.filter((item) => item.courier_id === courier.user_id && item.status === 'Livrée').length} livraisons terminées</span><div class="team-card-actions"><button class="button small secondary" data-reissue-courier="${escapeHtml(courier.user_id)}" ${courier.active ? '' : 'disabled'}>Récupérer le lien</button></div></div></article>`).join('') || '<div class="empty">Aucun livreur dans cette équipe.</div>'}</section>`;
  if (adminPage === 'deliveries') return `${heading('Opérations', 'Toutes les livraisons', 'Recherchez, filtrez et attribuez les commandes de votre société.', '<button class="button" id="openDelivery">＋　Nouvelle livraison</button>')}${tablePanel(filteredDeliveries(), { assign: true })}`;
  return `${heading('Espace administration', `Bonjour, ${escapeHtml(profile?.full_name?.split(' ')[0] || 'Administrateur')} <span style="font-size:23px">☀</span>`, 'Voici l’activité de votre société.', '<button class="button" id="openDelivery">＋　Nouvelle livraison</button>')}<section class="metrics">${metricCard('Livraisons', stats.total, 'Commandes enregistrées', '▣')}${metricCard('À prendre en charge', stats.pending, 'En attente de collecte', '◷')}${metricCard('En cours', stats.progress, 'Colis sur la route', '➜')}${metricCard('Livrées', stats.done, 'Remises confirmées', '✓')}</section><div class="columns">${tablePanel(filteredDeliveries(deliveries.slice(0, 5)), { controls: false })}${activityPanel()}</div>`;
}

function ownerView() {
  const companyRows = ownerCompanies.map((company) => `<article class="team-card"><div class="team-card-head"><div class="avatar large">${initials(company.company_name)}</div><span class="status ${company.active ? '' : 'done'}">${company.active ? (company.activated ? 'Société active' : 'Activation en attente') : 'Société désactivée'}</span></div><h2>${escapeHtml(company.company_name)}</h2><div class="route">Administrateur : ${escapeHtml(company.admin_name)} · ${escapeHtml(company.admin_email)}</div><div class="team-card-foot"><span>${company.active ? (company.activated ? 'L’administrateur a activé son compte.' : 'L’administrateur doit terminer l’activation.') : 'Accès bloqué · historique conservé'}</span><div class="team-card-actions"><button class="button small secondary" data-company-active="${escapeHtml(company.company_id)}" data-company-name="${escapeHtml(company.company_name)}" data-next-active="${company.active ? 'false' : 'true'}">${company.active ? 'Désactiver' : 'Réactiver'}</button>${company.active ? `<button class="button small" data-reissue-admin="${escapeHtml(company.admin_user_id)}">${company.activated ? 'Récupérer l’accès' : 'Récupérer le lien'}</button>` : ''}</div></div></article>`).join('');
  const emptyCompanies = ownerCompaniesError
    ? `<div class="empty">${escapeHtml(ownerCompaniesError)}</div>`
    : '<div class="empty">Aucune société créée pour le moment.</div>';
  return `${heading('Maintenance plateforme', 'Gestion des sociétés', 'Créez et suivez les espaces administrateur des sociétés.', '<button class="button" id="createCompanyAdmin">＋　Créer une société</button>')}<section class="panel"><div class="panel-head"><div><h2>Accès propriétaire</h2><div class="route" style="margin-top:5px">Seul ce compte peut gérer les administrateurs de société.</div></div></div><div class="activity"><div class="activity-item"><div class="avatar">${initials(profile?.full_name || user?.email || 'P')}</div><div class="activity-text"><b>${escapeHtml(profile?.full_name || 'Compte propriétaire')}</b><br>${escapeHtml(user?.email || '')}<div class="activity-time">Propriétaire plateforme</div></div></div></div></section><section class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>Sociétés enregistrées</h2><div class="route" style="margin-top:5px">${ownerCompanies.length} société(s)</div></div></div><div class="team-grid">${companyRows || emptyCompanies}</div></section>`;
}

function rememberInvite(invite) {
  generatedInvite = { ...invite, creatorId: user?.id, createdAt: Date.now() };
  try { sessionStorage.setItem('colisPendingInvite', JSON.stringify(generatedInvite)); } catch { /* The link still remains available in this page session. */ }
}

function clearRememberedInvite() {
  generatedInvite = null;
  try { sessionStorage.removeItem('colisPendingInvite'); } catch { /* Ignore storage restrictions. */ }
}

function courierCard(item, isAvailable) {
  const action = isAvailable
    ? `<button class="button small" data-accept="${item.id}">Accepter la mission</button>`
    : item.status === 'À récupérer'
      ? `<button class="button small" data-progress="${item.id}">Colis récupéré</button>`
      : item.status === 'En cours'
        ? `<button class="button small" data-complete="${item.id}">Confirmer la remise</button>` : '';
  return `<article class="mission-card"><div class="mission-main"><div class="job-top"><span class="job-id">${escapeHtml(item.reference)}</span><span class="job-age">· ${formatTime(item.created_at)} · ${escapeHtml(item.parcel_type)}</span><span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span></div><div class="job-route"><span class="route-dots"><i></i><i></i><i></i></span><span><b>${escapeHtml(item.pickup_address)}</b><br><span class="route">${escapeHtml(item.dropoff_address)}</span></span></div><div class="job-bottom"><span>Destinataire <b>${escapeHtml(item.recipient_name)}</b></span><span>☎ <b>${escapeHtml(item.recipient_phone)}</b></span></div></div><div class="mission-action">${action}</div></article>`;
}

function courierView() {
  const mine = deliveries.filter((item) => item.courier_id === currentCourierId());
  const available = deliveries.filter((item) => item.status === 'À attribuer' && !item.courier_id);
  const active = mine.filter((item) => ['À récupérer', 'En cours'].includes(item.status));
  const source = courierPage === 'history' ? mine.filter((item) => item.status === 'Livrée') : [...active, ...available];
  return `${heading('Espace livreur', courierPage === 'history' ? 'Historique des courses' : `Bonjour, ${escapeHtml(profile?.full_name?.split(' ')[0] || 'Livreur')} <span style="font-size:23px">👋</span>`, courierPage === 'history' ? 'Retrouvez les livraisons terminées.' : 'Vos missions du jour, au même endroit.')}<div class="courier-banner"><div><div class="eyebrow">Votre disponibilité</div><h2>Compte actif</h2><p>Les missions disponibles apparaissent dans votre espace.</p></div><div class="available">Disponible</div></div><section class="delivery-cards">${metricCard('Missions terminées', mine.filter((item) => item.status === 'Livrée').length, 'Au total', '✓')}${metricCard('À effectuer', active.length, 'Collecte ou livraison', '➜')}</section><div class="columns courier-columns"><section class="panel"><div class="panel-head"><div><h2>${courierPage === 'history' ? 'Courses terminées' : 'Missions à effectuer'}</h2><div class="route" style="margin-top:5px">${courierPage === 'history' ? 'Vos remises confirmées' : 'Acceptez une course et mettez son statut à jour'}</div></div><span class="status ${source.length ? 'progress' : 'done'}">${source.length} mission(s)</span></div>${source.length ? source.map((item) => courierCard(item, available.includes(item))).join('') : '<div class="empty">Aucune mission dans cette liste.</div>'}</section><section class="panel"><div class="panel-head"><div><h2>Les étapes</h2><div class="route" style="margin-top:5px">Suivez le statut de la course</div></div></div><div class="activity"><div class="activity-item"><div class="activity-icon">1</div><div class="activity-text"><b>Accepter la mission</b><br>Vérifiez les adresses avant de partir.</div></div><div class="activity-item"><div class="activity-icon">2</div><div class="activity-text"><b>Récupérer le colis</b><br>Confirmez la collecte dans le site.</div></div><div class="activity-item"><div class="activity-icon">3</div><div class="activity-text"><b>Confirmer la remise</b><br>Terminez la mission après remise au destinataire.</div></div></div></section></div>`;
}

function accountDialog() {
  if (!accountModal) return '';
  const owner = role === 'owner';
  return `<div class="modal-backdrop open" id="accountBackdrop"><section class="modal"><div class="modal-head"><h2>${owner ? 'Créer un compte administrateur' : 'Inviter un livreur'}</h2><button class="close" type="button" id="closeAccount" aria-label="Fermer">×</button></div><form id="accountForm"><div class="form-grid">${owner ? '<div class="field full"><label>Nom de la société</label><input name="companyName" required minlength="2" placeholder="Ex. Atelier Colis"></div>' : ''}<div class="field full"><label>Nom complet</label><input name="fullName" required minlength="2" placeholder="Ex. Koffi Kouamé"></div><div class="field full"><label>Adresse e-mail</label><input name="email" type="email" required placeholder="personne@entreprise.com"></div><div class="field full"><label>Téléphone (facultatif)</label><input name="phone" type="tel" placeholder="+225 07 00 00 00 00"></div></div><div class="modal-footer"><button type="button" class="button secondary" id="cancelAccount">Annuler</button><button class="button">Envoyer l’invitation</button></div></form></section></div>`;
}

function inviteLinkDialog() {
  if (!generatedInvite) return '';
  const recovery = generatedInvite.kind === 'recovery';
  return `<div class="modal-backdrop open" id="inviteLinkBackdrop"><section class="modal"><div class="modal-head"><h2>${recovery ? 'Lien de récupération prêt' : 'Lien d’activation prêt'}</h2><button class="close" type="button" id="closeInviteLink" aria-label="Fermer">×</button></div><p class="subtitle">Envoie ce lien directement à <b>${escapeHtml(generatedInvite.email)}</b> par message privé pour que la personne ${recovery ? 'choisisse un nouveau mot de passe' : 'choisisse son mot de passe'}.</p><div class="field"><label>Lien à partager</label><input id="inviteLinkValue" type="text" readonly value="${escapeHtml(generatedInvite.url)}"></div><p class="route">Ce lien donne accès au compte : partage-le uniquement avec la personne concernée et ne le publie pas.</p><div class="modal-footer"><button class="button secondary" type="button" id="closeInviteLinkSecondary">Fermer</button><button class="button" type="button" id="copyInviteLink">Copier le lien</button></div></section></div>`;
}

function loginView() {
  return `<div class="login-wrap"><div class="login-card"><div class="login-brand"><span class="brand-mark">↗</span><span>colis<span style="color:var(--green)">.</span></span></div><div class="eyebrow">Espace professionnel</div><h1>${loginRole === 'courier' ? 'Connexion livreur' : 'Connexion administrateur'}</h1><p class="subtitle">${loginRole === 'courier' ? 'Connectez-vous pour consulter vos missions de livraison.' : 'Connectez-vous pour gérer votre société et votre équipe.'}</p><div class="login-tabs"><button type="button" class="${loginRole === 'admin' ? 'active' : ''}" data-login-role="admin">Administrateur</button><button type="button" class="${loginRole === 'courier' ? 'active' : ''}" data-login-role="courier">Livreur</button></div><form id="loginForm"><div class="field"><label>Adresse e-mail</label><input type="email" name="email" placeholder="vous@entreprise.com" autocomplete="username" required></div><div class="field"><label>Mot de passe</label><input type="password" name="password" placeholder="Votre mot de passe" autocomplete="current-password" required></div><div class="login-meta"><label><input type="checkbox" name="remember"> Rester connecté</label><a href="#mot-de-passe-oublie" data-forgot>Mot de passe oublié ?</a></div><button class="button login-submit">Se connecter</button></form><div class="login-foot">Les comptes sont créés sur invitation.</div>${supabaseReady ? '' : '<div class="demo-note"><b>Configuration à terminer</b><br>Ajoute la clé publique Supabase dans supabase-config.js pour activer les connexions.</div>'}</div><div class="login-side"><div class="login-side-copy"><span class="eyebrow">Livrez simplement</span><h2>Vos colis.<br>Votre équipe.<br>Votre espace.</h2><p>Un tableau clair pour coordonner les livraisons de votre société.</p></div><div class="login-side-foot">© 2026 Colis · Gestion des livraisons</div></div></div>`;
}

function render() {
  document.body.classList.toggle('auth-mode', view === 'login');
  $('#logoutButton').style.display = view === 'login' ? 'none' : '';
  $('#accountBackdrop')?.remove();
  $('#inviteLinkBackdrop')?.remove();
  if (view === 'setup-password') {
    $('#crumbLabel').textContent = 'Choisir un mot de passe';
    $('#sideNav').innerHTML = '';
    $('#app').innerHTML = `<div class="login-wrap"><div class="login-card"><div class="login-brand"><span class="brand-mark">↗</span><span>colis<span style="color:var(--green)">.</span></span></div><div class="eyebrow">Activation du compte</div><h1>Choisir un mot de passe</h1><p class="subtitle">Crée un mot de passe pour terminer l’activation de ton compte.</p><form id="passwordSetupForm"><div class="field"><label>Nouveau mot de passe</label><input type="password" name="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label>Confirmer le mot de passe</label><input type="password" name="confirmPassword" minlength="8" autocomplete="new-password" required></div><button class="button login-submit">Enregistrer le mot de passe</button></form></div><div class="login-side"><div class="login-side-copy"><span class="eyebrow">Livrez simplement</span><h2>Vos colis.<br>Votre équipe.<br>Votre espace.</h2></div></div></div>`;
    $('#passwordSetupForm').onsubmit = saveNewPassword;
    return;
  }
  if (view === 'login') {
    $('#crumbLabel').textContent = loginRole === 'courier' ? 'Connexion livreur' : 'Connexion administrateur';
    $('#app').innerHTML = loginView();
    $('#sideNav').innerHTML = '';
    document.querySelectorAll('[data-login-role]').forEach((button) => button.onclick = () => { loginRole = button.dataset.loginRole; render(); });
    $('#loginForm').onsubmit = signIn;
    $('[data-forgot]').onclick = requestPasswordReset;
    return;
  }

  const pageLabel = role === 'owner' ? 'Sociétés' : role === 'admin' ? ({ overview: 'Vue d’ensemble', deliveries: 'Livraisons', team: 'Livreurs' }[adminPage]) : (courierPage === 'history' ? 'Historique' : 'Mes missions');
  $('#crumbLabel').textContent = pageLabel;
  $('#roleLabel').textContent = role === 'owner' ? 'Espace propriétaire' : role === 'admin' ? 'Espace Administrateur' : 'Espace Livreur';
  $('#profileName').innerHTML = `${escapeHtml(profile?.full_name || user?.email || '')}<br><span style="color:#8b958e;font-size:11px;font-weight:400">${role === 'owner' ? 'Propriétaire plateforme' : role === 'admin' ? `Administrateur · ${escapeHtml(profile?.company_name || '')}` : 'Livreur'}</span>`;
  $('#sideNav').innerHTML = navItems().map(([key, icon, label]) => `<button class="${(role === 'owner' || role === 'admin' && adminPage === key || role === 'courier' && courierPage === key) ? 'active' : ''}" data-page="${key}"><span class="icon">${icon}</span>${label}</button>`).join('');
  $('#app').innerHTML = role === 'owner' ? ownerView() : role === 'admin' ? adminView() : courierView();
  if (accountModal) document.body.insertAdjacentHTML('beforeend', accountDialog());
  if (view === 'dashboard' && generatedInvite?.creatorId === user?.id) document.body.insertAdjacentHTML('beforeend', inviteLinkDialog());

  $('#logoutButton').onclick = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return showError(error);
    user = null; profile = null; deliveries = []; couriers = []; showLogin('admin');
  };
  $('#sideNav').querySelectorAll('[data-page]').forEach((button) => button.onclick = () => setPage(button.dataset.page));
  $('#app').querySelectorAll('[data-filter]').forEach((button) => button.onclick = () => { filter = button.dataset.filter; render(); });
  const search = $('#orderSearch');
  if (search) search.oninput = () => { searchTerm = search.value; const start = search.selectionStart; render(); $('#orderSearch')?.focus(); $('#orderSearch')?.setSelectionRange(start, start); };
  $('#openDelivery')?.addEventListener('click', openDeliveryDialog);
  $('#addCourier')?.addEventListener('click', () => { accountModal = 'courier'; render(); });
  $('#createCompanyAdmin')?.addEventListener('click', () => { accountModal = 'admin'; render(); });
  $('#app').querySelectorAll('[data-reissue-admin]').forEach((button) => button.onclick = () => reissueAdminLink(button.dataset.reissueAdmin));
  $('#app').querySelectorAll('[data-reissue-courier]').forEach((button) => button.onclick = () => reissueCourierLink(button.dataset.reissueCourier));
  $('#app').querySelectorAll('[data-company-active]').forEach((button) => button.onclick = () => setCompanyActive(button.dataset.companyActive, button.dataset.nextActive === 'true', button.dataset.companyName));
  $('#exportOrders')?.addEventListener('click', exportOrders);
  $('#app').querySelectorAll('[data-assign]').forEach((select) => select.onchange = () => assignDelivery(select.dataset.assign, select.value || null));
  $('#app').querySelectorAll('[data-accept]').forEach((button) => button.onclick = () => acceptDelivery(button.dataset.accept));
  $('#app').querySelectorAll('[data-progress]').forEach((button) => button.onclick = () => updateDeliveryStatus(button.dataset.progress, 'En cours'));
  $('#app').querySelectorAll('[data-complete]').forEach((button) => button.onclick = () => updateDeliveryStatus(button.dataset.complete, 'Livrée'));
  $('#app').querySelectorAll('[data-goto]').forEach((button) => button.onclick = () => setPage(button.dataset.goto));
  $('#closeAccount')?.addEventListener('click', closeAccountDialog);
  $('#cancelAccount')?.addEventListener('click', closeAccountDialog);
  $('#accountBackdrop')?.addEventListener('click', (event) => { if (event.target.id === 'accountBackdrop') closeAccountDialog(); });
  $('#accountForm')?.addEventListener('submit', submitAccountInvite);
  $('#copyInviteLink')?.addEventListener('click', async () => {
    const input = $('#inviteLinkValue');
    try {
      await navigator.clipboard.writeText(generatedInvite.url);
      toast('Lien copié. Envoie-le à la personne invitée.');
    } catch {
      input?.select();
      toast('Sélectionne le lien puis copie-le manuellement.');
    }
  });
  const closeInviteLink = () => { clearRememberedInvite(); render(); };
  $('#closeInviteLink')?.addEventListener('click', closeInviteLink);
  $('#closeInviteLinkSecondary')?.addEventListener('click', closeInviteLink);
}

async function loadProfile() {
  const { data: owner, error: ownerError } = await supabase.from('platform_owners').select('user_id').eq('user_id', user.id).maybeSingle();
  if (ownerError) throw ownerError;
  if (owner) {
    role = 'owner';
    profile = { full_name: user.user_metadata?.full_name || user.email };
    return;
  }
  const { data: member, error } = await supabase.from('company_members').select('user_id,company_id,role,full_name,phone,active,companies(name,active)').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!member || !member.active || !member.companies?.active) throw new Error('L’accès à cette société est désactivé. Contacte le propriétaire du site.');
  role = member.role;
  profile = { ...member, company_name: member.companies?.name || '' };
}

async function loadWorkspace() {
  if (role === 'owner') {
    deliveries = [];
    couriers = [];
    await loadOwnerCompanies();
    return;
  }
  const { data: deliveryRows, error: deliveryError } = await supabase.from('deliveries').select('id,company_id,courier_id,reference,recipient_name,recipient_phone,pickup_address,dropoff_address,parcel_type,status,created_at,delivered_at,courier:company_members!deliveries_courier_id_fkey(full_name,phone)').order('created_at', { ascending: false });
  if (deliveryError) throw deliveryError;
  deliveries = (deliveryRows || []).map((item) => ({ ...item, courier_name: item.courier?.full_name || 'À attribuer' }));
  if (role === 'admin') {
    const { data, error } = await supabase.from('company_members').select('user_id,full_name,phone,active').eq('company_id', profile.company_id).eq('role', 'courier').order('full_name');
    if (error) throw error;
    couriers = data || [];
  } else {
    couriers = [];
  }
}

async function loadOwnerCompanies() {
  ownerCompaniesError = '';
  const { data, error } = await supabase.functions.invoke('manage-accounts', { body: { action: 'list_companies' } });
  if (error || data?.error) {
    ownerCompanies = [];
    ownerCompaniesError = 'La liste des sociétés n’a pas pu être chargée. Actualise la page ou vérifie le déploiement de la fonction Supabase.';
    console.error(error || data?.error);
    return;
  }
  ownerCompanies = Array.isArray(data?.companies) ? data.companies : [];
}

async function reissueAdminLink(userId) {
  const { data, error } = await supabase.functions.invoke('manage-accounts', { body: { action: 'reissue_admin_link', userId } });
  if (error) return showError(error, 'Le lien d’activation n’a pas pu être créé.');
  if (data?.error) return toast(data.error);
  rememberInvite({ email: data.email, url: data.activationUrl, kind: 'recovery' });
  render();
  toast('Lien de récupération prêt. Partage-le en privé avec l’administrateur.');
}

async function reissueCourierLink(userId) {
  const { data, error } = await supabase.functions.invoke('manage-accounts', { body: { action: 'reissue_courier_link', userId } });
  if (error) return showError(error, 'Le lien du livreur n’a pas pu être créé.');
  if (data?.error) return toast(data.error);
  rememberInvite({ email: data.email, url: data.activationUrl, kind: data.kind || 'activation' });
  render();
  toast('Lien du livreur prêt. Partage-le en privé.');
}

async function setCompanyActive(companyId, active, companyName) {
  const verb = active ? 'réactiver' : 'désactiver';
  if (!window.confirm(`Veux-tu ${verb} la société « ${companyName} » ? ${active ? 'Les comptes pourront se reconnecter.' : 'L’administrateur et les livreurs ne pourront plus se connecter. Les livraisons et l’historique seront conservés.'}`)) return;
  const { data, error } = await supabase.functions.invoke('manage-accounts', {
    body: { action: 'set_company_active', companyId, active },
  });
  if (error) return showError(error, 'Le statut de la société n’a pas pu être modifié.');
  if (data?.error) return toast(data.error);
  await loadOwnerCompanies();
  render();
  toast(active ? 'Société réactivée.' : 'Société désactivée. Son historique est conservé.');
}

async function signIn(event) {
  event.preventDefault();
  if (!supabaseReady) return toast('La clé publique Supabase manque dans supabase-config.js.');
  const form = new FormData(event.currentTarget);
  const { data, error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
  if (error) return showError(error, 'Adresse e-mail ou mot de passe incorrect.');
  user = data.user;
  try {
    await loadProfile();
    await loadWorkspace();
    if (role === 'courier' && loginRole === 'admin') toast('Ce compte est livreur : son accès est limité à l’espace livreur.');
    view = needsPasswordSetup ? 'setup-password' : 'dashboard';
    window.location.hash = role === 'owner' ? 'maintenance' : role === 'admin' ? 'administration' : 'livreur';
    render();
  } catch (loadError) {
    await supabase.auth.signOut({ scope: 'local' });
    user = null; profile = null;
    showLogin(loginRole);
    showError(loadError, 'Impossible de charger les droits de ce compte.');
  }
}

async function saveNewPassword(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  if (values.password !== values.confirmPassword) return toast('Les deux mots de passe ne correspondent pas.');
  const { error } = await supabase.auth.updateUser({ password: values.password });
  if (error) return showError(error, 'Le mot de passe n’a pas pu être enregistré.');
  needsPasswordSetup = false;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  view = 'dashboard';
  render();
  toast('Mot de passe enregistré. Bienvenue sur Colis.');
}

async function requestPasswordReset(event) {
  event.preventDefault();
  if (!supabaseReady) return toast('La clé publique Supabase manque dans supabase-config.js.');
  const email = $('#loginForm [name="email"]').value.trim();
  if (!email) return toast('Saisis ton adresse e-mail avant de demander un lien.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) return showError(error);
  toast('Un lien de réinitialisation a été envoyé si le compte existe.');
}

async function submitAccountInvite(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = {
    action: role === 'owner' ? 'create_company_admin' : 'create_courier',
    email: String(form.get('email') || '').trim(),
    fullName: String(form.get('fullName') || '').trim(),
    phone: String(form.get('phone') || '').trim(),
    ...(role === 'owner' ? { companyName: String(form.get('companyName') || '').trim() } : {}),
  };
  const { data, error } = await supabase.functions.invoke('manage-accounts', { body });
  if (error) return showError(error, 'L’invitation n’a pas pu être envoyée.');
  if (data?.error) return toast(data.error);
  accountModal = null;
  if (data?.invitationUrl) rememberInvite({ email: body.email, url: data.invitationUrl });
  render();
  toast(data?.message || 'Lien d’activation créé.');
  if (role === 'owner') await loadOwnerCompanies();
  render();
}

function openDeliveryDialog() {
  if (role !== 'admin') return;
  const activeCouriers = couriers.filter((courier) => courier.active);
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop open';
  modal.id = 'deliveryBackdrop';
  modal.innerHTML = `<section class="modal"><div class="modal-head"><h2>Créer une livraison</h2><button class="close" type="button" aria-label="Fermer" data-close>×</button></div><form id="deliveryForm"><div class="form-grid"><div class="field"><label>Nom du destinataire</label><input name="recipient" required placeholder="Ex. Koffi Yao"></div><div class="field"><label>Téléphone</label><input name="phone" required placeholder="+225 07 00 00 00 00"></div><div class="field full"><label>Adresse de collecte</label><input name="pickup" required placeholder="Quartier, rue, repère"></div><div class="field full"><label>Adresse de livraison</label><input name="dropoff" required placeholder="Quartier, rue, repère"></div><div class="field"><label>Type de colis</label><select name="parcel"><option>Petit colis</option><option>Document</option><option>Colis standard</option><option>Colis volumineux</option></select></div><div class="field"><label>Livreur</label><select name="courier"><option value="">À attribuer</option>${activeCouriers.map((courier) => `<option value="${courier.user_id}">${escapeHtml(courier.full_name)}</option>`).join('')}</select></div></div><div class="modal-footer"><button type="button" class="button secondary" data-close>Annuler</button><button class="button">Enregistrer la livraison</button></div></form></section>`;
  document.body.append(modal);
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) modal.remove(); });
  $('#deliveryForm').addEventListener('submit', createDelivery);
}

async function createDelivery(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const nextNumber = Date.now().toString().slice(-8);
  const payload = {
    company_id: profile.company_id,
    courier_id: form.get('courier') || null,
    reference: `CL-${nextNumber}`,
    recipient_name: String(form.get('recipient')).trim(),
    recipient_phone: String(form.get('phone')).trim(),
    pickup_address: String(form.get('pickup')).trim(),
    dropoff_address: String(form.get('dropoff')).trim(),
    parcel_type: form.get('parcel'),
    status: form.get('courier') ? 'À récupérer' : 'À attribuer',
    created_by: user.id,
  };
  const { error } = await supabase.from('deliveries').insert(payload);
  if (error) return showError(error, 'La livraison n’a pas pu être enregistrée.');
  $('#deliveryBackdrop')?.remove();
  await refreshWorkspace();
  adminPage = 'deliveries'; render(); toast('Nouvelle livraison enregistrée.');
}

async function assignDelivery(id, courierId) {
  const { error } = await supabase.rpc('admin_assign_delivery', { p_delivery_id: id, p_courier_id: courierId });
  if (error) return showError(error, 'Le livreur n’a pas pu être attribué.');
  await refreshWorkspace(); render(); toast(courierId ? 'Mission attribuée.' : 'Livreur retiré de la mission.');
}

async function acceptDelivery(id) {
  const { error } = await supabase.rpc('courier_accept_delivery', { p_delivery_id: id });
  if (error) return showError(error, 'Cette mission n’est peut-être plus disponible.');
  await refreshWorkspace(); render(); toast('Mission acceptée.');
}

async function updateDeliveryStatus(id, status) {
  const { error } = await supabase.rpc('courier_set_delivery_status', { p_delivery_id: id, p_status: status });
  if (error) return showError(error, 'Le statut de la livraison n’a pas pu être mis à jour.');
  await refreshWorkspace(); render(); toast(status === 'Livrée' ? 'Remise confirmée. Mission terminée !' : 'Collecte confirmée. Bonne route !');
}

async function refreshWorkspace() {
  try { await loadWorkspace(); } catch (error) { showError(error, 'Impossible d’actualiser les informations.'); }
}

function closeAccountDialog() { accountModal = null; render(); }

function exportOrders() {
  const rows = [['Commande', 'Destinataire', 'Téléphone', 'Collecte', 'Livraison', 'Livreur', 'Statut'], ...deliveries.map((item) => [item.reference, item.recipient_name, item.recipient_phone, item.pickup_address, item.dropoff_address, item.courier_name, item.status])];
  const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = 'livraisons-colis.csv'; link.click(); URL.revokeObjectURL(link.href);
}

async function handleSession(session, eventName = '') {
  if (!session?.user) { user = null; profile = null; role = 'admin'; view = 'login'; render(); return; }
  if (generatedInvite && generatedInvite.creatorId !== session.user.id) clearRememberedInvite();
  if (eventName === 'PASSWORD_RECOVERY') needsPasswordSetup = true;
  user = session.user;
  try {
    await loadProfile();
    await loadWorkspace();
    view = needsPasswordSetup ? 'setup-password' : 'dashboard';
    render();
  } catch (error) {
    await supabase.auth.signOut({ scope: 'local' });
    user = null; profile = null; view = 'login'; render(); showError(error, 'Ce compte ne possède pas de rôle actif.');
  }
}

if (!supabaseReady) {
  showLogin('admin');
} else {
  supabase.auth.onAuthStateChange((eventName, session) => {
    // Run after this callback completes to avoid blocking Supabase auth events.
    if (session?.user) setTimeout(() => handleSession(session, eventName), 0);
    else { user = null; profile = null; role = 'admin'; view = 'login'; render(); }
  });
  supabase.auth.getSession().then(({ data }) => { if (data.session) handleSession(data.session); else showLogin(window.location.hash.includes('livreur') ? 'courier' : 'admin'); });
}
