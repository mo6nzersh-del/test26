import{r as initPage,u as updateDoc,a as docRef,d as db,s as serverTimestamp,b as addDoc,c as collection,q as query,o as orderBy,e as onSnapshot,f as deleteDoc,k as writeBatch}from"./auth-guard-DMMO1gWE.js";
import{r as renderNav,s as showToast,f as formatDate}from"./nav-C4LmEyvm.js";
import{f as compressImage}from"./image-utils-ix_Ztzsr.js";

const BASE = "/";

/* ─── alias map: email → اسم مستعار ─── */
let emailToAlias = {};
function resolveAlias(email) {
  if (!email || email === "—") return email;
  return emailToAlias[email] || email;
}
let aliasesStarted = false;
function listenAliases() {
  if (aliasesStarted) return;
  aliasesStarted = true;
  onSnapshot(collection(db, "appUsers"), snap => {
    emailToAlias = {};
    snap.forEach(d => {
      const { email, alias } = d.data();
      if (email && alias) emailToAlias[email] = alias;
    });
  }, err => console.error("aliases listener:", err));
}

/* ─── state ─── */
let currentUser = null;
let warehouses = [];
let products = [];
let merchants = [];
let warehousesLoaded = false;
let productsLoaded = false;
let merchantsLoaded = false;
let merchantBalancesStarted = false;
let movementsRecordsStarted = false;
let loadingRecordsStarted = false;
let activityLogStarted = false;
let warehouseViewActivated = false;
let warehousesLoadVersion = 0;
let productsLoadVersion = 0;
let pendingProductFile = null;
let editingProductId = null;

// production form lines
let prodInputLines = [];
let prodOutputLines = [];
let lineCounter = 0;

// loading form lines
let loadLines = [];
let loadLineCounter = 0;

// merchant balance caches (يطابق منطق calcBalance في صفحة التجار)
// merchantTransactions : type="out" → دين | type="in" → دفع
// finance_transactions  : type="merchant", dir="in" → دفع | dir="out" → دين
let _merchantTxBal  = {};   // من merchantTransactions
let _merchantFinBal = {};   // من finance_transactions (type=merchant, _active≠false)
let merchantBalances = {};  // المجموع = _merchantTxBal + _merchantFinBal

// caches of full operation records, keyed by opId, for detail replay
let movementsRecordsCache = {};
let loadingRecordsCache = {};
let warehouseRenderVersion = 0;

/* ─── helpers ─── */
function esc(v) {
  const d = document.createElement("div");
  d.textContent = v ?? "";
  return d.innerHTML;
}
function fmtMoney(v) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(v || 0) + " ج.م";
}
function fmtNum(v) {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 3 }).format(v || 0);
}
function fmtDateTime(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  return d.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateTimeLong(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  return d.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* select editable number values on interaction so typing replaces them immediately */
function initNumberInputSelection() {
  function selectIfEditableNumber(target) {
    if (!(target instanceof HTMLInputElement) ||
        target.type !== "number" ||
        target.readOnly ||
        target.disabled) return;
    target.select();
  }

  document.addEventListener("focusin", event => {
    selectIfEditableNumber(event.target);
  });
  document.addEventListener("click", event => {
    selectIfEditableNumber(event.target);
  });
}

/* serial ID: W{warehouseIndex}-{5-digit sequence} — always auto-generated */
function generateSerial(warehouseId) {
  const idx = warehouses.findIndex(w => w.id === warehouseId);
  const whNum = idx >= 0 ? idx + 1 : 1;
  // count existing products in this warehouse (already loaded) + 1
  const count = products.filter(p => p.warehouseId === warehouseId).length + 1;
  return `W${whNum}-${String(count).padStart(5, "0")}`;
}

function scheduleWhenIdle(task) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(task, { timeout: 1000 });
  } else {
    setTimeout(task, 0);
  }
}

function mapDocsInChunks(docs, mapDoc, done) {
  const result = [];
  let index = 0;
  const processChunk = () => {
    const end = Math.min(index + 150, docs.length);
    for (; index < end; index += 1) result.push(mapDoc(docs[index]));
    if (index < docs.length) {
      setTimeout(processChunk, 0);
    } else {
      done(result);
    }
  };
  processChunk();
}

/* ─── init ─── */
initPage(user => {
  currentUser = user;
  const app = document.getElementById("app");
  if (app) app.style.visibility = "visible";
  const loader = document.getElementById("page-loader");
  if (loader) {
    // إيقاف الغطاء فور نجاح المصادقة، قبل بدء تهيئة البيانات.
    loader.classList.add("pl-hide");
    loader.style.pointerEvents = "none";
  }

  const initializePage = () => {
    const initializers = [
      // ابنِ التنقل أولاً، واعزل فشله عن بقية تهيئة الصفحة.
      ["شريطا التنقل", () => renderNav(`${BASE}products.html`, user)],
      ["اختيار حقول الأرقام", initNumberInputSelection],
      ["التبويبات", initTabs],
      ["أحداث المخازن", initWarehouseContainerDelegation],
      ["نافذة المخزن", initWarehouseModal],
      ["نافذة المنتج", initProductModal],
      ["نافذة الفاتورة", initInvoiceModal],
      ["نافذة الحركة المحذوفة", initOpDeletedModal],
      ["مبدل نوع العملية", initOpTypeSwitcher],
      ["نموذج الإنتاج", initProductionForm],
      ["نموذج التحويل", initTransferForm],
      ["نموذج البيع", initLoadingForm],
    ];

    initializers.forEach(([name, initialize]) => {
      try {
        initialize();
      } catch (err) {
        console.error(`Products page initialization failed: ${name}`, err);
      }
    });

    // اترك للمتصفح فرصة رسم الواجهة والاستجابة للمس قبل بدء اشتراكات Firestore.
    scheduleWhenIdle(() => {
      try { loadWarehouses(); } catch (err) {
        console.error("Products page initialization failed: تحميل المخازن", err);
      }
      try { loadProducts(); } catch (err) {
        console.error("Products page initialization failed: تحميل المنتجات", err);
      }
    }, 0);
  };

  // أعطِ الهاتف فرصة لرسم الواجهة قبل أي تهيئة إضافية.
  setTimeout(initializePage, 0);
});

/* ══════════════════════════════════════
   TABS
══════════════════════════════════════ */
function initTabs() {
  const tabs = {
    movements: { btn: document.getElementById("tab-movements"),   view: document.getElementById("view-movements") },
    loading:   { btn: document.getElementById("tab-loading"),     view: document.getElementById("view-loading") },
    warehouses:{ btn: document.getElementById("tab-warehouses"),  view: document.getElementById("view-warehouses") },
    log:       { btn: document.getElementById("tab-log"),         view: document.getElementById("view-log") },
  };
  Object.entries(tabs).forEach(([key, { btn }]) => {
    btn.addEventListener("click", () => {
      Object.values(tabs).forEach(({ btn: b, view: v }) => {
        b.classList.remove("active");
        v.classList.remove("active");
      });
      tabs[key].btn.classList.add("active");
      tabs[key].view.classList.add("active");
      if (key === "loading") {
        loadMerchants();
        listenMerchantBalances();
      }
      if (key === "warehouses") {
        warehouseViewActivated = true;
        if (warehousesLoaded && productsLoaded) renderWarehousesContainer();
      }
      if (key === "log") {
        listenAliases();
        loadMovementsRecords();
        loadLoadingRecords();
        loadActivityLog();
      }
    });
  });
}

/* ══════════════════════════════════════
   LOAD DATA
══════════════════════════════════════ */
function loadWarehouses() {
  const q = query(collection(db, "warehouses"), orderBy("createdAt", "asc"));
  onSnapshot(q, snap => {
    const docs = snap.docs;
    const version = ++warehousesLoadVersion;
    mapDocsInChunks(docs, d => ({ id: d.id, ...d.data() }), mapped => {
      if (version !== warehousesLoadVersion) return;
      warehouses = mapped;
      warehousesLoaded = true;
      if (productsLoaded && warehouseViewActivated) renderWarehousesContainer();
      refreshAllWarehouseSelects();
    });
  }, err => console.error(err));
}

function loadProducts() {
  const q = query(collection(db, "products"), orderBy("createdAt", "asc"));
  onSnapshot(q, snap => {
    const docs = snap.docs;
    const version = ++productsLoadVersion;
    mapDocsInChunks(docs, d => ({ id: d.id, ...d.data() }), mapped => {
      if (version !== productsLoadVersion) return;
      products = mapped;
      productsLoaded = true;
      if (warehousesLoaded && warehouseViewActivated) renderWarehousesContainer();
      if (document.getElementById("view-loading")) renderLoadLines();
    });
  }, err => console.error(err));
}

function loadMerchants() {
  if (merchantsLoaded) return;
  merchantsLoaded = true;
  const q = query(collection(db, "merchants"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    merchants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshMerchantSelects();
    _refreshSearchableSelect(document.getElementById("load-merchant"));
    updateSaleSummary();
  }, err => console.error(err));
}

