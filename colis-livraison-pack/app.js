const seedDeliveries = [
  { id: 'CL-2048', recipient: 'Mariam Koné', phone: '+225 07 08 14 22 10', pickup: 'Cocody · Riviera 3', dropoff: 'Plateau · Avenue Noguès', courier: 'K. Kouassi', status: 'En cours', parcel: 'Petit colis', time: '09:42' },
  { id: 'CL-2047', recipient: 'Jean-Marc Yao', phone: '+225 05 66 21 08 34', pickup: 'Marcory · Zone 4', dropoff: 'Treichville · Avenue 16', courier: 'M. Traoré', status: 'À récupérer', parcel: 'Document', time: '09:28' },
  { id: 'CL-2046', recipient: 'Awa Diabaté', phone: '+225 01 02 67 39 11', pickup: 'Yopougon · Siporex', dropoff: 'Cocody · Angré 8e tranche', courier: 'A. Diallo', status: 'Livrée', parcel: 'Colis standard', time: '09:10' },
  { id: 'CL-2045', recipient: 'Serge N’Guessan', phone: '+225 07 71 04 96 22', pickup: 'Adjamé · Liberté', dropoff: 'Cocody · Deux-Plateaux', courier: 'À attribuer', status: 'À attribuer', parcel: 'Petit colis', time: '08:55' }
];
const seedCouriers = [
  { name: 'K. Kouassi', fullName: 'Kouassi Kouamé', phone: '+225 07 44 28 10 03', status: 'En livraison', active: true },
  { name: 'M. Traoré', fullName: 'Mamadou Traoré', phone: '+225 05 55 09 62 81', status: 'Disponible', active: true },
  { name: 'A. Diallo', fullName: 'Aminata Diallo', phone: '+225 01 63 22 07 51', status: 'Disponible', active: true },
  { name: 'S. Bamba', fullName: 'Souleymane Bamba', phone: '+225 07 87 12 00 42', status: 'Hors ligne', active: false }
];
const $ = (selector) => document.querySelector(selector);
let orders = JSON.parse(localStorage.getItem('colis-orders') || 'null') || seedDeliveries;
let couriers = JSON.parse(localStorage.getItem('colis-couriers') || 'null') || seedCouriers;
let role = 'admin';
let view = 'login';
let loginRole = 'admin';
let adminPage = 'overview';
let courierPage = 'missions';
let filter = 'Tous';
let searchTerm = '';
const currentCourier = 'K. Kouassi';

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const statusClass = (status) => status === 'En cours' ? 'progress' : ['À récupérer', 'À attribuer'].includes(status) ? 'waiting' : status === 'Livrée' ? 'done' : '';
const initials = (name) => name === 'À attribuer' ? '?' : name.split(/[ .]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
function save() { localStorage.setItem('colis-orders', JSON.stringify(orders)); localStorage.setItem('colis-couriers', JSON.stringify(couriers)); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function metrics() { return { total: orders.length, pending: orders.filter((o) => ['À attribuer', 'À récupérer'].includes(o.status)).length, progress: orders.filter((o) => o.status === 'En cours').length, done: orders.filter((o) => o.status === 'Livrée').length }; }
function navItems() { return role === 'admin' ? [['overview', '▦', 'Vue d’ensemble'], ['deliveries', '◉', 'Livraisons'], ['team', '♙', 'Livreurs']] : [['missions', '▣', 'Mes missions'], ['history', '◷', 'Historique']]; }
function setRole(nextRole) {
  view = 'dashboard';
  role = nextRole;
  document.body.classList.remove('auth-mode');
  window.location.hash = role === 'admin' ? 'administration' : 'livreur';
  document.querySelectorAll('[data-role]').forEach((button) => button.classList.toggle('active', button.dataset.role === role));
  $('#roleLabel').textContent = role === 'admin' ? 'Espace Administrateur' : 'Espace Livreur';
  $('#crumbLabel').textContent = role === 'admin' ? ({ overview: 'Vue d’ensemble', deliveries: 'Livraisons', team: 'Livreurs' }[adminPage]) : (courierPage === 'history' ? 'Historique' : 'Mes missions');
  $('#profileName').innerHTML = role === 'admin' ? 'Aïcha Mensah<br><span style="color:#8b958e;font-size:11px;font-weight:400">Administratrice · Atelier Colis</span>' : 'Kouassi Kouamé<br><span style="color:#8b958e;font-size:11px;font-weight:400">Livreur partenaire</span>';
  const activePage = role === 'admin' ? adminPage : courierPage;
  $('#sideNav').innerHTML = navItems().map(([key, icon, label]) => `<button class="${activePage === key ? 'active' : ''}" data-page="${key}"><span class="icon">${icon}</span>${label}</button>`).join('');
  render();
}
function setPage(page) {
  if (role === 'admin') adminPage = page; else courierPage = page;
  setRole(role);
}
function showLogin(forRole = role) {
  loginRole = forRole;
  view = 'login';
  window.location.hash = loginRole === 'admin' ? 'connexion-administrateur' : 'connexion-livreur';
  render();
}
function heading(eyebrow, title, subtitle, action = '') {
  return `<div class="heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${action}</div>`;
}
function orderRow(order, showActions = false) {
  const courierCell = showActions && role === 'admin' && order.status !== 'Livrée'
    ? `<select class="assign-select" data-assign="${order.id}" aria-label="Attribuer un livreur"><option value="À attribuer" ${order.courier === 'À attribuer' ? 'selected' : ''}>À attribuer</option>${couriers.filter((c) => c.active).map((c) => `<option value="${escapeHtml(c.name)}" ${order.courier === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>`
    : `<div class="courier"><div class="avatar">${initials(order.courier)}</div><div class="courier-name">${escapeHtml(order.courier)}</div></div>`;
  return `<tr><td><div class="order-id">${escapeHtml(order.id)}</div><div class="route">${escapeHtml(order.time)} · ${escapeHtml(order.parcel)}</div></td><td><div style="font-weight:600">${escapeHtml(order.recipient)}</div><div class="route">${escapeHtml(order.phone)}</div></td><td><div>${escapeHtml(order.pickup)}</div><div class="route">→ ${escapeHtml(order.dropoff)}</div></td><td>${courierCell}</td><td><span class="status ${statusClass(order.status)}">${escapeHtml(order.status)}</span></td></tr>`;
}
function tablePanel(rows, { controls = true, actions = false } = {}) {
  return `<section class="panel"><div class="panel-head"><div><h2>${role === 'admin' ? 'Suivi des livraisons' : 'Détail des missions'}</h2><div class="route" style="margin-top:5px">${role === 'admin' ? 'Retrouvez et suivez les commandes de votre société' : 'Adresse, destinataire et progression de vos courses'}</div></div>${role === 'admin' ? '<button class="button secondary small" id="exportOrders">↓　Exporter</button>' : ''}</div>${controls ? `<div class="table-tools"><label class="search"><input id="orderSearch" placeholder="N° commande, nom, adresse…" value="${escapeHtml(searchTerm)}"></label><div class="filters">${['Tous', 'À attribuer', 'À récupérer', 'En cours', 'Livrée'].map((item) => `<button class="filter ${filter === item ? 'active' : ''}" data-filter="${item}">${item}</button>`).join('')}</div></div>` : ''}<div class="table-wrap"><table><thead><tr><th>Commande</th><th>Destinataire</th><th>Itinéraire</th><th>Livreur</th><th>Statut</th></tr></thead><tbody>${rows.length ? rows.map((order) => orderRow(order, actions)).join('') : '<tr><td colspan="5" class="empty">Aucune livraison à afficher.</td></tr>'}</tbody></table></div></section>`;
}
function activityPanel() {
  const recent = [...orders].slice(0, 3);
  return `<section class="panel"><div class="panel-head"><div><h2>Équipe de livraison</h2><div class="route" style="margin-top:5px">${couriers.filter((c) => c.active).length} livreurs actifs aujourd’hui</div></div><button class="link-button" data-goto="team">Voir l’équipe　→</button></div><div class="activity">${couriers.filter((c) => c.active).slice(0, 3).map((courier) => `<div class="activity-item"><div class="avatar">${initials(courier.name)}</div><div class="activity-text"><b>${escapeHtml(courier.fullName)}</b><br>${escapeHtml(courier.status)}<div class="activity-time">${orders.filter((o) => o.courier === courier.name && ['En cours', 'À récupérer'].includes(o.status)).length} mission(s) en cours</div></div></div>`).join('')}</div><div class="capacity"><div class="capacity-row"><b>Activité récente</b><span>${recent.length} dernières commandes</span></div>${recent.map((o) => `<div class="activity-time" style="margin-top:8px"><b>${escapeHtml(o.id)}</b> · ${escapeHtml(o.recipient)} · ${escapeHtml(o.status)}</div>`).join('')}</div></section>`;
}
function metricCard(label, value, note, icon) { return `<div class="metric"><div class="metric-top">${label}<span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`; }
function filteredOrders(source = orders) {
  const query = searchTerm.trim().toLowerCase();
  return source.filter((order) => (filter === 'Tous' || order.status === filter) && (!query || [order.id, order.recipient, order.phone, order.pickup, order.dropoff, order.courier].some((value) => value.toLowerCase().includes(query))));
}
function adminView() {
  const s = metrics();
  if (adminPage === 'team') return `${heading('Votre société', 'Livreurs', 'Gérez votre équipe et consultez sa disponibilité.', '<button class="button" id="addCourier">＋　Ajouter un livreur</button>')}<section class="team-grid">${couriers.map((c) => `<article class="team-card"><div class="team-card-head"><div class="avatar large">${initials(c.name)}</div><span class="status ${c.active ? '' : 'done'}">${c.active ? c.status : 'Hors ligne'}</span></div><h2>${escapeHtml(c.fullName)}</h2><div class="route">${escapeHtml(c.name)} · ${escapeHtml(c.phone)}</div><div class="team-card-foot"><span>${orders.filter((o) => o.courier === c.name && o.status === 'Livrée').length} livraisons terminées</span><button class="link-button" data-toggle-courier="${escapeHtml(c.name)}">${c.active ? 'Désactiver' : 'Activer'}</button></div></article>`).join('')}</section>`;
  const rows = filteredOrders();
  if (adminPage === 'deliveries') return `${heading('Opérations', 'Toutes les livraisons', 'Recherchez, filtrez et attribuez les commandes de votre société.', '<button class="button" id="openModal">＋　Nouvelle livraison</button>')}${tablePanel(rows, { actions: true })}`;
  return `${heading('Espace administration', 'Bonjour, Aïcha <span style="font-size:23px">☀</span>', 'Voici un aperçu de l’activité de votre société aujourd’hui.', '<button class="button" id="openModal">＋　Nouvelle livraison</button>')}<section class="metrics">${metricCard('Livraisons du jour', s.total, 'Toutes les commandes enregistrées', '▣')}${metricCard('À prendre en charge', s.pending, 'En attente de collecte', '◷')}${metricCard('En cours', s.progress, 'Colis sur la route', '➜')}${metricCard('Livrées', s.done, 'Remises confirmées', '✓')}</section><div class="columns">${tablePanel(filteredOrders(orders.slice(0, 5)), { controls: false })}${activityPanel()}</div>`;
}
function courierView() {
  const assigned = orders.filter((o) => o.courier === currentCourier);
  const available = orders.filter((o) => o.status === 'À attribuer');
  const active = assigned.filter((o) => ['À récupérer', 'En cours'].includes(o.status));
  const source = courierPage === 'history' ? assigned.filter((o) => o.status === 'Livrée') : [...active, ...available];
  return `${heading('Espace livreur', courierPage === 'history' ? 'Historique des courses' : 'Bonjour, Kouassi <span style="font-size:23px">👋</span>', courierPage === 'history' ? 'Retrouvez les livraisons terminées.' : 'Vos missions du jour, au même endroit.', '')}<div class="courier-banner"><div><div class="eyebrow">Votre disponibilité</div><h2>Vous êtes en ligne</h2><p>Les missions disponibles apparaissent dans votre espace.</p></div><div class="available">Disponible</div></div><section class="delivery-cards">${metricCard('Missions terminées', assigned.filter((o) => o.status === 'Livrée').length, 'Aujourd’hui', '✓')}${metricCard('À effectuer', active.length, 'Collecte ou livraison', '➜')}</section><div class="columns courier-columns"><section class="panel"><div class="panel-head"><div><h2>${courierPage === 'history' ? 'Courses terminées' : 'Missions à effectuer'}</h2><div class="route" style="margin-top:5px">${courierPage === 'history' ? 'Vos remises confirmées' : 'Acceptez une course et mettez son statut à jour'}</div></div><span class="status ${source.length ? 'progress' : 'done'}">${source.length} ${courierPage === 'history' ? 'terminée(s)' : 'mission(s)'}</span></div>${source.length ? source.map((order) => courierCard(order, available.includes(order))).join('') : '<div class="empty">Aucune mission dans cette liste.</div>'}</section><section class="panel"><div class="panel-head"><div><h2>Les étapes</h2><div class="route" style="margin-top:5px">Suivez le statut de la course</div></div></div><div class="activity"><div class="activity-item"><div class="activity-icon">1</div><div class="activity-text"><b>Accepter la mission</b><br>Vérifiez les adresses avant de partir.</div></div><div class="activity-item"><div class="activity-icon">2</div><div class="activity-text"><b>Récupérer le colis</b><br>Confirmez la collecte dans le site.</div></div><div class="activity-item"><div class="activity-icon">3</div><div class="activity-text"><b>Confirmer la remise</b><br>Terminez la mission après remise au destinataire.</div></div></div></section></div>`;
}
function courierCard(order, isAvailable) {
  let action = '';
  if (isAvailable) action = `<button class="button small" data-accept="${order.id}">Accepter la mission</button>`;
  else if (order.status === 'À récupérer') action = `<button class="button small" data-progress="${order.id}">Colis récupéré</button>`;
  else if (order.status === 'En cours') action = `<button class="button small" data-complete="${order.id}">Confirmer la remise</button>`;
  return `<article class="mission-card"><div class="mission-main"><div class="job-top"><span class="job-id">${escapeHtml(order.id)}</span><span class="job-age">· ${escapeHtml(order.time)} · ${escapeHtml(order.parcel)}</span><span class="status ${statusClass(order.status)}">${escapeHtml(order.status)}</span></div><div class="job-route"><span class="route-dots"><i></i><i></i><i></i></span><span><b>${escapeHtml(order.pickup)}</b><br><span class="route">${escapeHtml(order.dropoff)}</span></span></div><div class="job-bottom"><span>Destinataire <b>${escapeHtml(order.recipient)}</b></span><span>☎ <b>${escapeHtml(order.phone)}</b></span></div></div><div class="mission-action">${action}</div></article>`;
}
function render() {
  if (view === 'login') {
    document.body.classList.add('auth-mode');
    $('#crumbLabel').textContent = loginRole === 'admin' ? 'Connexion administrateur' : 'Connexion livreur';
    $('#app').innerHTML = `<div class="login-wrap"><div class="login-card"><div class="login-brand"><span class="brand-mark">↗</span><span>colis<span style="color:var(--green)">.</span></span></div><div class="eyebrow">Espace professionnel</div><h1>${loginRole === 'admin' ? 'Connexion administrateur' : 'Connexion livreur'}</h1><p class="subtitle">${loginRole === 'admin' ? 'Connectez-vous pour gérer votre société et votre équipe.' : 'Connectez-vous pour consulter vos missions de livraison.'}</p><div class="login-tabs"><button type="button" class="${loginRole === 'admin' ? 'active' : ''}" data-login-role="admin">Administrateur</button><button type="button" class="${loginRole === 'courier' ? 'active' : ''}" data-login-role="courier">Livreur</button></div><form id="loginForm"><div class="field"><label>Adresse e-mail</label><input type="email" name="email" placeholder="vous@entreprise.com" autocomplete="username" required></div><div class="field"><label>Mot de passe</label><input type="password" name="password" placeholder="Votre mot de passe" autocomplete="current-password" required></div><div class="login-meta"><label><input type="checkbox" name="remember"> Rester connecté</label><a href="#mot-de-passe-oublie" data-forgot>Mot de passe oublié ?</a></div><button class="button login-submit">Se connecter</button></form><div class="login-foot">Nouveau sur Colis ? <a href="#inscription" data-signup>Créer un compte société</a></div><div class="demo-note"><b>Aperçu de l’interface</b><br>La connexion réelle sera activée avec Supabase. Pour le moment, ce formulaire ouvre la maquette et ne vérifie pas les identifiants.</div></div><div class="login-side"><div class="login-side-copy"><span class="eyebrow">Livrez simplement</span><h2>Vos colis.<br>Votre équipe.<br>Votre espace.</h2><p>Un tableau clair pour coordonner les livraisons de votre société.</p></div><div class="login-side-foot">© 2026 Colis · Gestion des livraisons</div></div></div>`;
    $('#sideNav').innerHTML = '';
    document.querySelectorAll('[data-login-role]').forEach((button) => button.onclick = () => { loginRole = button.dataset.loginRole; window.location.hash = loginRole === 'admin' ? 'connexion-administrateur' : 'connexion-livreur'; render(); });
    $('#loginForm').onsubmit = (event) => { event.preventDefault(); setRole(loginRole); toast('Mode aperçu : connexion réelle à configurer.'); };
    $('[data-forgot]').onclick = (event) => { event.preventDefault(); toast('La récupération sera disponible après la connexion Supabase.'); };
    $('[data-signup]').onclick = (event) => { event.preventDefault(); toast('La création de compte sera activée avec Supabase.'); };
    return;
  }
  document.body.classList.remove('auth-mode');
  $('#logoutButton').onclick = () => showLogin(role);
  $('#crumbLabel').textContent = role === 'admin' ? ({ overview: 'Vue d’ensemble', deliveries: 'Livraisons', team: 'Livreurs' }[adminPage]) : (courierPage === 'history' ? 'Historique' : 'Mes missions');
  $('#app').innerHTML = role === 'admin' ? adminView() : courierView();
  $('#sideNav').querySelectorAll('[data-page]').forEach((button) => button.onclick = () => setPage(button.dataset.page));
  $('#app').querySelectorAll('[data-filter]').forEach((button) => button.onclick = () => { filter = button.dataset.filter; render(); });
  const search = $('#orderSearch');
  if (search) search.oninput = () => { searchTerm = search.value; const start = search.selectionStart; render(); $('#orderSearch').focus(); $('#orderSearch').setSelectionRange(start, start); };
  const modalButton = $('#openModal'); if (modalButton) modalButton.onclick = openDeliveryModal;
  const exporter = $('#exportOrders'); if (exporter) exporter.onclick = exportOrders;
  const addCourier = $('#addCourier'); if (addCourier) addCourier.onclick = openCourierModal;
  $('#app').querySelectorAll('[data-accept]').forEach((button) => button.onclick = () => acceptDelivery(button.dataset.accept));
  $('#app').querySelectorAll('[data-progress]').forEach((button) => button.onclick = () => progressDelivery(button.dataset.progress));
  $('#app').querySelectorAll('[data-complete]').forEach((button) => button.onclick = () => completeDelivery(button.dataset.complete));
  $('#app').querySelectorAll('[data-assign]').forEach((select) => select.onchange = () => assignDelivery(select.dataset.assign, select.value));
  $('#app').querySelectorAll('[data-toggle-courier]').forEach((button) => button.onclick = () => toggleCourier(button.dataset.toggleCourier));
  $('#app').querySelectorAll('[data-goto]').forEach((button) => button.onclick = () => setPage(button.dataset.goto));
}
function assignDelivery(id, courierName) {
  const order = orders.find((item) => item.id === id); if (!order) return;
  order.courier = courierName;
  order.status = courierName === 'À attribuer' ? 'À attribuer' : 'À récupérer';
  save(); render(); toast(courierName === 'À attribuer' ? 'Livreur retiré de la mission.' : `Mission attribuée à ${courierName}.`);
}
function acceptDelivery(id) { const order = orders.find((item) => item.id === id); if (!order) return; order.courier = currentCourier; order.status = 'À récupérer'; save(); render(); toast('Mission acceptée.'); }
function progressDelivery(id) { const order = orders.find((item) => item.id === id); if (!order) return; order.status = 'En cours'; save(); render(); toast('Collecte confirmée. Bonne route !'); }
function completeDelivery(id) { const order = orders.find((item) => item.id === id); if (!order) return; order.status = 'Livrée'; save(); render(); toast('Remise confirmée. Mission terminée !'); }
function toggleCourier(name) { const courier = couriers.find((item) => item.name === name); if (!courier) return; courier.active = !courier.active; courier.status = courier.active ? 'Disponible' : 'Hors ligne'; save(); render(); toast(courier.active ? 'Livreur activé.' : 'Livreur désactivé.'); }
function closeModal() { $('#modalBackdrop').classList.remove('open'); }
function exportOrders() {
  const rows = [['Commande', 'Destinataire', 'Téléphone', 'Collecte', 'Livraison', 'Livreur', 'Statut'], ...orders.map((o) => [o.id, o.recipient, o.phone, o.pickup, o.dropoff, o.courier, o.status])];
  const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'livraisons-colis.csv'; link.click(); URL.revokeObjectURL(link.href); toast('Export téléchargé.');
}
function openDeliveryModal() {
  const select = $('#deliveryForm select[name="courier"]');
  select.innerHTML = `<option value="À attribuer">À attribuer</option>${couriers.filter((courier) => courier.active).map((courier) => `<option value="${escapeHtml(courier.name)}">${escapeHtml(courier.name)}</option>`).join('')}`;
  $('#modalBackdrop').classList.add('open');
}
function openCourierModal() {
  let modal = $('#courierModalBackdrop');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'courierModalBackdrop'; modal.className = 'modal-backdrop';
    modal.innerHTML = `<section class="modal"><div class="modal-head"><h2>Ajouter un livreur</h2><button class="close" type="button" aria-label="Fermer">×</button></div><form id="courierForm"><div class="form-grid"><div class="field full"><label>Nom complet</label><input name="fullName" required placeholder="Ex. Koffi Kouamé"></div><div class="field full"><label>Téléphone</label><input name="phone" required placeholder="+225 07 00 00 00 00"></div></div><div class="modal-footer"><button type="button" class="button secondary" data-cancel>Annuler</button><button class="button">Ajouter à l’équipe</button></div></form></section>`;
    document.body.append(modal);
    modal.onclick = (event) => { if (event.target === modal || event.target.closest('.close') || event.target.closest('[data-cancel]')) modal.classList.remove('open'); };
    $('#courierForm').onsubmit = (event) => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const words = data.fullName.trim().split(/\s+/); const shortName = `${words[0][0]}. ${words.at(-1)}`;
      if (couriers.some((courier) => courier.name.toLowerCase() === shortName.toLowerCase())) { toast('Ce livreur figure déjà dans votre équipe.'); return; }
      couriers.push({ name: shortName, fullName: data.fullName.trim(), phone: data.phone.trim(), status: 'Disponible', active: true }); save(); modal.classList.remove('open'); event.currentTarget.reset(); render(); toast('Livreur ajouté à l’équipe.');
    };
  }
  modal.classList.add('open');
}
$('#closeModal').onclick = closeModal;
$('#cancelModal').onclick = closeModal;
$('#modalBackdrop').onclick = (event) => { if (event.target.id === 'modalBackdrop') closeModal(); };
document.querySelectorAll('[data-role]').forEach((button) => button.onclick = () => setRole(button.dataset.role));
$('#deliveryForm').onsubmit = (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const assigned = data.courier && data.courier !== 'À attribuer';
  const nextNumber = Math.max(2048, ...orders.map((order) => Number(order.id.replace('CL-', '')) || 0)) + 1;
  orders.unshift({ id: `CL-${nextNumber}`, recipient: data.recipient, phone: data.phone, pickup: data.pickup, dropoff: data.dropoff, courier: data.courier || 'À attribuer', status: assigned ? 'À récupérer' : 'À attribuer', parcel: data.parcel, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) });
  save(); filter = 'Tous'; searchTerm = ''; event.currentTarget.reset(); closeModal(); setRole('admin'); toast('Nouvelle livraison enregistrée.');
};
loginRole = window.location.hash === '#connexion-livreur' || window.location.hash === '#livreur' ? 'courier' : 'admin';
render();
