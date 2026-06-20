const SETTINGS_KEY = "tveter-freight-settings-v1";
const ARCHIVE_KEY = "tveter-freight-archive-v1";
const DRAFT_KEY = "tveter-freight-draft-v1";
const CONTACTS_KEY = "tveter-freight-contacts-v1";
const USERS_KEY = "tveter-freight-users-v1";
const SESSION_KEY = "tveter-freight-session-v1";

const fieldIds = [
  "shipmentDate", "pickupDate", "trackingNumber", "pickupPlace", "deliveryPlace",
  "senderName", "senderAddress", "senderContact", "senderPhone", "senderEmail",
  "recipientName", "recipientAddress", "recipientContact", "recipientPhone", "recipientEmail",
  "carrierName", "carrierAddress", "carrierContact", "carrierPhone", "carrierEmail",
  "goodsDescription", "customGoodsDescription", "grossWeightKg", "lotNumber", "packageCount", "packageType",
  "packageMarks", "sprayStatus", "organicStatus", "organicCode", "organicCertificate",
  "agricultureOrigin", "goodsNotes", "vehicleRegistration", "freightCharges",
  "attachedDocuments", "carrierSignatory", "carrierSignatureDate",
  "carrierInstructions", "declarationName", "declarationPlace"
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const defaultSettings = {
  emailEndpoint: "",
  internalRecipients: "",
  documentPrefix: "JOBA",
  defaultSenderName: "Tveter Gård Foredling AS"
};
const DEFAULT_PICKUP_PLACE = "Tveter gård, Mørkveien 640, 1592 Våler i Østfold, Norge";
const DEFAULT_DELIVERY_PLACE = "Tøsse Møllehuset, Osterøyveien 3384, 5284 Tyssebotnen, Norge";
const defaultContacts = [
  {
    id: "tveter-gard",
    name: "Tveter Gård Foredling AS",
    address: "Mørkveien 640, 1592 Våler i Østfold, Norge",
    contact: "",
    phone: "",
    email: ""
  }
];

let settings = loadJson(SETTINGS_KEY, defaultSettings);
let archive = loadJson(ARCHIVE_KEY, []);
let contacts = loadJson(CONTACTS_KEY, defaultContacts);
let users = loadJson(USERS_KEY, []);
let currentUser = null;
let appInitialized = false;
let toastTimer;

function loadJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return Array.isArray(fallback) ? [...fallback] : { ...fallback };
    const parsed = JSON.parse(stored);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : [...fallback];
    return { ...fallback, ...parsed };
  } catch {
    return Array.isArray(fallback) ? [] : { ...fallback };
  }
}

function localDateValue(date = new Date()) {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear()
  ].join(".");
}

function localDateTimeValue(date = new Date()) {
  return `${localDateValue(date)} kl. ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function normalizeEuropeanDate(value, includeTime = false) {
  if (!value) return "";
  if (/^\d{2}\.\d{2}\.\d{4}/.test(value)) return value;
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!iso) return value;
  const [, year, month, day, hour = "00", minute = "00"] = iso;
  return includeTime ? `${day}.${month}.${year} kl. ${hour}:${minute}` : `${day}.${month}.${year}`;
}

function formatDate(value, includeTime = false) {
  if (!value) return "Ikke oppgitt";
  const european = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})(?: kl\. (\d{2}):(\d{2}))?$/);
  if (european) {
    const [, day, month, year, hour, minute] = european;
    return includeTime && hour ? `${day}.${month}.${year} kl. ${hour}:${minute}` : `${day}.${month}.${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const dateText = new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
  if (!includeTime) return dateText;
  const timeText = new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return `${dateText} kl. ${timeText}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function normalizeUsername(value) {
  return value.trim().toLocaleLowerCase("nb-NO");
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function createSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: base64ToBytes(salt),
    iterations: 210000
  }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

async function buildUser({ id, name, username, role, password, active = true, createdAt }) {
  const salt = createSalt();
  return {
    id: id || `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    username: normalizeUsername(username),
    role,
    active,
    passwordSalt: salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: createdAt || new Date().toISOString()
  };
}