/* ══ رصيد كل تاجر — يطابق calcBalance في صفحة التجار ══
   المصدر 1: merchantTransactions  (type=out → دين، type=in → دفع)
   المصدر 2: finance_transactions  (type=merchant، _active≠false، dir=in → دفع، dir=out → دين)
   الرصيد السالب = التاجر مدين | الموجب = للتاجر رصيد دائن                    */
function _rebuildMerchantBalances() {
  const allMids = new Set([...Object.keys(_merchantTxBal), ...Object.keys(_merchantFinBal)]);
  merchantBalances = {};
  allMids.forEach(mid => {
    merchantBalances[mid] = (_merchantTxBal[mid] || 0) + (_merchantFinBal[mid] || 0);
  });
  updateSaleSummary();
  _refreshSearchableSelect(document.getElementById("load-merchant"));
}

function listenMerchantBalances() {
  if (merchantBalancesStarted) return;
  merchantBalancesStarted = true;
  // المصدر 1
  onSnapshot(query(collection(db, "merchantTransactions")), snap => {
    _merchantTxBal = {};
    snap.forEach(d => {
      const tx = d.data();
      const mid = tx.merchantId; if (!mid) return;
      if (!_merchantTxBal[mid]) _merchantTxBal[mid] = 0;
      _merchantTxBal[mid] += (tx.type === "in" ? 1 : -1) * (tx.amount || 0);
    });
    _rebuildMerchantBalances();
  }, err => console.error("merchantTxBal listener:", err));

  // المصدر 2
  onSnapshot(collection(db, "finance_transactions"), snap => {
    _merchantFinBal = {};
    snap.docs
      .filter(d => d.data()._active !== false && d.data().type === "merchant")
      .forEach(d => {
        const tx = d.data();
        const mid = tx.merchantId; if (!mid) return;
        if (!_merchantFinBal[mid]) _merchantFinBal[mid] = 0;
        _merchantFinBal[mid] += (tx.dir === "in" ? 1 : -1) * (tx.amount || 0);
      });
    _rebuildMerchantBalances();
  }, err => console.error("merchantFinBal listener:", err));
}

/* ══════════════════════════════════════
   WAREHOUSE SECTIONS
══════════════════════════════════════ */
function renderWarehousesContainer() {
  const container = document.getElementById("warehouses-container");
  if (!container || !warehouseViewActivated) return;
  const renderVersion = ++warehouseRenderVersion;
  if (warehouses.length === 0) {
    container.innerHTML = '<div class="empty-state">لا توجد مخازن بعد. أضف مخزنًا أولاً.</div>';
    return;
  }
  container.innerHTML = "";
  let index = 0;
  const renderNextWarehouse = () => {
    if (renderVersion !== warehouseRenderVersion) return;
    const wh = warehouses[index];
    if (!wh) return;
    const whProducts = products.filter(p => p.warehouseId === wh.id);
    container.appendChild(buildWarehouseSection(wh, whProducts));
    index += 1;
    if (index < warehouses.length) requestAnimationFrame(renderNextWarehouse);
  };
  requestAnimationFrame(renderNextWarehouse);
}

function buildWarehouseSection(wh, whProducts) {
  const section = document.createElement("div");
  section.className = "warehouse-section";
  section.dataset.whId = wh.id;
  const badge = whProducts.length > 0 ? `<span class="wh-count">${whProducts.length} منتج</span>` : "";
  section.innerHTML = `
    <div class="warehouse-section-header">
      <div class="warehouse-section-title"><span class="wh-title-icon">🏪</span> ${esc(wh.name)} ${badge}</div>
      <div class="warehouse-section-actions" style="display:flex;gap:8px">
        <button type="button" class="btn small" data-wh-add="${wh.id}">+ إضافة منتج</button>
      </div>
    </div>
    <div class="warehouse-section-body">
      <div class="wh-products-grid" id="wh-grid-${wh.id}">
        ${whProducts.length === 0
          ? '<div class="wh-empty-products">لا توجد منتجات في هذا المخزن بعد</div>'
          : whProducts.map(p => buildProductCardHTML(p)).join("")}
      </div>
    </div>`;
  return section;
}

