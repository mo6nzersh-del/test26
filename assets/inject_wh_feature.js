#!/usr/bin/env node
const fs = require("fs");

// ─── CSS ───────────────────────────────────────────────────────────────────
const CSS = `
      /* ══ أزرار تعديل المخزون وسجل الحركات ══ */
      .wh-adj-btn {
        display:inline-flex;align-items:center;gap:5px;
        padding:6px 13px;border:none;border-radius:8px;
        background:var(--primary,#1a6b3a);color:#fff;
        font-family:inherit;font-size:.8rem;font-weight:700;
        cursor:pointer;white-space:nowrap;
        transition:background .13s,transform .1s;
      }
      .wh-adj-btn:hover{background:#155c31;transform:translateY(-1px)}
      .wh-adj-btn:active{transform:translateY(0)}
      .wh-log-btn {
        display:inline-flex;align-items:center;gap:5px;
        padding:6px 13px;border:1.5px solid var(--border);border-radius:8px;
        background:var(--surface);color:var(--ink);
        font-family:inherit;font-size:.8rem;font-weight:700;
        cursor:pointer;white-space:nowrap;
        transition:background .13s,border-color .13s;
      }
      .wh-log-btn:hover{background:var(--bg);border-color:var(--primary,#1a6b3a);color:var(--primary,#1a6b3a)}

      /* ══ مودال تعديل المخزون ══ */
      #wh-adjust-modal .adj-type-group{display:flex;gap:8px;margin-bottom:18px}
      #wh-adjust-modal .adj-type-btn{
        flex:1;padding:12px 10px;border:2px solid var(--border);border-radius:10px;
        background:var(--surface);font-family:inherit;font-weight:700;font-size:.88rem;
        color:var(--muted);cursor:pointer;text-align:center;transition:all .15s;
      }
      #wh-adjust-modal .adj-type-btn.add.active{border-color:#1a6b3a;background:#f0faf4;color:#1a6b3a}
      #wh-adjust-modal .adj-type-btn.consume.active{border-color:#dc2626;background:#fff5f5;color:#dc2626}
      #wh-adjust-modal .adj-type-btn:hover{border-color:var(--primary,#1a6b3a)}

      /* ══ مودال سجل حركات المخزن ══ */
      .wh-log-empty{text-align:center;padding:28px;color:var(--muted);font-size:.9rem}
      .wh-adj-table{width:100%;border-collapse:collapse}
      .wh-adj-table th{
        text-align:right;font-size:11.5px;color:var(--muted);font-weight:700;
        padding:9px 14px;border-bottom:2px solid var(--border);background:var(--bg);
        white-space:nowrap;
      }
      .wh-adj-table td{
        padding:10px 14px;border-bottom:1px solid var(--border);
        font-size:13px;vertical-align:middle;
      }
      .wh-adj-table tbody tr:hover td{background:var(--bg)}
      .wh-adj-table tr:last-child td{border-bottom:none}
      .whadj-badge{
        display:inline-block;padding:3px 10px;border-radius:7px;
        font-size:11.5px;font-weight:700;white-space:nowrap;
      }
      .whadj-add{background:#dcfce7;color:#15803d}
      .whadj-consume{background:#fee2e2;color:#dc2626}
      .whadj-bal{display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap}
      .whadj-bal-before{color:var(--muted);font-weight:600}
      .whadj-bal-arrow{color:var(--muted);font-size:10px}
      .whadj-bal-after{font-weight:800;color:var(--ink)}
      .whadj-txid{
        font-family:monospace;font-size:11px;font-weight:700;
        background:var(--bg);border:1px solid var(--border);
        border-radius:5px;padding:2px 7px;color:var(--muted);
        white-space:nowrap;cursor:default;
      }
      @media(max-width:700px){
        #wh-log-modal .wh-adj-table-wrap{display:none}
        #wh-log-modal .wh-adj-cards{display:flex!important}
      }
      .wh-adj-cards{display:none;flex-direction:column;gap:8px;padding:12px}
      .wh-adj-card{
        background:var(--surface);border:1px solid var(--border);
        border-radius:12px;padding:12px 14px;
        box-shadow:0 1px 4px rgba(0,0,0,.05);
      }
      .wh-adj-card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
      .wh-adj-card-body{font-size:13px;font-weight:700;color:var(--ink);margin-bottom:6px}
      .wh-adj-card-bal{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-bottom:4px}
      .wh-adj-card-foot{
        display:flex;align-items:center;justify-content:space-between;
        padding-top:7px;border-top:1px solid var(--border);
        font-size:11px;color:var(--muted);
      }
`;