function saveUsers() {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function showAuthPanel(panel) {
  $("#authGate").hidden = false;
  $("#appRoot").hidden = true;
  $("#setupAdminForm").hidden = panel !== "setup";
  $("#loginForm").hidden = panel !== "login";
  $("#setupError").textContent = "";
  $("#loginError").textContent = "";
}

function updateCurrentUserDisplay() {
  $("#currentUserName").textContent = currentUser?.name || "";
  $("#currentUserRole").textContent = currentUser?.role === "admin" ? "Administrator" : "Bruker";
}

function startUserSession(user) {
  currentUser = user;
  sessionStorage.setItem(SESSION_KEY, user.id);
  $("#authGate").hidden = true;
  $("#appRoot").hidden = false;
  updateCurrentUserDisplay();
  initializeApp();
  renderUserManagement();
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  currentUser = null;
  $("#loginForm").reset();
  showAuthPanel("login");
  setTimeout(() => $("#loginUsername").focus(), 0);
}

async function setupAdministrator(event) {
  event.preventDefault();
  const password = $("#setupAdminPassword").value;
  const confirmation = $("#setupAdminPasswordConfirm").value;
  if (password !== confirmation) {
    $("#setupError").textContent = "Passordene er ikke like.";
    return;
  }
  const username = normalizeUsername($("#setupAdminUsername").value);
  if (users.some((user) => user.username === username)) {
    $("#setupError").textContent = "Brukernavnet er allerede i bruk.";
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Oppretter...";
  try {
    const administrator = await buildUser({
      name: $("#setupAdminName").value,
      username,
      role: "admin",
      password
    });
    users = [administrator];
    saveUsers();
    startUserSession(administrator);
    showToast("Administratorkontoen er opprettet.");
  } catch {
    $("#setupError").textContent = "Kunne ikke opprette brukeren i denne nettleseren.";
  } finally {
    button.disabled = false;
    button.textContent = "Opprett administrator";
  }
}

async function login(event) {
  event.preventDefault();
  const username = normalizeUsername($("#loginUsername").value);
  const user = users.find((item) => item.username === username);
  if (!user || !user.active) {
    $("#loginError").textContent = "Feil brukernavn eller passord.";
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Logger inn...";
  try {
    const candidateHash = await hashPassword($("#loginPassword").value, user.passwordSalt);
    if (candidateHash !== user.passwordHash) {
      $("#loginError").textContent = "Feil brukernavn eller passord.";
      return;
    }
    $("#loginForm").reset();
    startUserSession(user);
  } catch {
    $("#loginError").textContent = "Innlogging er ikke tilgjengelig i denne nettleseren.";
  } finally {
    button.disabled = false;
    button.textContent = "Logg inn";
  }
}

function startAuthentication() {
  if (!users.length) {
    showAuthPanel("setup");
    setTimeout(() => $("#setupAdminName").focus(), 0);
    return;
  }
  const sessionUserId = sessionStorage.getItem(SESSION_KEY);
  const sessionUser = users.find((user) => user.id === sessionUserId && user.active);
  if (sessionUser) {
    startUserSession(sessionUser);
    return;
  }
  showAuthPanel("login");
  setTimeout(() => $("#loginUsername").focus(), 0);
}

function renderUserManagement() {
  const management = $("#userManagement");
  const isAdmin = currentUser?.role === "admin";
  management.hidden = !isAdmin;
  if (!isAdmin) return;
  $("#userList").innerHTML = users
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "nb"))
    .map((user) => `
      <article class="user-record ${user.active ? "" : "inactive"}">
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <small>@${escapeHtml(user.username)} · ${user.role === "admin" ? "Administrator" : "Bruker"} · ${user.active ? "Aktiv" : "Deaktivert"}</small>
        </div>
        <div class="user-actions">
          <button class="secondary" type="button" data-edit-user="${escapeHtml(user.id)}">Rediger</button>
          <button class="secondary" type="button" data-toggle-user="${escapeHtml(user.id)}" ${user.id === currentUser.id ? "disabled" : ""}>${user.active ? "Deaktiver" : "Aktiver"}</button>
        </div>
      </article>
    `).join("");
}

function openUserDialog(user = null) {
  if (currentUser?.role !== "admin") return;
  $("#userForm").reset();
  $("#userFormError").textContent = "";
  $("#userRecordId").value = user?.id || "";
  $("#userFullName").value = user?.name || "";
  $("#userUsername").value = user?.username || "";
  $("#userRole").value = user?.role || "user";
  $("#userPassword").required = !user;
  $("#userPasswordLabel").childNodes[0].textContent = user ? "Nytt passord (valgfritt) " : "Passord * ";
  $("#userDialog h2").textContent = user ? "Rediger bruker" : "Opprett bruker";
  $("#userDialog").showModal();
  $("#userFullName").focus();
}

function closeUserDialog() {
  $("#userDialog").close();
}

async function saveUser(event) {
  event.preventDefault();
  if (currentUser?.role !== "admin") return;
  const recordId = $("#userRecordId").value;
  const existing = users.find((user) => user.id === recordId);
  const username = normalizeUsername($("#userUsername").value);
  if (users.some((user) => user.username === username && user.id !== recordId)) {
    $("#userFormError").textContent = "Brukernavnet er allerede i bruk.";
    return;
  }
  const password = $("#userPassword").value;
  if (!existing && password.length < 10) {
    $("#userFormError").textContent = "Passordet må inneholde minst 10 tegn.";
    return;
  }
  if (existing?.active && existing.role === "admin" && $("#userRole").value !== "admin") {
    const activeAdmins = users.filter((user) => user.active && user.role === "admin");
    if (activeAdmins.length === 1) {
      $("#userFormError").textContent = "Minst én aktiv administrator må beholdes.";
      return;
    }
  }
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Lagrer...";
  try {
    let user;
    if (existing) {
      user = {
        ...existing,
        name: $("#userFullName").value.trim(),
        username,
        role: $("#userRole").value
      };
      if (password) {
        const salt = createSalt();
        user.passwordSalt = salt;
        user.passwordHash = await hashPassword(password, salt);
      }
    } else {
      user = await buildUser({
        name: $("#userFullName").value,
        username,
        role: $("#userRole").value,
        password
      });
    }
    if (existing) users[users.findIndex((item) => item.id === existing.id)] = user;
    else users.push(user);
    if (currentUser.id === user.id) {
      currentUser = user;
      updateCurrentUserDisplay();
    }
    saveUsers();
    renderUserManagement();
    closeUserDialog();
    showToast(`${user.name} er lagret.`);
  } finally {
    button.disabled = false;
    button.textContent = "Lagre bruker";
  }
}

function toggleUser(userId) {
  if (currentUser?.role !== "admin" || userId === currentUser.id) return;
  const user = users.find((item) => item.id === userId);
  if (!user) return;
  if (user.active && user.role === "admin") {
    const activeAdmins = users.filter((item) => item.active && item.role === "admin");
    if (activeAdmins.length === 1) {
      showToast("Minst én aktiv administrator må beholdes.");
      return;
    }
  }
  user.active = !user.active;
  saveUsers();
  renderUserManagement();
  showToast(`${user.name} er ${user.active ? "aktivert" : "deaktivert"}.`);
}

function handleUserAction(event) {
  const editButton = event.target.closest("[data-edit-user]");
  const toggleButton = event.target.closest("[data-toggle-user]");
  if (editButton) openUserDialog(users.find((user) => user.id === editButton.dataset.editUser));
  if (toggleButton) toggleUser(toggleButton.dataset.toggleUser);
}

function contactId() {
  return `contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureDefaultContacts() {
  defaultContacts.forEach((defaultContact) => {
    if (!contacts.some((contact) => contact.id === defaultContact.id)) contacts.unshift(defaultContact);
  });
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

function renderPartySelects() {
  const options = contacts
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "nb"))
    .map((contact) => `<option value="${escapeHtml(contact.id)}">${escapeHtml(contact.name)}</option>`)
    .join("");
  $$("[data-party-select]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = `<option value="">Velg foretak</option>${options}`;
    if (contacts.some((contact) => contact.id === selected)) select.value = selected;
  });
}

function fillPartyFields(role, contact) {
  if (!contact) return;
  $(`#${role}Name`).value = contact.name || "";
  $(`#${role}Address`).value = contact.address || "";
  $(`#${role}Contact`).value = contact.contact || "";
  $(`#${role}Phone`).value = contact.phone || "";
  $(`#${role}Email`).value = contact.email || "";
  saveDraft();
}

function selectContact(role, contactIdValue) {
  const contact = contacts.find((item) => item.id === contactIdValue);
  if (contact) fillPartyFields(role, contact);
}

function openPartyDialog(role) {
  $("#partyForm").reset();
  $("#partyTarget").value = role;
  $("#partyRecordId").value = "";
  $("#partyDialog h2").textContent = "Legg til nytt foretak";
  $("#partyDialog").showModal();
  $("#partyName").focus();
}

function editSelectedParty(role) {
  const selectedId = $(`#${role}PartySelect`).value;
  const contact = contacts.find((item) => item.id === selectedId);
  if (!contact) {
    showToast("Velg et lagret foretak først.");
    return;
  }
  $("#partyForm").reset();
  $("#partyTarget").value = role;
  $("#partyRecordId").value = contact.id;
  $("#partyName").value = contact.name;
  $("#partyAddress").value = contact.address;
  $("#partyContact").value = contact.contact;
  $("#partyPhone").value = contact.phone;
  $("#partyEmail").value = contact.email;
  $("#partyDialog h2").textContent = "Rediger foretak";
  $("#partyDialog").showModal();
  $("#partyName").focus();
}

function closePartyDialog() {
  $("#partyDialog").close();
}

function saveParty(event) {
  event.preventDefault();
  const recordId = $("#partyRecordId").value;
  const contact = {
    id: recordId || contactId(),
    name: $("#partyName").value.trim(),
    address: $("#partyAddress").value.trim(),
    contact: $("#partyContact").value.trim(),
    phone: $("#partyPhone").value.trim(),
    email: $("#partyEmail").value.trim()
  };
  const existingIndex = contacts.findIndex((item) => item.id === recordId);
  if (existingIndex >= 0) contacts[existingIndex] = contact;
  else contacts.push(contact);
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  renderPartySelects();
  const role = $("#partyTarget").value;
  $(`#${role}PartySelect`).value = contact.id;
  fillPartyFields(role, contact);
  closePartyDialog();
  showToast(`${contact.name} er lagret og valgt.`);
}

function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4200);
}