function buildProductCardHTML(p) {
  const ICONS = ["📦","🏷️","🗃️","📋","🧺","🛒","📌","🗂️"];
  const icon = p.imageUrl
    ? `<img style="width:22px;height:22px;object-fit:cover;border-radius:4px" src="${p.imageUrl}" alt="" />`
    : ICONS[(p.name || "").charCodeAt(0) % ICONS.length] || "📦";
  return `
    <div class="wh-product-card${p.isVisiting ? " visiting" : ""}">
      <span class="wpc-icon">${icon}</span>
      <div class="wpc-info">
        <div class="wpc-name" title="${esc(p.name)}">${esc(p.name)}${p.isVisiting ? ` <span class="wh-product-visiting-badge" title="صنف زائر من مخزن آخر — نفس المعرّف الأصلي">زائر</span>` : ""}</div>
        ${p.serialId ? `<div class="wpc-serial"># ${esc(p.serialId)}</div>` : ""}
        ${p.description ? `<div class="wpc-desc">${esc(p.description)}</div>` : ""}
      </div>
      <div class="wpc-qty-badge">
        <span class="wpc-qty-num">${fmtNum(p.quantity || 0)}</span>
        <span class="wpc-qty-unit">${esc(p.quantityType || "")}</span>
      </div>
      <div class="wpc-right">
        <div class="wpc-price">${p.price ? fmtMoney(p.price) : "—"}</div>
        <button type="button" class="wpc-edit-btn edit-prod-btn" data-prod-id="${p.id}">تعديل</button>
      </div>
    </div>`;
}

function initWarehouseContainerDelegation() {
  const container = document.getElementById("warehouses-container");
  if (!container) return;
  container.addEventListener("click", e => {
    // حذف المخازن أصبح متاحاً فقط من صفحة DeepLog
    const btn = e.target.closest("[data-wh-add],[data-prod-id]");
    if (!btn) return;
    if (btn.dataset.whAdd) { openProductModal(null, btn.dataset.whAdd); return; }
    if (btn.dataset.prodId && btn.classList.contains("edit-prod-btn")) {
      const prod = products.find(p => p.id === btn.dataset.prodId);
      if (prod) openProductModal(prod, prod.warehouseId);
    }
  });
}

/* ══════════════════════════════════════
   WAREHOUSE MODAL
══════════════════════════════════════ */
function initWarehouseModal() {
  const modal = document.getElementById("warehouse-modal");
  const form = document.getElementById("warehouse-form");
  const submitBtn = document.getElementById("warehouse-submit-btn");
  document.getElementById("add-warehouse-btn").addEventListener("click", () => { form.reset(); modal.classList.add("open"); });
  document.getElementById("warehouse-modal-close").addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("warehouse-name").value.trim();
    if (!name) return;
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner"></span>';
    try {
      await addDoc(collection(db, "warehouses"), { name, createdAt: serverTimestamp() });
      await addDoc(collection(db, "auditLog"), {
        action: "إضافة", entity: "مخزن", page: "المنتجات", details: name,
        userEmail: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      }).catch(err => console.error("auditLog write failed", err));
      showToast("تمت إضافة المخزن");
      modal.classList.remove("open");
    } catch (err) { console.error(err); showToast("حدث خطأ", true); }
    finally { submitBtn.disabled = false; submitBtn.textContent = "حفظ المخزن"; }
  });
}

/* حذف المخازن أصبح متاحاً فقط من صفحة DeepLog، ولا يمكن تنفيذه من هذه الصفحة */

/* ══════════════════════════════════════
   PRODUCT MODAL
══════════════════════════════════════ */
function initProductModal() {
  const modal = document.getElementById("product-modal");
  const fileInput = document.getElementById("product-image");
  const dropLabel = document.getElementById("file-drop-label");
  const preview = document.getElementById("image-preview");
  const dropText = document.getElementById("file-drop-text");
  document.getElementById("product-modal-close").addEventListener("click", closeProductModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeProductModal(); });
  dropLabel.addEventListener("click", e => { e.preventDefault(); fileInput.click(); });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    pendingProductFile = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
    dropText.textContent = file.name;
  });
  document.getElementById("product-form").addEventListener("submit", async e => {
    e.preventDefault();
    await saveProduct();
  });
}

function openProductModal(product, warehouseId) {
  editingProductId = product ? product.id : null;
  pendingProductFile = null;
  const modal = document.getElementById("product-modal");
  const title = document.getElementById("product-modal-title");
  const form = document.getElementById("product-form");
  const preview = document.getElementById("image-preview");
  const dropText = document.getElementById("file-drop-text");
  form.reset();
  preview.style.display = "none";
  dropText.textContent = "اضغط لاختيار صورة";
  document.getElementById("product-warehouse-id").value = warehouseId || "";
  if (product) {
    title.textContent = "تعديل المنتج";
    document.getElementById("product-id").value = product.id;
    document.getElementById("product-name").value = product.name || "";
    // serial is always readonly – keep existing value when editing
    document.getElementById("product-serial").value = product.serialId || generateSerial(product.warehouseId || warehouseId);
    document.getElementById("product-desc").value = product.description || "";
    document.getElementById("product-quantity").value = product.quantity ?? "";
    document.getElementById("product-qty-type").value = product.quantityType || "قطعة";
    document.getElementById("product-price").value = product.price ?? "";
    if (product.imageUrl) { preview.src = product.imageUrl; preview.style.display = "block"; dropText.textContent = "الصورة الحالية"; }
  } else {
    title.textContent = "إضافة منتج";
    document.getElementById("product-id").value = "";
    // always auto-generate serial for new products
    document.getElementById("product-serial").value = warehouseId ? generateSerial(warehouseId) : "";
  }
  modal.classList.add("open");
}

function closeProductModal() {
  document.getElementById("product-modal").classList.remove("open");
  editingProductId = null;
  pendingProductFile = null;
}

async function saveProduct() {
  const name = document.getElementById("product-name").value.trim();
  if (!name) return;
  const warehouseId = document.getElementById("product-warehouse-id").value;
  const serialId = document.getElementById("product-serial").value.trim();
  const description = document.getElementById("product-desc").value.trim();
  // الكمية للعرض فقط في هذه الصفحة ولا يمكن تعديلها هنا — تُدار حصراً من DeepLog
  const quantity = editingProductId
    ? (products.find(p => p.id === editingProductId)?.quantity ?? 0)
    : 0;
  const quantityType = document.getElementById("product-qty-type").value;
  const price = Number(document.getElementById("product-price").value) || 0;
  const submitBtn = document.getElementById("product-submit-btn");
  submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner"></span>';
  try {
    let imageUrl = editingProductId ? (products.find(p => p.id === editingProductId)?.imageUrl ?? null) : null;
    if (pendingProductFile) imageUrl = await compressImage(pendingProductFile);
    const wh = warehouses.find(w => w.id === warehouseId);
    const data = { name, serialId, description, quantity, quantityType, price, imageUrl,
      warehouseId, warehouseName: wh?.name ?? "", updatedAt: serverTimestamp() };
    if (editingProductId) {
      await updateDoc(docRef(db, "products", editingProductId), data);
      await addDoc(collection(db, "auditLog"), {
        action: "تعديل", entity: "منتج", page: "المنتجات", details: `${name} — ${serialId}`,
        userEmail: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      }).catch(err => console.error("auditLog write failed", err));
      showToast("تم تحديث المنتج");
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), data);
      await addDoc(collection(db, "auditLog"), {
        action: "إضافة", entity: "منتج", page: "المنتجات", details: `${name} — ${serialId}`,
        userEmail: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      }).catch(err => console.error("auditLog write failed", err));
      showToast("تمت إضافة المنتج");
    }
    closeProductModal();
  } catch (err) { console.error(err); showToast("حدث خطأ أثناء الحفظ", true); }
  finally { submitBtn.disabled = false; submitBtn.textContent = "حفظ المنتج"; }
}

/* حذف المنتجات أصبح متاحاً فقط من صفحة DeepLog */

/* ══════════════════════════════════════
   SELECTS REFRESH
══════════════════════════════  �═══════ */
function refreshAllWarehouseSelects() {
  ["prod-from-wh","prod-to-wh","trans-from-wh","trans-to-wh","load-warehouse"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">اختر مخزناً</option>';
    warehouses.forEach(wh => {
      const opt = document.createElement("option");
      opt.value = wh.id; opt.textContent = wh.name;
      sel.appendChild(opt);
    });
    sel.value = prev;
  });
}

function refreshMerchantSelects() {
  const sel = document.getElementById("load-merchant");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">اختر تاجراً</option>';
  merchants.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id; opt.textContent = m.name;
    opt.dataset.search = `${m.name || ""} ${m.phone || ""} ${m.email || ""}`;
    sel.appendChild(opt);
  });
  sel.value = prev;
  _refreshSearchableSelect(sel);
}

/* ══════════════════════════════════════
   OP TYPE SWITCHER (production / transfer)
══════════════════════════════════════ */
function initOpTypeSwitcher() {
  document.querySelectorAll(".op-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".op-type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const op = btn.dataset.op;
      document.querySelectorAll(".op-form-section").forEach(s => s.classList.remove("active"));
      document.getElementById(`form-${op}`).classList.add("active");
    });
  });
}

/* ══════════════════════════════════════
   PRODUCTION FORM
══════════════════════════════════════ */
function initProductionForm() {
  prodInputLines = [{ id: ++lineCounter, productId: "", qty: 1 }];
  prodOutputLines = [{ id: ++lineCounter, productId: "", qty: 1 }];
  renderProdLines("input");
  renderProdLines("output");

  document.getElementById("prod-from-wh").addEventListener("change", () => renderProdLines("input"));
  document.getElementById("prod-to-wh").addEventListener("change", () => renderProdLines("output"));
  document.getElementById("prod-add-input-btn").addEventListener("click", () => {
    prodInputLines.push({ id: ++lineCounter, productId: "", qty: 1 });
    renderProdLines("input");
  });
  document.getElementById("prod-add-output-btn").addEventListener("click", () => {
    prodOutputLines.push({ id: ++lineCounter, productId: "", qty: 1 });
    renderProdLines("output");
  });

  const form = document.getElementById("production-form");
  const submitBtn = document.getElementById("production-submit-btn");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fromWhId = document.getElementById("prod-from-wh").value;
    const toWhId = document.getElementById("prod-to-wh").value;
    const note = document.getElementById("prod-note").value.trim();
    if (!fromWhId || !toWhId) { showToast("اختر مخزن المصدر والهدف", true); return; }
    if (fromWhId === toWhId) { showToast("يجب أن يكون المخزنان مختلفين", true); return; }
    const validInputs = prodInputLines.filter(l => l.productId && l.qty > 0);
    const validOutputs = prodOutputLines.filter(l => l.productId && l.qty > 0);
    if (validInputs.length === 0) { showToast("أضف مادة مستهلكة واحدة على الأقل", true); return; }
    if (validOutputs.length === 0) { showToast("أضف منتجاً ناتجاً واحداً على الأقل", true); return; }
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner"></span>';
    try {
      const batch = writeBatch(db);
      const opId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fromWh = warehouses.find(w => w.id === fromWhId);
      const toWh = warehouses.find(w => w.id === toWhId);
      const inputDetails = [];
      const outputDetails = [];
      // deduct inputs from source
      validInputs.forEach(line => {
        const prod = products.find(p => p.id === line.productId);
        if (!prod) return;
        const newQty = (prod.quantity || 0) - line.qty;
        batch.update(docRef(db, "products", prod.id), { quantity: newQty, updatedAt: serverTimestamp() });
        inputDetails.push({ productId: prod.id, productName: prod.name, qty: line.qty, unit: prod.quantityType || "" });
      });
      // add outputs to destination
      validOutputs.forEach(line => {
        const prod = products.find(p => p.id === line.productId);
        if (!prod) return;
        const newQty = (prod.quantity || 0) + line.qty;
        batch.update(docRef(db, "products", prod.id), { quantity: newQty, updatedAt: serverTimestamp() });
        outputDetails.push({ productId: prod.id, productName: prod.name, qty: line.qty, unit: prod.quantityType || "" });
      });
      // log operation
      const opRef = docRef(collection(db, "warehouseOperations"));
      batch.set(opRef, {
        type: "production", opId,
        fromWarehouseId: fromWhId, fromWarehouseName: fromWh?.name ?? "",
        toWarehouseId: toWhId, toWarehouseName: toWh?.name ?? "",
        inputs: inputDetails, outputs: outputDetails,
        note, performedBy: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      // activity log
      const logRef = docRef(collection(db, "activityLog"));
      batch.set(logRef, {
        type: "production",
        summary: `إنتاج: ${fromWh?.name ?? ""} ← ${toWh?.name ?? ""}`,
        details: `مدخلات: ${validInputs.length} | مخرجات: ${validOutputs.length}`,
        opId, note,
        performedBy: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      // سجل المراقبة الشامل (تظهر في صفحة السجل الشامل)
      const auditRef = docRef(collection(db, "auditLog"));
      batch.set(auditRef, {
        action: "إضافة", entity: "عملية إنتاج", page: "المنتجات",
        details: `إنتاج: ${fromWh?.name ?? ""} ← ${toWh?.name ?? ""} — مدخلات: ${validInputs.length} | مخرجات: ${validOutputs.length}`,
        userEmail: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      showInvoice({
        type: "production", opId,
        fromWarehouseName: fromWh?.name ?? "",
        toWarehouseName: toWh?.name ?? "",
        inputs: inputDetails, outputs: outputDetails,
        note, performedBy: currentUser?.email ?? "—",
      });
      form.reset();
      prodInputLines = [{ id: ++lineCounter, productId: "", qty: 1 }];
      prodOutputLines = [{ id: ++lineCounter, productId: "", qty: 1 }];
      renderProdLines("input");
      renderProdLines("output");
      showToast("تمت عملية الإنتاج بنجاح");
    } catch (err) { console.error(err); showToast("حدث خطأ أثناء التنفيذ", true); }
    finally { submitBtn.disabled = false; submitBtn.textContent = "تنفيذ عملية الإنتاج"; }
  });
}

function renderProdLines(direction) {
  const isInput = direction === "input";
  const linesArr = isInput ? prodInputLines : prodOutputLines;
  const containerId = isInput ? "prod-input-lines" : "prod-output-lines";
  const whSelId = isInput ? "prod-from-wh" : "prod-to-wh";
  const container = document.getElementById(containerId);
  if (!container) return;
  const whId = document.getElementById(whSelId)?.value;
  const whProducts = whId ? products.filter(p => p.warehouseId === whId) : [];
  container.innerHTML = "";
  linesArr.forEach(line => {
    const row = document.createElement("div");
    row.className = "prod-line-row";
    const opts = whProducts.map(p =>
      `<option value="${p.id}" data-search="${esc(`${p.name || ""} ${p.serialId || ""} ${p.description || ""}`)}" ${p.id === line.productId ? "selected" : ""}>${esc(p.name)} (${fmtNum(p.quantity || 0)} ${esc(p.quantityType || "")})</option>`
    ).join("");
    row.innerHTML = `
      <select class="pline-prod"><option value="">اختر منتجاً</option>${opts}</select>
      <input type="number" class="pline-qty" min="0.01" step="0.01" value="${line.qty}" />
      <button type="button" class="remove-line" ${linesArr.length === 1 ? "disabled" : ""}>حذف</button>
      <div class="line-hint"></div>`;
    const selProd = row.querySelector(".pline-prod");
    const inpQty = row.querySelector(".pline-qty");
    const btnRem = row.querySelector(".remove-line");
    const hint = row.querySelector(".line-hint");
    function upHint() {
      const p = products.find(x => x.id === selProd.value);
      hint.textContent = p ? `متوفر: ${fmtNum(p.quantity || 0)} ${p.quantityType || ""}` : "";
    }
    selProd.addEventListener("change", () => { line.productId = selProd.value; upHint(); });
    inpQty.addEventListener("input", () => { line.qty = Number(inpQty.value) || 1; });
    btnRem.addEventListener("click", () => {
      if (isInput) prodInputLines = prodInputLines.filter(l => l.id !== line.id);
      else prodOutputLines = prodOutputLines.filter(l => l.id !== line.id);
      renderProdLines(direction);
    });
    upHint();
    container.appendChild(row);
  });
}

/* ══════════════════════════════════════
   TRANSFER FORM
══════════════════════════════════════ */
function initTransferForm() {
  const selFrom = document.getElementById("trans-from-wh");
  const selProd = document.getElementById("trans-product");
  const selDestProd = document.getElementById("trans-dest-product");
  const selTo = document.getElementById("trans-to-wh");

  selFrom.addEventListener("change", () => {
    const whId = selFrom.value;
    const whProducts = whId ? products.filter(p => p.warehouseId === whId) : [];
    const prevVal = selProd.value;
    selProd.innerHTML = '<option value="">اختر صنفاً من المخزن المصدر</option>';
    whProducts.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${fmtNum(p.quantity || 0)} ${p.quantityType || ""})`;
      selProd.appendChild(opt);
    });
    selProd.value = prevVal;
  });

  selTo.addEventListener("change", () => {
    const whId = selTo.value;
    const whProducts = whId ? products.filter(p => p.warehouseId === whId) : [];
    const prevVal = selDestProd.value;
    selDestProd.innerHTML = '<option value="">إنشاء صنف جديد تلقائياً</option>';
    whProducts.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} (${fmtNum(p.quantity || 0)} ${p.quantityType || ""})`;
      selDestProd.appendChild(opt);
    });
    selDestProd.value = prevVal;
  });

  const form = document.getElementById("transfer-form");
  const submitBtn = document.getElementById("transfer-submit-btn");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fromWhId = document.getElementById("trans-from-wh").value;
    const toWhId = document.getElementById("trans-to-wh").value;
    const srcProdId = document.getElementById("trans-product").value;
    const destProdId = document.getElementById("trans-dest-product").value;
    const qty = Number(document.getElementById("trans-qty").value) || 0;
    const note = document.getElementById("trans-note").value.trim();
    if (!fromWhId || !toWhId) { showToast("اختر المخزنين", true); return; }
    if (fromWhId === toWhId) { showToast("يجب أن يكون المخزنان مختلفين", true); return; }
    if (!srcProdId) { showToast("اختر الصنف المراد تحويله", true); return; }
    if (qty <= 0) { showToast("أدخل كمية صحيحة", true); return; }
    const srcProd = products.find(p => p.id === srcProdId);
    if (!srcProd) return;
    if ((srcProd.quantity || 0) < qty) { showToast(`الكمية المتوفرة (${fmtNum(srcProd.quantity)}) أقل من المطلوب`, true); return; }
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner"></span>';
    try {
      const batch = writeBatch(db);
      const opId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fromWh = warehouses.find(w => w.id === fromWhId);
      const toWh = warehouses.find(w => w.id === toWhId);
      // deduct from source
      batch.update(docRef(db, "products", srcProdId), { quantity: (srcProd.quantity || 0) - qty, updatedAt: serverTimestamp() });
      let destProdName = srcProd.name;
      let destProductIdFinal = destProdId || "";
      // add to destination
      if (destProdId) {
        const destProd = products.find(p => p.id === destProdId);
        if (destProd) {
          destProdName = destProd.name;
          batch.update(docRef(db, "products", destProdId), { quantity: (destProd.quantity || 0) + qty, updatedAt: serverTimestamp() });
        }
      } else {
        // الصنف غير موجود في مخزن الوجهة: لا يُنشأ له رقم تسلسلي جديد،
        // بل يُضاف كصنف "زائر" يحمل نفس معرّف المنتج الأصلي (نفس serialId) تبعًا لمخزنه الأصلي،
        // لتجنّب تكرار نفس المنتج بمعرّفين مختلفين.
        const newRef = docRef(collection(db, "products"));
        destProductIdFinal = newRef.id;
        batch.set(newRef, {
          name: srcProd.name, serialId: srcProd.serialId || "", description: srcProd.description || "",
          quantity: qty, quantityType: srcProd.quantityType || "قطعة",
          price: srcProd.price || 0, imageUrl: srcProd.imageUrl || null,
          warehouseId: toWhId, warehouseName: toWh?.name ?? "",
          isVisiting: true, sourceProductId: srcProdId, sourceWarehouseId: fromWhId,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
      // log operation
      const opRef = docRef(collection(db, "warehouseOperations"));
      batch.set(opRef, {
        type: "transfer", opId,
        fromWarehouseId: fromWhId, fromWarehouseName: fromWh?.name ?? "",
        toWarehouseId: toWhId, toWarehouseName: toWh?.name ?? "",
        productId: srcProdId, productName: srcProd.name,
        destProductId: destProductIdFinal,
        quantity: qty, unit: srcProd.quantityType || "",
        note, performedBy: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      const logRef = docRef(collection(db, "activityLog"));
      batch.set(logRef, {
        type: "transfer",
        summary: `تحويل: ${esc(srcProd.name)} من ${fromWh?.name ?? ""} إلى ${toWh?.name ?? ""}`,
        details: `${fmtNum(qty)} ${srcProd.quantityType || ""}`,
        opId, note,
        performedBy: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      // سجل المراقبة الشامل (تظهر في صفحة السجل الشامل)
      const auditRef = docRef(collection(db, "auditLog"));
      batch.set(auditRef, {
        action: "إضافة", entity: "عملية تحويل", page: "المنتجات",
        details: `تحويل: ${esc(srcProd.name)} من ${fromWh?.name ?? ""} إلى ${toWh?.name ?? ""} — ${fmtNum(qty)} ${srcProd.quantityType || ""}`,
        userEmail: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      showInvoice({
        type: "transfer", opId,
        fromWarehouseName: fromWh?.name ?? "",
        toWarehouseName: toWh?.name ?? "",
        productName: srcProd.name,
        quantity: qty, unit: srcProd.quantityType || "",
        note, performedBy: currentUser?.email ?? "—",
      });
      form.reset();
      showToast("تم التحويل بنجاح");
    } catch (err) { console.error(err); showToast("حدث خطأ أثناء التنفيذ", true); }
    finally { submitBtn.disabled = false; submitBtn.textContent = "تنفيذ التحويل"; }
  });
}


/* ══════════════════════════════════════
   SEARCHABLE SELECTS + LIVE SUMMARY
   البحث داخل نفس قائمة التاجر وقائمة المنتجات
   الـ select الأصلي يبقى هو المصدر الحقيقي للقيمة
══════════════════════════════════════ */
function _saleNorm(v) {
  return String(v ?? "").trim().toLowerCase()
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
}

let _searchableSelectDocBound = false;
function _closeAllSearchableSelects(exceptRoot = null) {
  document.querySelectorAll("#view-loading .inline-search-select").forEach(root => {
    if (root === exceptRoot) return;
    root.querySelector(".iss-menu")?.classList.remove("open");
    root.querySelector(".iss-trigger")?.classList.remove("open");
  });
}

function _refreshSearchableSelect(select) {
  if (!select || !select._issApi) return;
  select._issApi.sync();
  if (select._issApi.isOpen()) select._issApi.render();
}

function initSearchableSelect(select, cfg = {}) {
  if (!select || select._issApi) return;
  const placeholder = cfg.placeholder || select.options[0]?.textContent || "اختر";
  const searchPlaceholder = cfg.searchPlaceholder || select.dataset.searchPlaceholder || "ابحث...";
  const nativeRequired = select.required;
  if (nativeRequired) {
    select.required = false; // التحقق موجود بالفعل داخل منطق تنفيذ عملية البيع
    select.dataset.wasRequired = "1";
  }
  select.classList.add("iss-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const root = document.createElement("div");
  root.className = "inline-search-select";
  select.parentNode.insertBefore(root, select);
  root.appendChild(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "iss-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = '<span class="iss-trigger-text"></span><span class="iss-trigger-arrow">▼</span>';

  const menu = document.createElement("div");
  menu.className = "iss-menu";
  menu.innerHTML = `
    <div class="iss-searchbar">
      <div class="iss-search-wrap">
        <span class="iss-search-icon">🔎</span>
        <input type="search" class="iss-search-input" placeholder="${esc(searchPlaceholder)}" autocomplete="off" />
      </div>
    </div>
    <div class="iss-options" role="listbox"></div>`;
  root.appendChild(trigger);
  root.appendChild(menu);

  const triggerText = trigger.querySelector(".iss-trigger-text");
  const input = menu.querySelector(".iss-search-input");
  const optionsBox = menu.querySelector(".iss-options");

  function getOptionSearchText(opt) {
    return _saleNorm(`${opt.textContent || ""} ${opt.dataset.search || ""}`);
  }

  function sync() {
    const opt = select.options[select.selectedIndex];
    triggerText.textContent = opt?.value ? opt.textContent : placeholder;
    trigger.classList.toggle("has-value", !!opt?.value);
  }

  function render() {
    const q = _saleNorm(input.value);
    const opts = Array.from(select.options).filter(opt => opt.value);
    const matches = q ? opts.filter(opt => getOptionSearchText(opt).includes(q)) : opts;
    if (!matches.length) {
      optionsBox.innerHTML = '<div class="iss-empty">لا توجد نتائج مطابقة</div>';
      return;
    }
    optionsBox.innerHTML = matches.map(opt => {
      const selected = opt.value === select.value;
      return `<button type="button" class="iss-option${selected ? " selected" : ""}" data-value="${esc(opt.value)}" role="option" aria-selected="${selected ? "true" : "false"}">
        <span class="iss-option-name">${esc(opt.textContent || "")}</span>
        <span class="iss-option-check">${selected ? "✓" : ""}</span>
      </button>`;
    }).join("");
  }

  function openMenu() {
    _closeAllSearchableSelects(root);
    menu.classList.add("open");
    trigger.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    input.value = "";
    render();
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  function closeMenu() {
    menu.classList.remove("open");
    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", () => menu.classList.contains("open") ? closeMenu() : openMenu());
  input.addEventListener("input", render);
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeMenu(); trigger.focus(); return; }
    if (e.key === "Enter") {
      const first = optionsBox.querySelector(".iss-option");
      if (first) { e.preventDefault(); first.click(); }
    }
  });
  optionsBox.addEventListener("click", e => {
    const btn = e.target.closest(".iss-option");
    if (!btn) return;
    select.value = btn.dataset.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
    closeMenu();
    trigger.focus();
  });
  select.addEventListener("change", sync);

  select._issApi = { sync, render, isOpen: () => menu.classList.contains("open"), close: closeMenu };
  sync();

  if (!_searchableSelectDocBound) {
    _searchableSelectDocBound = true;
    document.addEventListener("click", e => {
      if (!e.target.closest("#view-loading .inline-search-select")) _closeAllSearchableSelects();
    });
  }
}

function updateSaleSummary() {
  const itemsVal = document.querySelector("#sale-summary-items .sale-summary-value");
  const totalVal = document.querySelector("#sale-summary-total .sale-summary-value");
  const balanceVal = document.querySelector("#sale-summary-balance .sale-summary-value");
  if (!itemsVal || !totalVal || !balanceVal) return;

  const valid = loadLines.filter(l => l.productId && l.qty > 0);
  const total = valid.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  itemsVal.textContent = String(valid.length);
  totalVal.textContent = fmtMoney(total);

  const merchantId = document.getElementById("load-merchant")?.value || "";
  if (!merchantId) {
    balanceVal.textContent = "اختر تاجراً";
    balanceVal.classList.remove("debt");
    return;
  }
  const before = merchantBalances[merchantId] ?? 0;
  const isPaid = document.getElementById("load-pay-paid")?.checked;
  const after = isPaid ? before : before - total;
  balanceVal.textContent = after < 0 ? `-${fmtMoney(-after)}` : fmtMoney(after);
  balanceVal.classList.toggle("debt", after < 0);
}

/* ══════════════════════════════════════
   �OADING FORM (warehouse → merchant)
══════════════════════════════════════ */
function initLoadingForm() {
  loadLines = [{ id: ++loadLineCounter, productId: "", qty: 1, price: 0 }];
  renderLoadLines();
  initSearchableSelect(document.getElementById("load-merchant"), {
    placeholder: "اختر تاجراً",
    searchPlaceholder: "ابحث عن اسم التاجر..."
  });

  document.getElementById("load-warehouse").addEventListener("change", () => {
    renderLoadLines();
    updateSaleSummary();
  });
  document.getElementById("load-merchant").addEventListener("change", () => {
    updateSaleSummary();
  });
  document.getElementById("load-add-line-btn").addEventListener("click", () => {
    loadLines.push({ id: ++loadLineCounter, productId: "", qty: 1, price: 0 });
    renderLoadLines();
  });

  // تحديث المظهر البصري لخيار الدفع
  function updatePayStyle() {
    const isPaid = document.getElementById("load-pay-paid").checked;
    const labelPaid   = document.getElementById("pay-label-paid");
    const labelUnpaid = document.getElementById("pay-label-unpaid");
    const hint        = document.getElementById("pay-hint");
    if (isPaid) {
      labelPaid.className   = "pay-opt pay-opt-paid sel-paid";
      labelUnpaid.className = "pay-opt pay-opt-unpaid";
      hint.style.color      = "#1a6b3a";
      hint.textContent      = "سيُسجَّل دفع فوري — لن يُضاف دين على التاجر";
    } else {
      labelUnpaid.className = "pay-opt pay-opt-unpaid sel-unpaid";
      labelPaid.className   = "pay-opt pay-opt-paid";
      hint.style.color      = "#a06a10";
      hint.textContent      = "سيُسجَّل دين على التاجر بقيمة الفاتورة";
    }
    updateSaleSummary();
  }
  document.getElementById("load-pay-paid").addEventListener("change", updatePayStyle);
  document.getElementById("load-pay-unpaid").addEventListener("change", updatePayStyle);

  const form = document.getElementById("loading-form");
  const submitBtn = document.getElementById("loading-submit-btn");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const whId = document.getElementById("load-warehouse").value;
    const merchantId = document.getElementById("load-merchant").value;
    const note = document.getElementById("load-note").value.trim();
    const isPaid = document.getElementById("load-pay-paid").checked;
    if (!whId) { showToast("اختر المخزن", true); return; }
    if (!merchantId) { showToast("اختر التاجر", true); return; }
    const validLines = loadLines.filter(l => l.productId && l.qty > 0);
    if (validLines.length === 0) { showToast("أضف صنفاً واحداً على الأقل", true); return; }
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner"></span>';
    try {
      const batch = writeBatch(db);
      const opId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const wh = warehouses.find(w => w.id === whId);
      const merchant = merchants.find(m => m.id === merchantId);
      const lineDetails = [];
      let totalAmount = 0;
      // deduct quantities & build details
      for (const line of validLines) {
        const prod = products.find(p => p.id === line.productId);
        if (!prod) continue;
        const lineTotal = line.qty * line.price;
        totalAmount += lineTotal;
        batch.update(docRef(db, "products", prod.id), {
          quantity: Math.max(0, (prod.quantity || 0) - line.qty),
          updatedAt: serverTimestamp(),
        });
        lineDetails.push({ productId: prod.id, productName: prod.name, qty: line.qty, unit: prod.quantityType || "", price: line.price, total: lineTotal });
      }
      // رصيد التاجر قبل وبعد هذه الحركة (يُسجَّل لإظهاره في الفاتورة وسجل العمليات)
      const merchantBalanceBefore = merchantBalances[merchantId] ?? 0;
      // رصيد ما بعد = قبل − المبلغ (إلا إذا كان مدفوعاً نقداً، فتُلغى الحركتان بعضهما)
      const merchantBalanceAfter = isPaid ? merchantBalanceBefore : merchantBalanceBefore - totalAmount;

      // loading operation record
      const opRef = docRef(collection(db, "loadingOperations"));
      batch.set(opRef, {
        type: "loading", opId,
        warehouseId: whId, warehouseName: wh?.name ?? "",
        merchantId, merchantName: merchant?.name ?? "",
        lines: lineDetails, totalAmount, note,
        merchantBalanceBefore, merchantBalanceAfter,
        performedBy: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      // write to merchantTransactions so it appears in the merchant account page
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
      const txId = `TL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const txRef = docRef(collection(db, "merchantTransactions"));
      batch.set(txRef, {
        merchantId,
        merchantName: merchant?.name ?? "",
        amount: totalAmount,
        type: "out",  // بيع = يُثبَّت كـ"out" حتى يُعامَل كدين على التاجر (balance يصبح سالباً = مديون)
        note: `بيع من مخزن ${wh?.name ?? ""}${isPaid ? " — نقدي" : ""}${note ? " — " + note : ""}`,
        date: today,
        txId,
        opId,
        source: "loading",
        paid: isPaid,
        createdAt: serverTimestamp(),
      });
      // إذا تم الدفع فوراً: أضف حركة دفع تلقائية في finance_transactions تُلغي الدين
      if (isPaid && totalAmount > 0) {
        // قراءة الـ counter لتوليد finId تسلسلي صحيح (F-XXXX)
        const counterRef = docRef(db, "counters", "finance_trans");
        const counterSnap = await new Promise((res, rej) => {
          const unsub = onSnapshot(counterRef, snap => { unsub(); res(snap); }, rej);
        });
        const newSeq   = (counterSnap.exists() ? counterSnap.data().seq : 0) + 1;
        const payFinId = "F-" + String(newSeq).padStart(4, "0");
        // تحديث الـ counter في نفس الـ batch
        batch.set(counterRef, { seq: newSeq }, { merge: true });

        const payTxId = `PY-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const payRef  = docRef(collection(db, "finance_transactions"));
        batch.set(payRef, {
          type: "merchant",
          dir: "in",          // dir="in" = دفع من التاجر = يُقلّل الدين
          amount: totalAmount,
          date: today,
          merchantId,
          merchantName: merchant?.name ?? "",
          txId: payTxId,
          opId,
          finId: payFinId,
          _active: true,
          source: "auto-payment",
          sourcePage: "المنتجات",
          description: `دفع فوري — بيع نقدي من مخزن ${wh?.name ?? ""}${note ? " — " + note : ""}`,
          affectsCash: true,
          performedBy: currentUser?.email ?? "—",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // يُسجَّل إيداع في الصندوق تلقائياً بنفس finId
        const cashRef = docRef(collection(db, "finance_transactions"));
        batch.set(cashRef, {
          type: "deposit",
          dir: "in",
          amount: totalAmount,
          date: today,
          txId: `DP-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          opId,
          finId: payFinId,
          _active: true,
          source: "auto-payment",
          sourcePage: "المنتجات",
          description: `إيداع نقدي — بيع للتاجر ${merchant?.name ?? ""}${note ? " — " + note : ""}`,
          performedBy: currentUser?.email ?? "—",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      // activity log
      const logRef = docRef(collection(db, "activityLog"));
      batch.set(logRef, {
        type: "loading",
        summary: `بيع: ${wh?.name ?? ""} → ${merchant?.name ?? ""}`,
        details: `${lineDetails.length} صنف — إجمالي: ${fmtMoney(totalAmount)}`,
        opId, note,
        merchantBalanceBefore, merchantBalanceAfter,
        performedBy: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      // سجل المراقبة الشامل (تظهر في صفحة السجل الشامل)
      const auditRef = docRef(collection(db, "auditLog"));
      batch.set(auditRef, {
        action: "إضافة", entity: "عملية بيع", page: "المنتجات",
        details: `بيع: ${wh?.name ?? ""} → ${merchant?.name ?? ""} — ${lineDetails.length} صنف — إجمالي: ${fmtMoney(totalAmount)}`,
        userEmail: currentUser?.email ?? "—",
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      showInvoice({
        type: "loading", opId,
        warehouseName: wh?.name ?? "",
        merchantName: merchant?.name ?? "",
        lines: lineDetails, totalAmount, note,
        merchantBalanceBefore, merchantBalanceAfter,
        performedBy: currentUser?.email ?? "—",
      });
      form.reset();
      loadLines = [{ id: ++loadLineCounter, productId: "", qty: 1, price: 0 }];
      renderLoadLines();
      _refreshSearchableSelect(document.getElementById("load-merchant"));
      _closeAllSearchableSelects();
      updatePayStyle();
      updateSaleSummary();
      showToast("تمت عملية البيع بنجاح");
    } catch (err) { console.error(err); showToast("حدث خطأ أثناء التنفيذ", true); }
    finally { submitBtn.disabled = false; submitBtn.textContent = "تنفيذ عملية البيع"; }
  });
}

function renderLoadLines() {
  const container = document.getElementById("load-lines");
  if (!container) return;
  const whId = document.getElementById("load-warehouse")?.value;
  const whProducts = whId ? products.filter(p => p.warehouseId === whId) : [];
  container.innerHTML = "";
  loadLines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "prod-line-row loading-line-row";
    row.dataset.lineId = line.id;
    const opts = whProducts.map(p =>
      `<option value="${p.id}" ${p.id === line.productId ? "selected" : ""}>${esc(p.name)} (${fmtNum(p.quantity || 0)} ${esc(p.quantityType || "")})</option>`
    ).join("");
    row.innerHTML = `
      <div class="sale-line-field sale-line-product">
        <span class="sale-line-label">الصنف ${index + 1}</span>
        <select class="lline-prod"><option value="">اختر صنفاً</option>${opts}</select>
      </div>
      <div class="sale-line-field sale-line-qty">
        <span class="sale-line-label">الكمية</span>
        <input type="number" class="lline-qty" min="0.01" step="0.01" value="${line.qty}" placeholder="الكمية" inputmode="decimal" />
      </div>
      <div class="sale-line-field sale-line-price">
        <span class="sale-line-label">السعر</span>
        <input type="number" class="lline-price" min="0" step="0.01" value="${line.price}" placeholder="السعر" inputmode="decimal" />
      </div>
      <button type="button" class="remove-line" ${loadLines.length === 1 ? "disabled" : ""}>حذف</button>
      <div class="line-hint"></div>`;
    const selProd = row.querySelector(".lline-prod");
    const inpQty = row.querySelector(".lline-qty");
    const inpPrice = row.querySelector(".lline-price");
    const btnRem = row.querySelector(".remove-line");
    const hint = row.querySelector(".line-hint");
    initSearchableSelect(selProd, {
      placeholder: whId ? "اختر صنفاً" : "اختر المخزن المصدر أولاً",
      searchPlaceholder: "ابحث عن اسم المنتج..."
    });
    function upHint() {
      const p = products.find(x => x.id === selProd.value);
      if (p) {
        if (!line.price && p.price) {
          inpPrice.value = p.price;
          line.price = p.price;
        }
        const lineTotal = (Number(line.qty) || 0) * (Number(line.price) || 0);
        hint.textContent = `متوفر: ${fmtNum(p.quantity || 0)} ${p.quantityType || ""} — الإجمالي: ${fmtMoney(lineTotal)}`;
      } else {
        hint.textContent = whId ? "اختر الصنف" : "اختر المخزن المصدر أولاً";
      }
      updateSaleSummary();
    }
    selProd.addEventListener("change", () => {
      line.productId = selProd.value;
      const p = products.find(x => x.id === line.productId);
      if (p?.price && !line.price) { line.price = p.price; inpPrice.value = p.price; }
      upHint();
    });
    inpQty.addEventListener("input", () => { line.qty = Number(inpQty.value) || 0; upHint(); });
    inpPrice.addEventListener("input", () => { line.price = Number(inpPrice.value) || 0; upHint(); });
    btnRem.addEventListener("click", () => {
      loadLines = loadLines.filter(l => l.id !== line.id);
      renderLoadLines();
    });
    upHint();
    container.appendChild(row);
  });
  updateSaleSummary();
}