// ─── HTML modals ────────────────────────────────────────────────────────────
const MODALS = `
    <!-- ══ مودال تعديل مخزون المخزن ══ -->
    <div class="modal-overlay" id="wh-adjust-modal">
      <div class="modal-box" style="max-width:440px">
        <div class="modal-box-header">
          <h3 id="wh-adj-modal-title">تعديل مخزون</h3>
          <button type="button" class="modal-close" id="wh-adj-close">&times;</button>
        </div>
        <form id="wh-adj-form">
          <input type="hidden" id="wh-adj-wh-id" />
          <div class="adj-type-group">
            <button type="button" class="adj-type-btn add active" data-type="add" id="adj-btn-add">
              \u2795 \u0625\u0636\u0627\u0641\u0629<br><small style="font-weight:400">\u0632\u064a\u0627\u062f\u0629 \u0643\u0645\u064a\u0629 \u0641\u064a \u0627\u0644\u0645\u062e\u0632\u0646</small>
            </button>
            <button type="button" class="adj-type-btn consume" data-type="consume" id="adj-btn-consume">
              \u2796 \u0627\u0633\u062a\u0647\u0644\u0627\u0643<br><small style="font-weight:400">\u062e\u0635\u0645 \u0643\u0645\u064a\u0629 \u0645\u0646 \u0627\u0644\u0645\u062e\u0632\u0646</small>
            </button>
          </div>
          <input type="hidden" id="wh-adj-type" value="add" />
          <div class="field">
            <label for="wh-adj-product">\u0627\u0644\u0635\u0646\u0641 <span style="color:#dc2626">*</span></label>
            <select id="wh-adj-product" required>
              <option value="">\u0627\u062e\u062a\u0631 \u0635\u0646\u0641\u0627\u064b</option>
            </select>
          </div>
          <div id="wh-adj-current-wrap" style="margin:-6px 0 14px;font-size:12.5px;color:var(--muted);display:none">
            \u0627\u0644\u0643\u0645\u064a\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629: <strong id="wh-adj-current-qty" style="color:var(--ink)">\u2014</strong>
          </div>
          <div class="field">
            <label for="wh-adj-qty">\u0627\u0644\u0643\u0645\u064a\u0629 <span style="color:#dc2626">*</span></label>
            <input type="number" id="wh-adj-qty" min="0.001" step="0.001" value="1" required />
          </div>
          <div class="field">
            <label for="wh-adj-note">\u0645\u0644\u0627\u062d\u0638\u0629 (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)</label>
            <input type="text" id="wh-adj-note" placeholder="\u0645\u062b\u0627\u0644: \u062c\u0631\u062f \u0634\u0647\u0631\u064a\u060c \u062a\u0644\u0641\u060c \u0643\u0633\u0631..." />
          </div>
          <button type="submit" class="btn" id="wh-adj-submit-btn">\u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u062a\u0639\u062f\u064a\u0644</button>
        </form>
      </div>
    </div>

    <!-- ══ مودال سجل حركات المخزن ══ -->
    <div class="modal-overlay" id="wh-log-modal">
      <div class="modal-box" style="max-width:760px;max-height:88vh;display:flex;flex-direction:column">
        <div class="modal-box-header" style="flex-shrink:0">
          <h3 id="wh-log-modal-title">\u0633\u062c\u0644 \u062d\u0631\u0643\u0627\u062a \u0627\u0644\u0645\u062e\u0632\u0646</h3>
          <button type="button" class="modal-close" id="wh-log-close">&times;</button>
        </div>
        <div style="overflow-y:auto;flex:1;padding:0" id="wh-log-body">
          <div class="wh-log-empty">\u062c\u0627\u0631\u0650 \u0627\u0644\u062a\u062d\u0645\u064a\u0644\u2026</div>
        </div>
      </div>
    </div>
`;