function setView(viewId) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function nextDocumentNumber() {
  const date = new Date();
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
  const todayCount = archive.filter((item) => item.documentNumber?.includes(datePart)).length + 1;
  return `${(settings.documentPrefix || "JOBA").toUpperCase()}-${datePart}-${String(todayCount).padStart(3, "0")}`;
}

function collectFormData() {
  const data = Object.fromEntries(fieldIds.map((field) => [field, $(`#${field}`).value.trim()]));
  data.goodsDescription = data.goodsDescription === "other"
    ? data.customGoodsDescription
    : data.goodsDescription;
  data.declarationAccepted = $("#declarationAccepted").checked;
  data.createdAt = new Date().toISOString();
  return data;
}

function saveDraft() {
  const draft = collectFormData();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  $("#draftState").textContent = "Utkast lagret";
}

function restoreDraft() {
  const draft = loadJson(DRAFT_KEY, {});
  fieldIds.forEach((field) => {
    if (draft[field] !== undefined && $(`#${field}`)) $(`#${field}`).value = draft[field];
  });
  const savedGoods = draft.customGoodsDescription || draft.goodsDescription || "";
  if (savedGoods && !["Svarthavre", "Hvithavre", "other"].includes(savedGoods)) {
    $("#goodsDescription").value = "other";
    $("#customGoodsDescription").value = savedGoods;
  }
  $("#shipmentDate").value = normalizeEuropeanDate($("#shipmentDate").value);
  $("#pickupDate").value = normalizeEuropeanDate($("#pickupDate").value, true);
  $("#carrierSignatureDate").value = normalizeEuropeanDate($("#carrierSignatureDate").value);
  $("#declarationAccepted").checked = Boolean(draft.declarationAccepted);
  if (!$("#shipmentDate").value) $("#shipmentDate").value = localDateValue();
  if (!$("#pickupDate").value) $("#pickupDate").value = localDateTimeValue();
  if (!$("#carrierSignatureDate").value) $("#carrierSignatureDate").value = localDateValue();
  if (!$("#pickupPlace").value) $("#pickupPlace").value = DEFAULT_PICKUP_PLACE;
  if (!$("#deliveryPlace").value) $("#deliveryPlace").value = DEFAULT_DELIVERY_PLACE;
  if (!$("#trackingNumber").value) $("#trackingNumber").value = nextDocumentNumber();
  if (!$("#senderName").value) {
    const defaultSender = contacts.find((contact) => contact.id === "tveter-gard");
    fillPartyFields("sender", defaultSender);
    $("#senderPartySelect").value = defaultSender?.id || "";
  }
  toggleCustomGoods();
  toggleOrganicFields();
}