/* ══════════════════════════════════════
   RECORDS LISTS
══════════════════════════════════════ */
function loadMovementsRecords() {
  if (movementsRecordsStarted) return;
  movementsRecordsStarted = true;
  const container = document.getElementById("movements-records-list");
  const q = query(collection(db, "warehouseOperations"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    if (snap.empty) { container.innerHTML = '<div class="empty-state">لا توجد حركات بين المخازن بعد</div>'; return; }
    container.innerHTML = "";
    movementsRecordsCache = {};
    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (d.opId) movementsRecordsCache[d.opId] = { id: docSnap.id, ...d };
      const row = document.createElement("div");
      row.className = "record-row";
      const badgeCls = d.type === "production" ? "production" : "transfer";
      const badgeLabel = d.type === "production" ? "إنتاج" : "تحويل";
      const detail = d.type === "transfer"
        ? `${esc(d.productName)} × ${fmtNum(d.quantity)} ${esc(d.unit || "")}`
        : `${d.inputs?.length ?? 0} مدخل → ${d.outputs?.length ?? 0} مخرج`;
      const serialHtml = d.opId
        ? `<span class="op-serial-link" data-op-id="${esc(d.opId)}" data-op-kind="movement" title="عرض تفاصيل الحركة"># ${esc(d.opId.slice(0, 8).toUpperCase())}</span>`
        : "";
      row.innerHTML = `
        <span class="record-badge ${badgeCls}">${badgeLabel}</span>
        <div class="record-main">
          <div class="title">${esc(d.fromWarehouseName)} ← ${esc(d.toWarehouseName)} ${serialHtml}</div>
          <div class="meta">${detail} · ${d.createdAt ? fmtDateTime(d.createdAt) : "الآن"}</div>
        </div>
        <button class="delete-btn" data-col="warehouseOperations" data-id="${docSnap.id}" title="حذف">✕</button>`;
      container.appendChild(row);
    });
    bindDeleteBtns(container, "warehouseOperations");
    bindSerialLinks(container);
  }, err => { console.error(err); container.innerHTML = '<div class="empty-state">حدث خطأ</div>'; });
}