// ─── Script module ──────────────────────────────────────────────────────────
const SCRIPT = `
<script type="module">
/* ════════════════════════════════════════════════════════════════════
   تعديل مخزون المخازن + سجل حركات كل مخزن
   — Firebase CDN (app name "whadj" مستقل عن التطبيق الرئيسي)
════════════════════════════════════════════════════════════════════ */
import { initializeApp, getApps }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot,
  query, where, orderBy, doc, updateDoc, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

/* ── Firebase init ── */
const FB_CFG = {
  apiKey:            "AIzaSyDQsaNVskKiV2cwPVlJDixpTD1S-Dhp7gs",
  authDomain:        "reta-and-hamd.firebaseapp.com",
  projectId:         "reta-and-hamd",
  storageBucket:     "reta-and-hamd.firebasestorage.app",
  messagingSenderId: "220767743863",
  appId:             "1:220767743863:web:2ecd37bd5830a39ec1bb72",
};
const _existingApp = getApps().find(a => a.name === "whadj");
const _app  = _existingApp || initializeApp(FB_CFG, "whadj");
const _db   = getFirestore(_app);
const _auth = getAuth(_app);

/* ── helpers ── */
function _esc(v){ const d=document.createElement("div"); d.textContent=v??""; return d.innerHTML; }
function _num(v){ return new Intl.NumberFormat("ar-EG",{maximumFractionDigits:3}).format(v||0); }
function _dt(ts){
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  return d.toLocaleString("ar-EG",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
function _txId(){ return "WA-"+Date.now().toString(36).toUpperCase()+"-"+Math.random().toString(36).slice(2,7).toUpperCase(); }
function _toast(msg, err){
  const t = document.createElement("div");
  t.style.cssText="position:fixed;bottom:80px;right:50%;transform:translateX(50%);z-index:9999;"
    +"padding:10px 20px;border-radius:10px;font-family:Cairo,sans-serif;font-weight:700;font-size:14px;"
    +"background:"+(err?"#dc2626":"#1a6b3a")+";color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.2);"
    +"pointer-events:none;";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 3200);
}

/* ── state ── */
let _adjWhId  = null;
let _adjType  = "add";
let _logWhId  = null;
let _logUnsub = null;

/* ══════════════════════════════════
   قراءة منتجات مخزن من Firestore
══════════════════════════════════ */
function _loadWhProducts(warehouseId, cb){
  const q = query(
    collection(_db,"products"),
    where("warehouseId","==",warehouseId),
    orderBy("createdAt","asc")
  );
  const unsub = onSnapshot(q, snap=>{
    unsub();
    cb(snap.docs.map(d=>({id:d.id,...d.data()})));
  }, err=>{ console.error(err); cb([]); });
}

/* ══════════════════════════════════
   حقن الأزرار في رأس كل مخزن
══════════════════════════════════ */
function _injectBtns(section){
  if(section.dataset.adjInjected) return;
  section.dataset.adjInjected="1";
  const whId = section.dataset.whId;
  if(!whId) return;
  const actDiv = section.querySelector(".warehouse-section-actions");
  if(!actDiv) return;

  const adjBtn = document.createElement("button");
  adjBtn.type="button"; adjBtn.className="wh-adj-btn"; adjBtn.dataset.whId=whId;
  adjBtn.innerHTML="\u26A1 \u062a\u0639\u062f\u064a\u0644 \u0645\u062e\u0632\u0648\u0646";
  adjBtn.title="\u0625\u0636\u0627\u0641\u0629 \u0623\u0648 \u0627\u0633\u062a\u0647\u0644\u0627\u0643 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0632\u0646";

  const logBtn = document.createElement("button");
  logBtn.type="button"; logBtn.className="wh-log-btn"; logBtn.dataset.whId=whId;
  logBtn.innerHTML="\uD83D\uDCCB \u0633\u062c\u0644 \u0627\u0644\u062d\u0631\u0643\u0627\u062a";
  logBtn.title="\u0633\u062c\u0644 \u062d\u0631\u0643\u0627\u062a \u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0632\u0646";

  adjBtn.addEventListener("click", ()=>_openAdj(whId, section));
  logBtn.addEventListener("click", ()=>_openLog(whId, section));

  actDiv.prepend(logBtn);
  actDiv.prepend(adjBtn);
}

function _watchContainer(){
  const c = document.getElementById("warehouses-container");
  if(!c){ setTimeout(_watchContainer,400); return; }
  c.querySelectorAll(".warehouse-section").forEach(_injectBtns);
  new MutationObserver(muts=>{
    muts.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType!==1) return;
      if(n.classList?.contains("warehouse-section")) _injectBtns(n);
      n.querySelectorAll?.(".warehouse-section").forEach(_injectBtns);
    }));
  }).observe(c,{childList:true,subtree:true});
}

/* ══════════════════════════════════
   مودال تعديل المخزون
══════════════════════════════════ */
function _openAdj(whId, section){
  _adjWhId = whId;
  const whName = _whNameFromSection(section);
  document.getElementById("wh-adj-modal-title").textContent = "\u062a\u0639\u062f\u064a\u0644 \u0645\u062e\u0632\u0648\u0646 \u2014 " + whName;
  document.getElementById("wh-adj-wh-id").value = whId;
  document.getElementById("wh-adj-form").reset();
  document.getElementById("wh-adj-qty").value="1";
  document.getElementById("wh-adj-current-wrap").style.display="none";
  _setAdjType("add");

  const prodSel = document.getElementById("wh-adj-product");
  prodSel.innerHTML='<option value="">\u062c\u0627\u0631\u0650 \u0627\u0644\u062a\u062d\u0645\u064a\u0644\u2026</option>';
  document.getElementById("wh-adjust-modal").classList.add("open");

  _loadWhProducts(whId, prods=>{
    prodSel.innerHTML='<option value="">\u0627\u062e\u062a\u0631 \u0635\u0646\u0641\u0627\u064b</option>';
    if(prods.length===0){
      prodSel.innerHTML='<option value="">\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0646\u062a\u062c\u0627\u062a \u0641\u064a \u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0632\u0646</option>';
    } else {
      prods.forEach(p=>{
        const o=document.createElement("option");
        o.value=p.id; o.dataset.qty=p.quantity??0;
        o.dataset.unit=p.quantityType||""; o.dataset.name=p.name||"";
        o.textContent=p.name+" ("+_num(p.quantity||0)+" "+(p.quantityType||"")+")";
        prodSel.appendChild(o);
      });
    }
  });
}

function _setAdjType(t){
  _adjType=t;
  document.getElementById("wh-adj-type").value=t;
  document.getElementById("adj-btn-add").classList.toggle("active",t==="add");
  document.getElementById("adj-btn-consume").classList.toggle("active",t==="consume");
}

function _closeAdj(){
  document.getElementById("wh-adjust-modal").classList.remove("open");
  _adjWhId=null;
}

function _initAdjModal(){
  const modal = document.getElementById("wh-adjust-modal");
  document.getElementById("wh-adj-close").addEventListener("click",_closeAdj);
  modal.addEventListener("click",e=>{ if(e.target===modal) _closeAdj(); });

  document.querySelectorAll(".adj-type-btn").forEach(btn=>{
    btn.addEventListener("click",()=>_setAdjType(btn.dataset.type));
  });

  document.getElementById("wh-adj-product").addEventListener("change",()=>{
    const opt=document.getElementById("wh-adj-product").selectedOptions[0];
    const wrap=document.getElementById("wh-adj-current-wrap");
    if(opt?.value){
      document.getElementById("wh-adj-current-qty").textContent=
        _num(opt.dataset.qty||0)+" "+(opt.dataset.unit||"");
      wrap.style.display="block";
    } else { wrap.style.display="none"; }
  });

  document.getElementById("wh-adj-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const whId   = document.getElementById("wh-adj-wh-id").value;
    const prodId = document.getElementById("wh-adj-product").value;
    const qty    = Number(document.getElementById("wh-adj-qty").value)||0;
    const note   = document.getElementById("wh-adj-note").value.trim();
    const type   = _adjType;
    if(!prodId){ _toast("\u0627\u062e\u062a\u0631 \u0635\u0646\u0641\u0627\u064b",true); return; }
    if(qty<=0){ _toast("\u0623\u062f\u062e\u0644 \u0643\u0645\u064a\u0629 \u0635\u062d\u064a\u062d\u0629",true); return; }

    const opt    = document.getElementById("wh-adj-product").selectedOptions[0];
    const qtyBefore = Number(opt?.dataset.qty||0);
    const qtyAfter  = type==="add" ? qtyBefore+qty : Math.max(0,qtyBefore-qty);
    const prodName  = opt?.dataset.name||"";
    const prodUnit  = opt?.dataset.unit||"";

    if(type==="consume" && qty>qtyBefore){
      _toast("\u0627\u0644\u0643\u0645\u064a\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 ("+_num(qty)+") \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0645\u062a\u0648\u0641\u0631 ("+_num(qtyBefore)+")",true);
      return;
    }

    const btn=document.getElementById("wh-adj-submit-btn");
    btn.disabled=true; btn.innerHTML='<span class="spinner"></span>';
    try {
      /* اسم المخزن */
      const whSnap = await getDoc(doc(_db,"warehouses",whId));
      const whName = whSnap.exists() ? whSnap.data().name : whId;

      const performedBy = _auth.currentUser?.email || "\u2014";
      const tid = _txId();

      await updateDoc(doc(_db,"products",prodId),{
        quantity: qtyAfter, updatedAt: serverTimestamp()
      });

      await addDoc(collection(_db,"warehouseAdjustments"),{
        warehouseId:whId, warehouseName:whName,
        productId:prodId, productName:prodName, productUnit:prodUnit,
        type, qty, qtyBefore, qtyAfter,
        note, txId:tid,
        performedBy, createdAt:serverTimestamp()
      });

      await addDoc(collection(_db,"auditLog"),{
        action: type==="add"?"\u0625\u0636\u0627\u0641\u0629":"\u0627\u0633\u062a\u0647\u0644\u0627\u0643",
        entity:"\u062a\u0639\u062f\u064a\u0644 \u0645\u062e\u0632\u0648\u0646", page:"\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a",
        details:(type==="add"?"\u0625\u0636\u0627\u0641\u0629 ":"\u0627\u0633\u062a\u0647\u0644\u0627\u0643 ")+_num(qty)+" "+prodUnit
          +" \u0645\u0646 "+prodName+" \u0641\u064a "+whName
          +" | \u0642\u0628\u0644: "+_num(qtyBefore)+" | \u0628\u0639\u062f: "+_num(qtyAfter),
        userEmail:performedBy, createdAt:serverTimestamp()
      }).catch(()=>{});

      _toast(type==="add"?"\u062a\u0645\u062a \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0628\u0646\u062c\u0627\u062d \u2713":"\u062a\u0645 \u0627\u0644\u0627\u0633\u062a\u0647\u0644\u0627\u0643 \u0628\u0646\u062c\u0627\u062d \u2713");
      _closeAdj();
    } catch(err){
      console.error(err); _toast("\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062d\u0641\u0638",true);
    } finally {
      btn.disabled=false; btn.textContent="\u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u062a\u0639\u062f\u064a\u0644";
    }
  });
}

/* ══════════════════════════════════
   مودال سجل حركات المخزن
══════════════════════════════════ */
function _whNameFromSection(section){
  const titleEl = section.querySelector(".warehouse-section-title");
  if(!titleEl) return "\u0627\u0644\u0645\u062e\u0632\u0646";
  // النص الأول (Node نصي مباشر) بعد الأيقونة
  let name="";
  titleEl.childNodes.forEach(n=>{ if(n.nodeType===3) name+=n.textContent; });
  return name.replace("\uD83C\uDFEA","").trim() || titleEl.textContent.replace("\uD83C\uDFEA","").replace(/\d+ \u0645\u0646\u062a\u062c/,"").trim();
}

function _openLog(whId, section){
  _logWhId=whId;
  const whName=_whNameFromSection(section);
  document.getElementById("wh-log-modal-title").textContent="\uD83D\uDCCB \u0633\u062c\u0644 \u062d\u0631\u0643\u0627\u062a \u2014 "+whName;
  document.getElementById("wh-log-modal").classList.add("open");
  if(_logUnsub){ _logUnsub(); _logUnsub=null; }

  const body=document.getElementById("wh-log-body");
  body.innerHTML='<div class="wh-log-empty">\u062c\u0627\u0631\u0650 \u0627\u0644\u062a\u062d\u0645\u064a\u0644\u2026</div>';

  const q=query(
    collection(_db,"warehouseAdjustments"),
    where("warehouseId","==",whId),
    orderBy("createdAt","desc")
  );
  _logUnsub=onSnapshot(q, snap=>{
    if(snap.empty){
      body.innerHTML='<div class="wh-log-empty">\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0631\u0643\u0627\u062a \u062a\u0639\u062f\u064a\u0644 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u062e\u0632\u0646 \u0628\u0639\u062f</div>';
      return;
    }
    let trows="", cards="", rowNum=snap.size;
    snap.forEach(ds=>{
      const d=ds.data();
      const seq="WA-"+String(rowNum).padStart(4,"0"); rowNum--;
      const bcls=d.type==="add"?"whadj-add":"whadj-consume";
      const blbl=d.type==="add"?"\u2795 \u0625\u0636\u0627\u0641\u0629":"\u2796 \u0627\u0633\u062a\u0647\u0644\u0627\u0643";
      const ts=d.createdAt?_dt(d.createdAt):"\u2014";
      const qtyStr=_num(d.qty)+" "+_esc(d.productUnit||"");
      const bef=_num(d.qtyBefore||0)+" "+_esc(d.productUnit||"");
      const aft=_num(d.qtyAfter||0)+" "+_esc(d.productUnit||"");
      const afterColor=d.type==="add"?"#15803d":"#dc2626";
      const noteHtml=d.note?'<br><span style="font-size:11px;color:var(--muted)">\uD83D\uDCDD '+_esc(d.note)+'</span>':"";
      const txLabel=d.txId||seq;

      trows+=\`<tr>
        <td><span class="whadj-txid">\${_esc(txLabel)}</span></td>
        <td><span class="whadj-badge \${bcls}">\${blbl}</span></td>
        <td style="font-weight:700;color:var(--ink)">\${_esc(d.productName||"\u2014")}</td>
        <td style="font-weight:800">\${qtyStr}</td>
        <td>
          <div class="whadj-bal">
            <span class="whadj-bal-before">\${bef}</span>
            <span class="whadj-bal-arrow">&rarr;</span>
            <span class="whadj-bal-after" style="color:\${afterColor}">\${aft}</span>
          </div>
        </td>
        <td style="font-size:11.5px;color:var(--muted);font-family:monospace;white-space:nowrap">\${ts}</td>
      </tr>\`;

      cards+=\`<div class="wh-adj-card">
        <div class="wh-adj-card-head">
          <span class="whadj-txid">\${_esc(txLabel)}</span>
          <span class="whadj-badge \${bcls}">\${blbl}</span>
        </div>
        <div class="wh-adj-card-body">\${_esc(d.productName||"\u2014")}: \${qtyStr}\${noteHtml}</div>
        <div class="wh-adj-card-bal">
          <span>\u0642\u0628\u0644:</span><strong>\${bef}</strong>
          <span style="margin:0 4px">&rarr;</span>
          <span>\u0628\u0639\u062f:</span><strong style="color:\${afterColor}">\${aft}</strong>
        </div>
        <div class="wh-adj-card-foot">
          <span>\uD83D\uDC64 \${_esc(d.performedBy||"\u2014")}</span>
          <span style="font-family:monospace">\${ts}</span>
        </div>
      </div>\`;
    });

    body.innerHTML=\`
      <div class="wh-adj-table-wrap" style="overflow-x:auto">
        <table class="wh-adj-table">
          <thead><tr>
            <th>\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u062d\u0631\u0643\u0629</th>
            <th>\u0627\u0644\u0646\u0648\u0639</th>
            <th>\u0627\u0644\u0645\u0646\u062a\u062c</th>
            <th>\u0627\u0644\u0643\u0645\u064a\u0629</th>
            <th>\u0627\u0644\u0631\u0635\u064a\u062f \u0642\u0628\u0644 \u2192 \u0628\u0639\u062f</th>
            <th>\u0627\u0644\u0648\u0642\u062a</th>
          </tr></thead>
          <tbody>\${trows}</tbody>
        </table>
      </div>
      <div class="wh-adj-cards">\${cards}</div>\`;
  }, err=>{ console.error(err); body.innerHTML='<div class="wh-log-empty">\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0633\u062c\u0644</div>'; });
}

function _closeLog(){
  document.getElementById("wh-log-modal").classList.remove("open");
  if(_logUnsub){ _logUnsub(); _logUnsub=null; }
  _logWhId=null;
}

function _initLogModal(){
  const modal=document.getElementById("wh-log-modal");
  document.getElementById("wh-log-close").addEventListener("click",_closeLog);
  modal.addEventListener("click",e=>{ if(e.target===modal) _closeLog(); });
}

/* ══════════════════════════════════
   Bootstrap
══════════════════════════════════ */
document.addEventListener("DOMContentLoaded",()=>{
  _initAdjModal();
  _initLogModal();
  _watchContainer();
});
<\/script>
`;