function toggleCustomGoods() {
  const custom = $("#goodsDescription").value === "other";
  $("#customGoodsLabel").hidden = !custom;
  $("#customGoodsDescription").required = custom;
  if (!custom) $("#customGoodsDescription").value = "";
}

function toggleOrganicFields() {
  const organic = $("#organicStatus").value === "organic";
  $("#organicDetails").hidden = !organic;
  $("#organicCertificate").required = organic;
  $("#agricultureOrigin").required = organic;
  $("#organicCodeLabel").style.opacity = organic ? "1" : ".5";
}

function sprayLabel(status) {
  return {
    unsprayed: "Usprøytet",
    sprayed: "Sprøytet / behandlet",
    unknown: "Ikke avklart"
  }[status] || "Ikke oppgitt";
}

function organicLabel(data) {
  if (data.organicStatus === "organic") return `Økologisk (${data.organicCode}, sertifikat ${data.organicCertificate})`;
  if (data.organicStatus === "conversion") return "Karens / under omlegging";
  return "Ikke økologisk";
}

function packageQuantityLabel(data) {
  const quantity = Number(data.packageCount).toLocaleString("nb-NO", { maximumFractionDigits: 2 });
  return data.packageType === "Bulk"
    ? `${quantity} kg løsvekt`
    : `${quantity} kolli (${data.packageType})`;
}