function loadLoadingRecords() {
  if (loadingRecordsStarted) return;
  loadingRecordsStarted = true;
  const container = document.getElementById("loading-records-list");
  const q = query(collection(db, "loadingOperations"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    if (snap.empty) { container.innerHTML = '<div class="empty-state">لا توجد عمليات تحميل بعد</div>'; return; }
    container.innerHTML = "";
    loadingRecordsCache = {};
    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (d.opId) loadingRecordsCache[d.opId] = { id: docSnap.id, ...d };
      const row = document.createElement("div");
      row.className = "record-row";
      const serialHtml = d.opId
        ? `<span class="op-serial-link" data-op-id="${esc(d.opId)}" data-op-kind="loading" title="عرض تفاصيل الحركة"># ${esc(d.opId.slice(0, 8).toUpperCase())}</span>`
        : "";
      row.innerHTML = `
        <span class="record-badge loading">بيع</span>
        <div class="record-main">
          <div class="title">${esc(d.warehouseName)} → ${esc(d.merchantName)} ${serialHtml}</div>
          <div class="meta">${d.lines?.length ?? 0} صنف · الإجمالي: ${fmtMoney(d.totalAmount)} · ${d.createdAt ? fmtDateTime(d.createdAt) : "الآن"}</div>
        </div>
        <div class="record-amount out">${fmtMoney(d.totalAmount)}</div>
        <button class="delete-btn" data-col="loadingOperations" data-id="${docSnap.id}" title="حذف">✕</button>`;
      container.appendChild(row);
    });
    bindDeleteBtns(container, "loadingOperations");
    bindSerialLinks(container);
  }, err => { console.error(err); container.innerHTML = '<div class="empty-state">حدث خطأ</div>'; });
}