// ─── Apply changes ──────────────────────────────────────────────────────────
const filePath = "attached_assets/products_1784907068814.html";
let html = fs.readFileSync(filePath, "utf8");

// 1. Inject CSS before first </style>
const styleClose = html.indexOf("</style>");
if (styleClose !== -1) {
  html = html.slice(0, styleClose) + CSS + html.slice(styleClose);
} else {
  html = html.replace("</head>", `<style>${CSS}</style>\n</head>`);
}

// 2. Inject modals before <!-- ══ مراقب شاشة التحميل ══ -->
const loaderMarker = "<!-- \u0552\u0552 \u0645\u0631\u0627\u0642\u0628 \u0634\u0627\u0634\u0629 \u0627\u0644\u062a\u062d\u0645\u064a\u0644 \u0552\u0552 -->";
const loaderIdx = html.indexOf(loaderMarker);
if (loaderIdx !== -1) {
  html = html.slice(0, loaderIdx) + MODALS + "\n\n  " + html.slice(loaderIdx);
} else {
  const lastBody = html.lastIndexOf("</body>");
  html = html.slice(0, lastBody) + MODALS + "\n" + html.slice(lastBody);
}

// 3. Inject script before last </body>
const lastBody = html.lastIndexOf("</body>");
html = html.slice(0, lastBody) + SCRIPT + "\n" + html.slice(lastBody);

fs.writeFileSync(filePath, html, "utf8");
console.log("Done. Total lines:", html.split("\n").length);