function addWrappedText(doc, text, x, y, maxWidth, options = {}) {
  const lines = doc.splitTextToSize(String(text || "-"), maxWidth);
  doc.text(lines, x, y, options);
  return y + lines.length * 4.7;
}

function addSection(doc, title, rows, y) {
  if (y > 250) {
    doc.addPage();
    y = 18;
  }
  doc.setFillColor(39, 75, 59);
  doc.roundedRect(14, y, 182, 8, 1, 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, 18, y + 5.4);
  y += 12;
  doc.setTextColor(29, 37, 33);
  doc.setFontSize(8.7);

  rows.forEach(([label, value]) => {
    const valueLines = doc.splitTextToSize(String(value || "-"), 128);
    const rowHeight = Math.max(8, valueLines.length * 4.3 + 3);
    if (y + rowHeight > 282) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.text(label, 16, y + 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(valueLines, 66, y + 4.5);
    doc.setDrawColor(220, 224, 220);
    doc.line(14, y + rowHeight, 196, y + rowHeight);
    y += rowHeight;
  });
  return y + 5;
}

function createPdf(data, documentNumber) {
  if (!window.jspdf?.jsPDF) throw new Error("PDF-biblioteket kunne ikke lastes.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({
    title: `Fraktbrev ${documentNumber}`,
    subject: "Fraktbrev for korntransport",
    author: data.senderName
  });

  doc.setFillColor(39, 75, 59);
  doc.rect(0, 0, 210, 31, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.text("FRAKTBREV", 14, 14);
  doc.setFontSize(10);
  doc.text(documentNumber, 14, 22);
  doc.setFont("helvetica", "normal");
  doc.text(`Utstedt ${formatDate(data.createdAt, true)}`, 196, 14, { align: "right" });
  doc.text(`Sporing: ${data.trackingNumber}`, 196, 22, { align: "right" });

  let y = 38;
  y = addSection(doc, "SENDING", [
    ["Forsendelsesdato", formatDate(data.shipmentDate)],
    ["Overtakelse", `${formatDate(data.pickupDate, true)} - ${data.pickupPlace}`],
    ["Leveringssted", data.deliveryPlace]
  ], y);
  y = addSection(doc, "PARTER", [
    ["Avsender", `${data.senderName}\n${data.senderAddress}\nKontakt: ${data.senderContact}, ${data.senderPhone}, ${data.senderEmail}`],
    ["Mottaker", `${data.recipientName}\n${data.recipientAddress}\nKontakt: ${data.recipientContact}, ${data.recipientPhone}, ${data.recipientEmail}`],
    ["Fraktfører", `${data.carrierName}\n${data.carrierAddress}\nKontakt: ${data.carrierContact}, ${data.carrierPhone}, ${data.carrierEmail}`]
  ], y);
  y = addSection(doc, "GODS OG KORN", [
    ["Vare", data.goodsDescription],
    ["Mengde", `${Number(data.grossWeightKg).toLocaleString("nb-NO")} kg bruttovekt - ${packageQuantityLabel(data)}`],
    ["Parti / merker", `${data.lotNumber}${data.packageMarks ? ` - ${data.packageMarks}` : ""}`],
    ["Plantevernstatus", sprayLabel(data.sprayStatus)],
    ["Økologisk status", organicLabel(data)],
    ["Opprinnelse", data.organicStatus === "organic" ? data.agricultureOrigin : "Ikke relevant"],
    ["Godsopplysninger", data.goodsNotes]
  ], y);
  y = addSection(doc, "TRANSPORT", [
    ["Kjøretøy", data.vehicleRegistration],
    ["Fraktkostnad", data.freightCharges],
    ["Følgedokumenter", data.attachedDocuments],
    ["Opprettet av", data.createdByName || "Ikke registrert"],
    ["Fraktfører signerer", `${data.carrierSignatory} - ${formatDate(data.carrierSignatureDate)}`],
    ["Instruksjoner", data.carrierInstructions]
  ], y);

  if (y > 235) {
    doc.addPage();
    y = 18;
  }
  doc.setDrawColor(39, 75, 59);
  doc.setLineWidth(.6);
  doc.roundedRect(14, y, 182, 49, 2, 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AVSENDERERKLÆRING", 18, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  y = addWrappedText(doc, "Avsender bekrefter at opplysningene i fraktbrevet er riktige, herunder plantevernstatus og økologisk status.", 18, y + 13, 174);
  doc.text(`Bekreftet av: ${data.declarationName}`, 18, y + 5);
  doc.text(`Sted: ${data.declarationPlace}`, 112, y + 5);
  doc.text(`Dato: ${formatDate(data.createdAt, true)}`, 18, y + 11);
  doc.setDrawColor(101, 112, 105);
  doc.line(18, y + 24, 90, y + 24);
  doc.line(112, y + 24, 184, y + 24);
  doc.setFontSize(7.5);
  doc.text("Avsenders signatur / stempel", 18, y + 28);
  doc.text(`Fraktførers signatur / stempel (${data.carrierSignatory})`, 112, y + 28);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setTextColor(101, 112, 105);
    doc.setFontSize(7);
    doc.text(`${documentNumber} - Side ${page} av ${pageCount}`, 196, 291, { align: "right" });
  }
  return doc;
}

function pdfBase64(doc) {
  return doc.output("datauristring").split(",")[1];
}

function uniqueRecipients(data) {
  const internal = settings.internalRecipients.split(",").map((item) => item.trim());
  return [...new Set([data.senderEmail, data.recipientEmail, data.carrierEmail, ...internal]
    .filter(Boolean)
    .map((email) => email.toLowerCase()))];
}

async function sendEmail(data, documentNumber, doc) {
  if (!settings.emailEndpoint) throw new Error("E-postkobling er ikke konfigurert.");
  const recipients = uniqueRecipients(data);
  const payload = {
    documentNumber,
    subject: `Fraktbrev ${documentNumber} - ${data.goodsDescription}`,
    recipients,
    replyTo: data.senderEmail,
    body: `Vedlagt følger fraktbrev ${documentNumber} for ${data.goodsDescription}, ${data.grossWeightKg} kg, fra ${data.senderName} til ${data.recipientName}.`,
    filename: `fraktbrev-${documentNumber}.pdf`,
    pdfBase64: pdfBase64(doc)
  };
  await fetch(settings.emailEndpoint, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  return recipients;
}

function downloadPdf(doc, documentNumber) {
  doc.save(`fraktbrev-${documentNumber}.pdf`);
}

async function submitFreight(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const data = collectFormData();
  data.createdById = currentUser.id;
  data.createdByName = currentUser.name;
  const documentNumber = nextDocumentNumber();
  const button = $("#submitButton");
  button.disabled = true;
  button.textContent = "Lager PDF...";

  try {
    const doc = createPdf(data, documentNumber);
    let emailStatus = "PDF lastet ned - e-post ikke konfigurert";
    let recipients = [];
    if (settings.emailEndpoint) {
      button.textContent = "Sender e-post...";
      recipients = await sendEmail(data, documentNumber, doc);
      emailStatus = `Sendt til ${recipients.length} mottaker(e)`;
    } else {
      downloadPdf(doc, documentNumber);
    }

    archive.unshift({
      documentNumber,
      data,
      emailStatus,
      recipients,
      createdById: currentUser.id,
      createdByName: currentUser.name,
      savedAt: new Date().toISOString()
    });
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
    localStorage.removeItem(DRAFT_KEY);
    renderArchive();
    showToast(`${documentNumber} er opprettet. ${emailStatus}.`);
    $("#freightForm").reset();
    $("#shipmentDate").value = localDateValue();
    $("#pickupDate").value = localDateTimeValue();
    $("#carrierSignatureDate").value = localDateValue();
    $("#pickupPlace").value = DEFAULT_PICKUP_PLACE;
    $("#deliveryPlace").value = DEFAULT_DELIVERY_PLACE;
    $("#trackingNumber").value = nextDocumentNumber();
    const defaultSender = contacts.find((contact) => contact.id === "tveter-gard");
    fillPartyFields("sender", defaultSender);
    $("#senderPartySelect").value = defaultSender?.id || "";
    toggleCustomGoods();
    toggleOrganicFields();
    $("#documentNumberPreview").textContent = nextDocumentNumber();
    $("#draftState").textContent = "Nytt utkast";
  } catch (error) {
    showToast(`Kunne ikke fullføre: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Opprett PDF og send";
  }
}

function renderArchive() {
  const container = $("#archiveList");
  if (!archive.length) {
    container.innerHTML = '<div class="empty">Ingen fraktbrev er opprettet på denne enheten ennå.</div>';
    return;
  }
  container.innerHTML = archive.map((item, index) => `
    <article class="archive-item">
      <div>
        <h2>${escapeHtml(item.documentNumber)}</h2>
        <div class="archive-meta">${escapeHtml(item.data.goodsDescription)} · ${Number(item.data.grossWeightKg).toLocaleString("nb-NO")} kg · ${escapeHtml(item.data.senderName)} → ${escapeHtml(item.data.recipientName)} · ${formatDate(item.savedAt, true)} · Opprettet av ${escapeHtml(item.createdByName || item.data.createdByName || "ukjent bruker")}</div>
        <span class="status ${item.emailStatus.includes("ikke") ? "error" : ""}">${escapeHtml(item.emailStatus)}</span>
      </div>
      <div class="archive-actions">
        <button class="secondary" type="button" data-download="${index}">Last ned PDF</button>
        ${settings.emailEndpoint ? `<button class="secondary" type="button" data-resend="${index}">Send på nytt</button>` : ""}
      </div>
    </article>
  `).join("");
}

async function handleArchiveAction(event) {
  const downloadButton = event.target.closest("[data-download]");
  const resendButton = event.target.closest("[data-resend]");
  if (!downloadButton && !resendButton) return;
  const index = Number((downloadButton || resendButton).dataset[downloadButton ? "download" : "resend"]);
  const item = archive[index];
  if (!item) return;
  try {
    const doc = createPdf(item.data, item.documentNumber);
    if (downloadButton) {
      downloadPdf(doc, item.documentNumber);
      return;
    }
    const recipients = await sendEmail(item.data, item.documentNumber, doc);
    item.emailStatus = `Sendt på nytt til ${recipients.length} mottaker(e)`;
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
    renderArchive();
    showToast(`${item.documentNumber} er sendt på nytt.`);
  } catch (error) {
    showToast(`Kunne ikke sende: ${error.message}`);
  }
}

function loadSettingsForm() {
  Object.keys(defaultSettings).forEach((key) => {
    $(`#${key}`).value = settings[key] || "";
  });
  updateEmailReadiness();
}

function saveSettings(event) {
  event.preventDefault();
  settings = Object.fromEntries(Object.keys(defaultSettings).map((key) => [key, $(`#${key}`).value.trim()]));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  $("#documentNumberPreview").textContent = nextDocumentNumber();
  updateEmailReadiness();
  renderArchive();
  showToast("Innstillingene er lagret på denne enheten.");
}

function updateEmailReadiness() {
  $("#emailReadiness").textContent = settings.emailEndpoint
    ? "Klar til å sende til partene og interne kopimottakere."
    : "E-postkobling er ikke konfigurert. PDF blir lastet ned.";
}

function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(() => {});
}

function initializeApp() {
  if (!appInitialized) {
    ensureDefaultContacts();
    renderPartySelects();
    loadSettingsForm();
    restoreDraft();
    renderArchive();
    $("#documentNumberPreview").textContent = nextDocumentNumber();
    appInitialized = true;
    return;
  }
  renderPartySelects();
  renderArchive();
}

$$(".nav-button").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
$$("[data-party-select]").forEach((select) => {
  select.addEventListener("change", () => selectContact(select.dataset.partySelect, select.value));
});
$$("[data-add-party]").forEach((button) => {
  button.addEventListener("click", () => openPartyDialog(button.dataset.addParty));
});
$$("[data-edit-party]").forEach((button) => {
  button.addEventListener("click", () => editSelectedParty(button.dataset.editParty));
});
$("#partyForm").addEventListener("submit", saveParty);
$("#closePartyDialog").addEventListener("click", closePartyDialog);
$("#cancelPartyDialog").addEventListener("click", closePartyDialog);
$("#freightForm").addEventListener("submit", submitFreight);
$("#freightForm").addEventListener("input", saveDraft);
$("#goodsDescription").addEventListener("change", toggleCustomGoods);
$("#organicStatus").addEventListener("change", toggleOrganicFields);
$("#settingsForm").addEventListener("submit", saveSettings);
$("#archiveList").addEventListener("click", handleArchiveAction);
$("#setupAdminForm").addEventListener("submit", setupAdministrator);
$("#loginForm").addEventListener("submit", login);
$("#logoutButton").addEventListener("click", logout);
$("#addUserButton").addEventListener("click", () => openUserDialog());
$("#userForm").addEventListener("submit", saveUser);
$("#closeUserDialog").addEventListener("click", closeUserDialog);
$("#cancelUserDialog").addEventListener("click", closeUserDialog);
$("#userList").addEventListener("click", handleUserAction);

registerPwa();
startAuthentication();