/* clicking a serial/op number anywhere replays that operation's exact invoice */
function bindSerialLinks(container) {
  container.querySelectorAll(".op-serial-link[data-op-id]").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      openOperationPreview(el.dataset.opId, el.dataset.opKind, el.dataset.seqLabel);
    });
  });
}

function openOperationPreview(opId, kind, seqLabel) {
  if (!opId) { showDeletedOperationNotice(); return; }
  const record = kind === "loading" ? loadingRecordsCache[opId] : movementsRecordsCache[opId];
  const finalRecord = record || movementsRecordsCache[opId] || loadingRecordsCache[opId];
  if (!finalRecord) { showDeletedOperationNotice(); return; }
  // استخدم الرقم التسلسلي (OP-00006) نفسه المعروض في سجل العمليات بدلاً من جزء من opId
  showInvoice({ ...finalRecord, seqLabel: seqLabel || finalRecord.seqLabel });
}

/* تُعرض عند محاولة معاينة حركة تم حذفها بدلاً من إشعار عابر */
function showDeletedOperationNotice() {
  const modal = document.getElementById("op-deleted-modal");
  if (modal) modal.classList.add("open");
}

function initOpDeletedModal() {
  const modal = document.getElementById("op-deleted-modal");
  if (!modal) return;
  const close = () => modal.classList.remove("open");
  document.getElementById("op-deleted-modal-close")?.addEventListener("click", close);
  document.getElementById("op-deleted-close-btn2")?.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
}

function bindDeleteBtns(container, colName) {
  container.querySelectorAll(".delete-btn[data-col]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("هل تريد حذف هذا السجل؟")) return;
      try {
        await deleteDoc(docRef(db, btn.dataset.col, btn.dataset.id));
        showToast("تم الحذف");
      } catch (err) { console.error(err); showToast("حدث خطأ", true); }
    });
  });
}

/* ══════════════════════════════════════
   ACTIVITY LOG
══════════════════════════════════════ */
function loadActivityLog() {
  if (activityLogStarted) return;
  activityLogStarted = true;
  const tbody = document.getElementById("log-table-body");
  const mobList = document.getElementById("mob-log-list");
  const countEl = document.getElementById("log-count");
  const q = query(collection(db, "activityLog"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    if (countEl) countEl.textContent = `${snap.size} عملية`;
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">لا توجد عمليات مسجلة بعد</div></td></tr>';
      if (mobList) mobList.innerHTML = '<div class="empty-state">لا توجد عمليات مسجلة بعد</div>';
      return;
    }
    tbody.innerHTML = "";
    if (mobList) mobList.innerHTML = "";
    let rowNum = snap.size;
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const badgeMap = { production: ["log-prod","إنتاج"], transfer: ["log-transfer","تحويل"], loading: ["log-load","بيع"] };
      const [cls, label] = badgeMap[d.type] ?? ["log-prod", d.type];
      const seqLabel = `OP-${String(rowNum).padStart(5, "0")}`;
      rowNum--;
      const kind = d.type === "loading" ? "loading" : "movement";
      const canPreview = !!d.opId;
      if (canPreview) {
        const cache = kind === "loading" ? loadingRecordsCache : movementsRecordsCache;
        if (cache[d.opId]) cache[d.opId].seqLabel = seqLabel;
      }
      const opAttrs = canPreview
        ? `data-op-id="${esc(d.opId)}" data-op-kind="${kind}" data-seq-label="${esc(seqLabel)}" title="عرض تفاصيل الحركة كما تمت"`
        : "";

      // ── صف الجدول (سطح المكتب) ──
      const tr = document.createElement("tr");
      // رصيد التاجر للعرض في صف السجل
      const _rBalBef = d.merchantBalanceBefore ?? (d.opId && loadingRecordsCache[d.opId]?.merchantBalanceBefore);
      const _rBalAft = d.merchantBalanceAfter  ?? (d.opId && loadingRecordsCache[d.opId]?.merchantBalanceAfter);
      // رقم سالب = دين (يُعرض مع -)، موجب = رصيد دائن (بدون علامة)
      const _fmtR = v => v < 0 ? `-${fmtMoney(-v)}` : fmtMoney(v);
      const _balCell = (d.type === "loading" && _rBalBef !== undefined)
        ? `<div style="font-size:12px;line-height:1.8;direction:rtl">
             <div>قبل: <strong>${_fmtR(_rBalBef)}</strong></div>
             <div>بعد: <strong>${_fmtR(_rBalAft ?? 0)}</strong></div>
           </div>`
        : `<span style="color:var(--muted);font-size:11px">—</span>`;
      tr.innerHTML = `
        <td>
          <span class="${canPreview ? "log-serial-link" : ""}" ${opAttrs}
            style="font-family:monospace;font-size:11px;font-weight:700;color:${canPreview ? "var(--primary-dark)" : "var(--muted)"};
            background:var(--bg);border-radius:5px;padding:3px 6px;border:1px solid var(--border);
            white-space:nowrap;${canPreview ? "cursor:pointer;text-decoration:underline;" : ""}">${seqLabel}</span>
        </td>
        <td><span class="log-badge ${cls}">${label}</span></td>
        <td>
          <div style="font-weight:700;font-size:13px">${esc(d.summary || "")}</div>
          <div style="font-size:12px;color:var(--muted)">${esc(d.details || "")}${d.note ? ` — <em>${esc(d.note)}</em>` : ""}</div>
        </td>
        <td>${_balCell}</td>
        <td style="font-size:12.5px">${esc(resolveAlias(d.performedBy) || "—")}</td>
        <td class="log-time">${d.createdAt ? fmtDateTime(d.createdAt) : "—"}</td>`;
      tbody.appendChild(tr);

      // ── بطاقة الهاتف ──
      if (mobList) {
        const card = document.createElement("div");
        card.className = "mob-log-card";
        const detailsTxt = [d.details, d.note ? `(${d.note})` : ""].filter(Boolean).join(" — ");
        const _mobBal = (d.type === "loading" && _rBalBef !== undefined)
          ? `<div style="font-size:12px;margin-top:5px;line-height:1.8;direction:rtl">
               <div>المستحق قبل: <strong>${_fmtR(_rBalBef)}</strong></div>
               <div>المستحق بعد: <strong>${_fmtR(_rBalAft ?? 0)}</strong></div>
             </div>`
          : "";
        card.innerHTML = `
          <div class="mlc-head">
            <span class="mlc-serial${canPreview ? " clickable log-serial-link" : ""}" ${opAttrs}>${seqLabel}</span>
            <span class="log-badge ${cls}">${label}</span>
          </div>
          <div>
            <div class="mlc-summary">${esc(d.summary || "")}</div>
            ${detailsTxt ? `<div class="mlc-details">${esc(detailsTxt)}</div>` : ""}
            ${_mobBal}
          </div>
          <div class="mlc-foot">
            <span class="mlc-by">👤 ${esc(resolveAlias(d.performedBy) || "—")}</span>
            <span class="mlc-time">${d.createdAt ? fmtDateTime(d.createdAt) : "—"}</span>
          </div>`;
        mobList.appendChild(card);
      }
    });
    /* حذف سجلات النشاط أصبح متاحاً فقط من صفحة DeepLog */
    const bindPreview = root => root.querySelectorAll(".log-serial-link[data-op-id]").forEach(el => {
      el.addEventListener("click", () => openOperationPreview(el.dataset.opId, el.dataset.opKind, el.dataset.seqLabel));
    });
    bindPreview(tbody);
    if (mobList) bindPreview(mobList);
  }, err => { console.error(err); tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state">حدث خطأ</div></td></tr>'; });
}

/* ══════════════════════════════════════
   INVOICE MODAL
══════════════════════════════════════ */
function initInvoiceModal() {
  const modal = document.getElementById("invoice-modal");
  document.getElementById("invoice-modal-close").addEventListener("click", () => modal.classList.remove("open"));
  document.getElementById("invoice-close-btn2").addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });
  document.getElementById("invoice-print-btn").addEventListener("click", () => window.print());
}

function showInvoice(data) {
  const modal = document.getElementById("invoice-modal");
  const content = document.getElementById("invoice-content");
  // when replaying a past operation, show the moment it actually happened;
  // when showing the invoice right after submitting a new one, show now.
  const now = data.createdAt
    ? fmtDateTimeLong(data.createdAt)
    : new Date().toLocaleString("ar-EG", { timeZone:"Africa/Cairo", year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" });
  const isReplay = !!data.createdAt;
  // اعرض الرقم التسلسلي نفسه من سجل العمليات (OP-00006) بدل جزء من opId
  const shortId = data.seqLabel || (data.opId ? data.opId.slice(0, 8).toUpperCase() : "—");

  let typeLabel = "", typeCls = "", bodyHtml = "", billToHtml = "";

  if (data.type === "production") {
    typeLabel = "عملية إنتاج"; typeCls = "inv-prod";
    const inputRows = (data.inputs || []).map(i =>
      `<tr><td>${esc(i.productName)}</td><td style="text-align:center">${fmtNum(i.qty)} ${esc(i.unit)}</td><td style="color:#b91c1c;text-align:center">استهلاك</td></tr>`).join("");
    const outputRows = (data.outputs || []).map(o =>
      `<tr><td>${esc(o.productName)}</td><td style="text-align:center">${fmtNum(o.qty)} ${esc(o.unit)}</td><td style="color:#15803d;text-align:center">إنتاج</td></tr>`).join("");
    billToHtml = `<div class="inv-doc-bill">
      <div class="inv-doc-bill-label">المخازن</div>
      <div class="inv-doc-bill-name">${esc(data.fromWarehouseName||"")}</div>
      <div class="inv-doc-bill-detail">إلى مخزن: ${esc(data.toWarehouseName||"")}</div>
    </div>`;
    bodyHtml = `
      <table class="inv-doc-table">
        <thead><tr><th>الصنف</th><th style="text-align:center">الكمية</th><th style="text-align:center">الحركة</th></tr></thead>
        <tbody>${inputRows}${outputRows}</tbody>
      </table>
      <div class="inv-doc-total-wrap"><table class="inv-doc-total-table">
        <tr><td class="tot-lbl">إجمالي الأصناف</td><td class="tot-val">${(data.inputs||[]).length+(data.outputs||[]).length}</td></tr>
      </table></div>`;
  } else if (data.type === "transfer") {
    typeLabel = "تحويل بين مخازن"; typeCls = "inv-transfer";
    billToHtml = `<div class="inv-doc-bill">
      <div class="inv-doc-bill-label">من</div>
      <div class="inv-doc-bill-name">${esc(data.fromWarehouseName||"")}</div>
      <div class="inv-doc-bill-detail">إلى: ${esc(data.toWarehouseName||"")}</div>
    </div>`;
    bodyHtml = `
      <table class="inv-doc-table">
        <thead><tr><th>الصنف</th><th style="text-align:center">الكمية المحوّلة</th></tr></thead>
        <tbody><tr><td>${esc(data.productName)}</td><td style="text-align:center">${fmtNum(data.quantity)} ${esc(data.unit)}</td></tr></tbody>
      </table>
      <div class="inv-doc-total-wrap"><table class="inv-doc-total-table">
        <tr><td class="tot-lbl">الكمية المحوّلة</td><td class="tot-val">${fmtNum(data.quantity)} ${esc(data.unit)}</td></tr>
      </table></div>`;
  } else if (data.type === "loading") {
    typeLabel = "فاتورة بيع"; typeCls = "inv-load";
    const lineRows = (data.lines || []).map(l =>
      `<tr>
        <td>${esc(l.productName)}</td>
        <td style="text-align:center">${fmtNum(l.qty)} ${esc(l.unit)}</td>
        <td style="text-align:center">${fmtMoney(l.price)}</td>
        <td style="text-align:center;font-weight:700">${fmtMoney(l.total)}</td>
      </tr>`).join("");
    billToHtml = `<div class="inv-doc-bill">
      <div class="inv-doc-bill-label">إلى</div>
      <div class="inv-doc-bill-name">${esc(data.merchantName||"")}</div>
      <div class="inv-doc-bill-detail">من مخزن: ${esc(data.warehouseName||"")}</div>
    </div>`;
    // _fmtBal: رقم موجب = رصيد دائن (بدون علامة) | رقم سالب = دين على التاجر (مع -)
    const _fmtBal = v => v < 0 ? `-${fmtMoney(-v)}` : fmtMoney(v);
    const _rawBef = data.merchantBalanceBefore;
    const _rawAft = data.merchantBalanceAfter;
    const _balSection = _rawBef !== undefined ? `
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;direction:rtl;font-size:13px;line-height:2">
        <div style="font-weight:700">المبلغ المستحق على التاجر — ${esc(data.merchantName||"")}</div>
        <div>الحساب قبل الطلب: <strong>${_fmtBal(_rawBef)}</strong></div>
        <div>الحساب بعد الطلب: <strong>${_fmtBal(_rawAft ?? 0)}</strong></div>
      </div>` : "";
    bodyHtml = `
      <table class="inv-doc-table">
        <thead><tr><th>الصنف</th><th style="text-align:center">الكمية</th><th style="text-align:center">سعر الوحدة</th><th style="text-align:center">الإجمالي</th></tr></thead>
        <tbody>${lineRows}</tbody>
      </table>
      <div class="inv-doc-total-wrap"><table class="inv-doc-total-table">
        <tr><td class="tot-lbl">المجموع الفرعي</td><td class="tot-val">${fmtMoney(data.totalAmount)}</td></tr>
        <tr><td class="tot-lbl"><strong>الإجمالي</strong></td><td class="tot-val"><strong>${fmtMoney(data.totalAmount)}</strong></td></tr>
      </table></div>
      ${_balSection}`;
  }

  const printNow = new Date().toLocaleString("ar-EG", { timeZone:"Africa/Cairo", year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" });
  const modalTitle = document.getElementById("invoice-modal-title") || document.querySelector("#invoice-modal .modal-box-header h3");
  if (modalTitle) modalTitle.textContent = isReplay ? "معاينة الحركة" : "فاتورة العملية";

  // تحديد بادج نوع العملية
  const docTypeCls = data.type==="production"?"t-prod":data.type==="loading"?"t-load":"t-trans";

  content.innerHTML = `
    <div class="inv-doc">
      <!-- رأس الفاتورة -->
      <div class="inv-doc-head">
        <div class="inv-doc-logo-wrap">
          <div class="inv-doc-brand">Ahmed And Hamdy</div>
          <div class="inv-doc-brand-sub">نظام المحاسبة الداخلي${isReplay?" — معاينة حركة سابقة":""}</div>
        </div>
        <div class="inv-doc-nums">
          <div class="inv-doc-num-row"><span>رقم الفاتورة</span><strong>${data.seqLabel?shortId:"#"+shortId}</strong></div>
          <div class="inv-doc-num-row"><span>${isReplay?"تاريخ الحركة":"التاريخ"}</span><strong>${now}</strong></div>
          <div class="inv-doc-num-row"><span>نفّذها</span><strong>${esc(resolveAlias(data.performedBy)||"—")}</strong></div>
        </div>
      </div>

      <!-- نوع العملية -->
      <span class="inv-doc-type-badge ${docTypeCls}">${typeLabel}</span>

      <!-- بيانات الطرف الآخر -->
      ${billToHtml}

      <!-- جسم الفاتورة (جدول + إجمالي) -->
      ${bodyHtml}

      <!-- ملاحظة -->
      ${data.note?`<div class="inv-doc-note">ملاحظة: ${esc(data.note)}</div>`:""}

      <!-- تذييل -->
      <div class="inv-doc-footer">
        <div>${isReplay?"تمت معاينتها بتاريخ: ":"طُبع بتاريخ: "}${printNow}</div>
        <div class="inv-doc-sig">
          <div class="inv-doc-sig-line"></div>
          <div>التوقيع والختم</div>
        </div>
      </div>
    </div>`;

  modal.classList.add("open");
}
