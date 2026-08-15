import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, getDoc,
  onSnapshot, serverTimestamp, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { f as compressImage } from "./image-utils-ix_Ztzsr.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQsaNVskKiV2cwPVlJDixpTD1S-Dhp7gs",
  authDomain: "reta-and-hamd.firebaseapp.com",
  projectId: "reta-and-hamd",
  storageBucket: "reta-and-hamd.firebasestorage.app",
  messagingSenderId: "220767743863",
  appId: "1:220767743863:web:2ecd37bd5830a39ec1bb72"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let uiBound = false;
let warehouses = [];
let products = [];
let merchants = [];
let employees = [];
let merchantTxBalance = {};
let merchantFinBalance = {};
let merchantBalances = {};

let saleLines = [];
let saleLineId = 0;
let prodInputs = [];
let prodOutputs = [];
let prodLineId = 0;
let adjustType = "add";
let productMode = "add";
let productEditingId = null;
let pendingProductFile = null;
let financeType = null;

const FIN_TYPES = {
  advance:    { label: "سلفة موظف",       icon: "👤", dir: "out", fixed: true  },
  withdrawal: { label: "سحب من الصندوق", icon: "📤", dir: "out", fixed: true  },
  deposit:    { label: "إيداع في الصندوق",icon: "📥", dir: "in",  fixed: true  },
  other:      { label: "عملية أخرى",      icon: "📝", dir: null,  fixed: false }
};

function esc(value){
  const d = document.createElement("div");
  d.textContent = value ?? "";
  return d.innerHTML;
}
function num(value){
  return new Intl.NumberFormat("ar-EG-u-nu-latn",{maximumFractionDigits:3}).format(Number(value)||0);
}
function money(value){
  return new Intl.NumberFormat("ar-EG-u-nu-latn",{maximumFractionDigits:2}).format(Number(value)||0)+" ج.م";
}
function today(){
  return new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Cairo"});
}
function opId(){
  return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
}
function adjustTxId(){
  return "WA-"+Date.now().toString(36).toUpperCase()+"-"+Math.random().toString(36).slice(2,7).toUpperCase();
}
function toast(message,error=false){
  let t=document.getElementById("toast");
  if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.appendChild(t);}
  t.textContent=message;
  t.className=`toast show${error?" error-toast":""}`;
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>{t.className="toast";},2800);
}
function setBusy(btn,busy,label){
  btn.disabled=busy;
  btn.innerHTML=busy?'<span class="spinner-mini"></span>':label;
}
function recomputeMerchantBalances(){
  const ids=new Set([...Object.keys(merchantTxBalance),...Object.keys(merchantFinBalance)]);
  merchantBalances={};
  ids.forEach(id=>merchantBalances[id]=(merchantTxBalance[id]||0)+(merchantFinBalance[id]||0));
  updateSaleSummary();
}

/* ══════════════════════════════════════
   navigation — same structure as other pages
══════════════════════════════════════ */
const NAV_ITEMS=[
  ["dashboard.html","الرئيسية","M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"],
  ["merchants.html","التجار","M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"],
  ["products.html","المنتجات","M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.9 18 9 18h12v-2H9.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0023.47 5H5.21l-.94-2H1z"],
  ["employees.html","الموظفين","M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13z"],
  ["finance.html","المالية","M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z"]
];
function renderNav(user){
  const top=document.getElementById("topbar");
  top.innerHTML=`<div class="topbar-inner">
    <div class="brand"><img src="https://i.imgur.com/NsN1HgC.png" alt="logo" style="height:30px;object-fit:contain;border-radius:5px;background:#fff;padding:2px 4px" onerror="this.style.display='none'"><span>Ahmed And hamdy</span></div>
    <nav class="nav-tabs">${NAV_ITEMS.map(([href,label])=>`<a href="/${href}" class="${href==="dashboard.html"?"active":""}">${label}</a>`).join("")}</nav>
    <div class="user-chip"><span>${esc(user?.email||"")}</span><button class="icon-btn" id="logout-btn">خروج</button></div>
  </div>`;
  document.getElementById("logout-btn").addEventListener("click",async()=>{await signOut(auth);location.href="/index.html";});
  let bottom=document.getElementById("bottom-nav");
  if(!bottom){bottom=document.createElement("nav");bottom.id="bottom-nav";document.body.appendChild(bottom);}
  bottom.innerHTML=`<div class="bot-nav-inner">${NAV_ITEMS.map(([href,label,path])=>`<a href="/${href}" class="bot-nav-item${href==="dashboard.html"?" active":""}"><span class="bot-nav-icon"><svg viewBox="0 0 24 24"><path d="${path}"/></svg></span><span>${label}</span></a>`).join("")}</div>`;
}
function hideLoader(){
  const loader=document.getElementById("page-loader");
  if(!loader)return;
  loader.classList.add("pl-hide");
  setTimeout(()=>loader.style.display="none",380);
}

/* ══════════════════════════════════════
   data listeners
══════════════════════════════════════ */
function startData(){
  onSnapshot(collection(db,"warehouses"),snap=>{
    warehouses=snap.docs.map(d=>({id:d.id,...d.data()}));
    refreshAllSelects();
  },dataError);
  onSnapshot(collection(db,"products"),snap=>{
    products=snap.docs.map(d=>({id:d.id,...d.data()}));
    refreshAllSelects(); renderSaleLines(); renderProdLines("input"); renderProdLines("output"); refreshTransferProducts(); refreshAdjustProducts(); refreshProductExisting();
  },dataError);
  onSnapshot(collection(db,"merchants"),snap=>{
    merchants=snap.docs.map(d=>({id:d.id,...d.data()}));
    refreshAllSelects();
  },dataError);
  onSnapshot(collection(db,"employees"),snap=>{
    employees=snap.docs.map(d=>({id:d.id,...d.data()}));
    refreshAllSelects();
  },dataError);
  onSnapshot(collection(db,"merchantTransactions"),snap=>{
    merchantTxBalance={};
    snap.forEach(d=>{const t=d.data();if(!t.merchantId)return;merchantTxBalance[t.merchantId]=(merchantTxBalance[t.merchantId]||0)+(t.type==="out"?-1:1)*(Number(t.amount)||0);});
    recomputeMerchantBalances();
  },dataError);
  onSnapshot(collection(db,"finance_transactions"),snap=>{
    merchantFinBalance={};
    snap.forEach(d=>{const t=d.data();if(t._active===false||t.type!=="merchant"||!t.merchantId)return;merchantFinBalance[t.merchantId]=(merchantFinBalance[t.merchantId]||0)+(t.dir==="in"?1:-1)*(Number(t.amount)||0);});
    recomputeMerchantBalances();
  },dataError);
}
function dataError(err){
  console.error(err);
  const s=document.getElementById("data-status"); if(s)s.textContent="تعذر تحديث بعض البيانات";
}
function fillSelect(id,items,placeholder,labelFn){
  const el=document.getElementById(id); if(!el)return;
  const prev=el.value;
  el.innerHTML=`<option value="">${placeholder}</option>`+items.map(item=>`<option value="${esc(item.id)}">${esc(labelFn(item))}</option>`).join("");
  if(items.some(x=>x.id===prev))el.value=prev;
}
function refreshAllSelects(){
  ["sale-warehouse","prod-from-wh","prod-to-wh","trans-from-wh","trans-to-wh","adj-warehouse","product-warehouse"].forEach(id=>fillSelect(id,warehouses,"اختر مخزناً",w=>w.name||"—"));
  ["sale-merchant","mp-merchant"].forEach(id=>fillSelect(id,merchants,"اختر تاجراً",m=>m.name||"—"));
  fillSelect("fin-employee",employees,"اختر الموظف",e=>e.name||"—");
  refreshProductExisting();
}


/* ══════════════════════════════════════
   SEARCHABLE SELECTS
   يحافظ على <select> الأصلي ويضيف بحثاً داخل القائمة المرئية
══════════════════════════════════════ */
let smartSelectPopover = null;
let smartSelectCurrent = null;
let smartSelectButton = null;
let smartSelectFiltered = [];
let smartActiveIndex = -1;

function smartNormalize(v){
  return String(v??"").toLocaleLowerCase("ar").normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g,"").replace(/أ|إ|آ/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").trim();
}
function smartContextLabel(select){
  const field=select.closest(".field,.line-cell");
  const label=field?.querySelector("label")?.textContent?.replace(/\*/g,"").trim();
  return label||"الخيار";
}
function ensureSmartPopover(){
  if(smartSelectPopover)return smartSelectPopover;
  const pop=document.createElement("div");
  pop.id="smart-select-popover";
  pop.innerHTML=`<div class="smart-search-box"><input class="smart-search-input" type="search" autocomplete="off" /></div><div class="smart-options"></div>`;
  document.body.appendChild(pop);
  const input=pop.querySelector(".smart-search-input");
  input.addEventListener("input",()=>renderSmartOptions(input.value));
  input.addEventListener("keydown",e=>{
    const buttons=[...pop.querySelectorAll(".smart-option")];
    if(e.key==="ArrowDown"){e.preventDefault();smartActiveIndex=Math.min(buttons.length-1,smartActiveIndex+1);paintSmartActive(buttons);}
    else if(e.key==="ArrowUp"){e.preventDefault();smartActiveIndex=Math.max(0,smartActiveIndex-1);paintSmartActive(buttons);}
    else if(e.key==="Enter"){e.preventDefault();const b=buttons[smartActiveIndex>=0?smartActiveIndex:0];if(b)b.click();}
    else if(e.key==="Escape"){e.preventDefault();closeSmartSelect();}
  });
  window.addEventListener("resize",()=>smartSelectCurrent&&positionSmartPopover());
  window.addEventListener("scroll",()=>smartSelectCurrent&&positionSmartPopover(),true);
  document.addEventListener("pointerdown",e=>{
    if(!smartSelectCurrent)return;
    if(pop.contains(e.target)||smartSelectButton?.contains(e.target))return;
    closeSmartSelect();
  });
  return pop;
}
function paintSmartActive(buttons){
  buttons.forEach((b,i)=>b.classList.toggle("active",i===smartActiveIndex));
  buttons[smartActiveIndex]?.scrollIntoView({block:"nearest"});
}
function syncSmartSelect(select){
  const btn=select._smartButton;if(!btn)return;
  const opt=select.options[select.selectedIndex];
  btn.querySelector(".smart-select-label").textContent=opt?.textContent||select.dataset.placeholder||"اختر";
  btn.disabled=select.disabled;
  btn.setAttribute("aria-disabled",select.disabled?"true":"false");
  if(smartSelectCurrent===select)renderSmartOptions(smartSelectPopover?.querySelector(".smart-search-input")?.value||"");
}
function enhanceSelect(select){
  if(!(select instanceof HTMLSelectElement)||select.dataset.smartEnhanced==="1")return;
  select.dataset.smartEnhanced="1";
  const wrapper=document.createElement("div");wrapper.className="smart-select-wrap";
  select.parentNode.insertBefore(wrapper,select);wrapper.appendChild(select);select.classList.add("smart-native-select");
  const btn=document.createElement("button");btn.type="button";btn.className="smart-select-btn";btn.setAttribute("aria-haspopup","listbox");
  btn.innerHTML='<span class="smart-select-label"></span><span class="smart-select-chevron">⌄</span>';
  wrapper.appendChild(btn);select._smartButton=btn;
  btn.addEventListener("click",()=>{if(!select.disabled)openSmartSelect(select,btn);});
  select.addEventListener("change",()=>syncSmartSelect(select));
  const obs=new MutationObserver(()=>syncSmartSelect(select));
  obs.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled"]});
  select._smartObserver=obs;
  syncSmartSelect(select);
}
function enhanceAllSelects(root=document){
  if(root instanceof HTMLSelectElement)enhanceSelect(root);
  root.querySelectorAll?.("select").forEach(enhanceSelect);
}
function positionSmartPopover(){
  if(!smartSelectCurrent||!smartSelectButton||!smartSelectPopover)return;
  const r=smartSelectButton.getBoundingClientRect(), vw=document.documentElement.clientWidth, vh=document.documentElement.clientHeight;
  const margin=8, desired=Math.min(Math.max(r.width,250),Math.min(460,vw-margin*2));
  let left=Math.max(margin,Math.min(r.left,vw-desired-margin));
  smartSelectPopover.style.width=desired+"px";
  smartSelectPopover.style.left=left+"px";
  const popH=Math.min(360,smartSelectPopover.scrollHeight||330);
  const below=vh-r.bottom-margin, above=r.top-margin;
  if(below>=Math.min(260,popH)||below>=above){smartSelectPopover.style.top=(r.bottom+5)+"px";smartSelectPopover.style.bottom="auto";}
  else{smartSelectPopover.style.top="auto";smartSelectPopover.style.bottom=(vh-r.top+5)+"px";}
}
function openSmartSelect(select,btn){
  const pop=ensureSmartPopover();
  if(smartSelectCurrent===select&&pop.classList.contains("open")){closeSmartSelect();return;}
  closeSmartSelect();smartSelectCurrent=select;smartSelectButton=btn;btn.classList.add("is-open");
  const input=pop.querySelector(".smart-search-input");
  input.value="";input.placeholder=`ابحث عن ${smartContextLabel(select)}...`;
  pop.classList.add("open");renderSmartOptions("");positionSmartPopover();
  requestAnimationFrame(()=>{positionSmartPopover();input.focus();input.select();});
}
function closeSmartSelect(){
  smartSelectPopover?.classList.remove("open");smartSelectButton?.classList.remove("is-open");
  smartSelectCurrent=null;smartSelectButton=null;smartSelectFiltered=[];smartActiveIndex=-1;
}
function renderSmartOptions(query){
  if(!smartSelectCurrent||!smartSelectPopover)return;
  const q=smartNormalize(query), opts=[...smartSelectCurrent.options];
  smartSelectFiltered=opts.filter(o=>!o.disabled&&(!q||smartNormalize(o.textContent).includes(q)));
  smartActiveIndex=smartSelectFiltered.length?0:-1;
  const box=smartSelectPopover.querySelector(".smart-options");
  if(!smartSelectFiltered.length){box.innerHTML='<div class="smart-empty">لا توجد نتائج مطابقة</div>';positionSmartPopover();return;}
  box.innerHTML="";
  smartSelectFiltered.forEach((o,i)=>{
    const b=document.createElement("button");b.type="button";b.className="smart-option"+(o.value===smartSelectCurrent.value?" selected":"")+(i===smartActiveIndex?" active":"");
    b.textContent=o.textContent;b.dataset.value=o.value;b.setAttribute("role","option");b.setAttribute("aria-selected",o.value===smartSelectCurrent.value?"true":"false");
    b.addEventListener("click",()=>{
      const changed=smartSelectCurrent.value!==o.value;smartSelectCurrent.value=o.value;syncSmartSelect(smartSelectCurrent);
      if(changed){smartSelectCurrent.dispatchEvent(new Event("input",{bubbles:true}));smartSelectCurrent.dispatchEvent(new Event("change",{bubbles:true}));}
      closeSmartSelect();
    });
    box.appendChild(b);
  });
  positionSmartPopover();
}
function initSearchableSelects(){
  enhanceAllSelects(document);
  const bodyObserver=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)enhanceAllSelects(n);})));bodyObserver.observe(document.body,{childList:true,subtree:true});
  document.addEventListener("reset",()=>setTimeout(()=>document.querySelectorAll("select[data-smart-enhanced='1']").forEach(syncSmartSelect),0),true);
}

/* ══════════════════════════════════════
   modal shell
══════════════════════════════════════ */
function openModal(id){
  const modal=document.getElementById(id); if(!modal)return;
  if(id==="sale-modal") resetSale();
  if(id==="production-modal") resetProduction();
  if(id==="transfer-modal") resetTransfer();
  if(id==="adjust-modal") resetAdjust();
  if(id==="product-modal") resetProductForm();
  if(id==="warehouse-modal") document.getElementById("warehouse-form").reset();
  if(id==="merchant-pay-modal") resetMerchantPay();
  modal.classList.add("open");
  document.body.style.overflow="hidden";
}
function closeModal(modal){
  closeSmartSelect();
  (typeof modal==="string"?document.getElementById(modal):modal)?.classList.remove("open");
  if(!document.querySelector(".dash-modal.open"))document.body.style.overflow="";
}
function bindModalShell(){
  document.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openModal(b.dataset.open)));
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.closest(".dash-modal"))));
  document.querySelectorAll(".dash-modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)closeModal(m);}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){const m=document.querySelector(".dash-modal.open");if(m)closeModal(m);}});
}

/* ══════════════════════════════════════
   SALE — same direction/schema as products page
══════════════════════════════════════ */
function resetSale(){
  document.getElementById("sale-form").reset();
  saleLines=[{id:++saleLineId,productId:"",qty:1,price:0}];
  document.querySelector('input[name="sale-pay"][value="unpaid"]').checked=true;
  updateSalePayStyle(); renderSaleLines(); updateSaleSummary();
}
function renderSaleLines(){
  const box=document.getElementById("sale-lines"); if(!box)return;
  const whId=document.getElementById("sale-warehouse")?.value;
  const list=whId?products.filter(p=>p.warehouseId===whId):[];
  box.innerHTML="";
  saleLines.forEach(line=>{
    const row=document.createElement("div"); row.className="line-row";
    row.innerHTML=`
      <div class="line-cell"><label>الصنف</label><select class="sale-prod"><option value="">اختر صنفاً</option>${list.map(p=>`<option value="${p.id}" ${p.id===line.productId?"selected":""}>${esc(p.name)} (${num(p.quantity)} ${esc(p.quantityType||"")})</option>`).join("")}</select></div>
      <div class="line-cell"><label>الكمية</label><input class="sale-qty" type="number" min="0.01" step="0.01" value="${line.qty}"></div>
      <div class="line-cell"><label>السعر</label><input class="sale-price" type="number" min="0" step="0.01" value="${line.price}"></div>
      <button class="remove-line" type="button" ${saleLines.length===1?"disabled":""}>حذف</button>
      <div class="line-meta"></div>`;
    const sel=row.querySelector(".sale-prod"),qty=row.querySelector(".sale-qty"),price=row.querySelector(".sale-price"),meta=row.querySelector(".line-meta");
    const updateMeta=()=>{const p=products.find(x=>x.id===line.productId);meta.textContent=p?`متوفر: ${num(p.quantity)} ${p.quantityType||""} — إجمالي السطر: ${money(line.qty*line.price)}`:"";};
    sel.addEventListener("change",()=>{line.productId=sel.value;const p=products.find(x=>x.id===line.productId);if(p&&(!line.price||line.price===0)){line.price=Number(p.price)||0;price.value=line.price;}updateMeta();updateSaleSummary();});
    qty.addEventListener("input",()=>{line.qty=Number(qty.value)||1;updateMeta();updateSaleSummary();});
    price.addEventListener("input",()=>{line.price=Number(price.value)||0;updateMeta();updateSaleSummary();});
    row.querySelector(".remove-line").addEventListener("click",()=>{saleLines=saleLines.filter(x=>x.id!==line.id);renderSaleLines();updateSaleSummary();});
    updateMeta(); box.appendChild(row);
  });
}
function updateSalePayStyle(){
  const paid=document.querySelector('input[name="sale-pay"]:checked')?.value==="paid";
  document.querySelectorAll("[data-sale-pay]").forEach(c=>{c.classList.remove("active-in","active-out");if(c.dataset.salePay===(paid?"paid":"unpaid"))c.classList.add(paid?"active-in":"active-out");});
  updateSaleSummary();
}
function updateSaleSummary(){
  const valid=saleLines.filter(l=>l.productId&&l.qty>0);
  const total=valid.reduce((s,l)=>s+l.qty*l.price,0);
  const merchantId=document.getElementById("sale-merchant")?.value;
  const before=merchantId?(merchantBalances[merchantId]??0):null;
  const paid=document.querySelector('input[name="sale-pay"]:checked')?.value==="paid";
  document.getElementById("sale-summary-count")&&(document.getElementById("sale-summary-count").textContent=String(valid.length));
  document.getElementById("sale-summary-total")&&(document.getElementById("sale-summary-total").textContent=money(total));
  document.getElementById("sale-summary-balance")&&(document.getElementById("sale-summary-balance").textContent=before===null?"—":money(paid?before:before-total));
}
async function reserveFinIdInBatch(batch){
  const counterRef=doc(db,"counters","finance_trans");
  const snap=await getDoc(counterRef);
  const seq=(snap.exists()?Number(snap.data().seq)||0:0)+1;
  batch.set(counterRef,{seq},{merge:true});
  return "F-"+String(seq).padStart(4,"0");
}
async function submitSale(e){
  e.preventDefault();
  const whId=document.getElementById("sale-warehouse").value;
  const merchantId=document.getElementById("sale-merchant").value;
  const note=document.getElementById("sale-note").value.trim();
  const isPaid=document.querySelector('input[name="sale-pay"]:checked')?.value==="paid";
  const valid=saleLines.filter(l=>l.productId&&l.qty>0);
  if(!whId)return toast("اختر المخزن",true);
  if(!merchantId)return toast("اختر التاجر",true);
  if(!valid.length)return toast("أضف صنفاً واحداً على الأقل",true);
  const btn=document.getElementById("sale-submit"); setBusy(btn,true,"تنفيذ عملية البيع");
  try{
    const batch=writeBatch(db), id=opId();
    const wh=warehouses.find(w=>w.id===whId), merchant=merchants.find(m=>m.id===merchantId);
    const lines=[]; let total=0;
    for(const line of valid){
      const p=products.find(x=>x.id===line.productId); if(!p)continue;
      const lineTotal=line.qty*line.price; total+=lineTotal;
      batch.update(doc(db,"products",p.id),{quantity:Math.max(0,(Number(p.quantity)||0)-line.qty),updatedAt:serverTimestamp()});
      lines.push({productId:p.id,productName:p.name,qty:line.qty,unit:p.quantityType||"",price:line.price,total:lineTotal});
    }
    const before=merchantBalances[merchantId]??0;
    const after=isPaid?before:before-total;
    batch.set(doc(collection(db,"loadingOperations")),{
      type:"loading",opId:id,warehouseId:whId,warehouseName:wh?.name??"",merchantId,merchantName:merchant?.name??"",
      lines,totalAmount:total,note,merchantBalanceBefore:before,merchantBalanceAfter:after,performedBy:currentUser?.email??"—",createdAt:serverTimestamp()
    });
    const date=today(), txId=`TL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    batch.set(doc(collection(db,"merchantTransactions")),{
      merchantId,merchantName:merchant?.name??"",amount:total,type:"out",
      note:`بيع من مخزن ${wh?.name??""}${isPaid?" — نقدي":""}${note?" — "+note:""}`,
      date,txId,opId:id,source:"loading",paid:isPaid,createdAt:serverTimestamp()
    });
    if(isPaid&&total>0){
      const finId=await reserveFinIdInBatch(batch);
      batch.set(doc(collection(db,"finance_transactions")),{
        type:"merchant",dir:"in",amount:total,date,merchantId,merchantName:merchant?.name??"",txId:`PY-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        opId:id,finId,_active:true,source:"auto-payment",sourcePage:"المنتجات",
        description:`دفع فوري — بيع نقدي من مخزن ${wh?.name??""}${note?" — "+note:""}`,affectsCash:true,performedBy:currentUser?.email??"—",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      batch.set(doc(collection(db,"finance_transactions")),{
        type:"deposit",dir:"in",amount:total,date,txId:`DP-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        opId:id,finId,_active:true,source:"auto-payment",sourcePage:"المنتجات",
        description:`إيداع نقدي — بيع للتاجر ${merchant?.name??""}${note?" — "+note:""}`,performedBy:currentUser?.email??"—",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
    }
    batch.set(doc(collection(db,"activityLog")),{type:"loading",summary:`بيع: ${wh?.name??""} → ${merchant?.name??""}`,details:`${lines.length} صنف — إجمالي: ${money(total)}`,opId:id,note,merchantBalanceBefore:before,merchantBalanceAfter:after,performedBy:currentUser?.email??"—",createdAt:serverTimestamp()});
    batch.set(doc(collection(db,"auditLog")),{action:"إضافة",entity:"عملية بيع",page:"المنتجات",details:`بيع: ${wh?.name??""} → ${merchant?.name??""} — ${lines.length} صنف — إجمالي: ${money(total)}`,userEmail:currentUser?.email??"—",createdAt:serverTimestamp()});
    await batch.commit(); closeModal("sale-modal"); toast("تمت عملية البيع بنجاح");
  }catch(err){console.error(err);toast("حدث خطأ أثناء تنفيذ البيع",true);}finally{setBusy(btn,false,"تنفيذ عملية البيع");}
}

/* ══════════════════════════════════════
   PRODUCTION
══════════════════════════════════════ */
function resetProduction(){
  document.getElementById("production-form").reset();
  prodInputs=[{id:++prodLineId,productId:"",qty:1}];
  prodOutputs=[{id:++prodLineId,productId:"",qty:1}];
  renderProdLines("input"); renderProdLines("output");
}
function renderProdLines(direction){
  const box=document.getElementById(direction==="input"?"prod-input-lines":"prod-output-lines"); if(!box)return;
  const arr=direction==="input"?prodInputs:prodOutputs;
  const whId=document.getElementById(direction==="input"?"prod-from-wh":"prod-to-wh")?.value;
  const list=whId?products.filter(p=>p.warehouseId===whId):[];
  box.innerHTML="";
  arr.forEach(line=>{
    const row=document.createElement("div");row.className="line-row production";
    row.innerHTML=`<div class="line-cell"><label>${direction==="input"?"المادة":"المنتج الناتج"}</label><select class="prod-product"><option value="">اختر منتجاً</option>${list.map(p=>`<option value="${p.id}" ${p.id===line.productId?"selected":""}>${esc(p.name)} (${num(p.quantity)} ${esc(p.quantityType||"")})</option>`).join("")}</select></div><div class="line-cell"><label>الكمية</label><input class="prod-qty" type="number" min="0.01" step="0.01" value="${line.qty}"></div><button type="button" class="remove-line" ${arr.length===1?"disabled":""}>حذف</button><div class="line-meta"></div>`;
    const sel=row.querySelector(".prod-product"),qty=row.querySelector(".prod-qty"),meta=row.querySelector(".line-meta");
    const hint=()=>{const p=products.find(x=>x.id===line.productId);meta.textContent=p?`متوفر حالياً: ${num(p.quantity)} ${p.quantityType||""}`:"";};
    sel.addEventListener("change",()=>{line.productId=sel.value;hint();}); qty.addEventListener("input",()=>line.qty=Number(qty.value)||1);
    row.querySelector(".remove-line").addEventListener("click",()=>{if(direction==="input")prodInputs=prodInputs.filter(x=>x.id!==line.id);else prodOutputs=prodOutputs.filter(x=>x.id!==line.id);renderProdLines(direction);});
    hint();box.appendChild(row);
  });
}
async function submitProduction(e){
  e.preventDefault();
  const fromId=document.getElementById("prod-from-wh").value,toId=document.getElementById("prod-to-wh").value,note=document.getElementById("prod-note").value.trim();
  if(!fromId||!toId)return toast("اختر مخزن المصدر والهدف",true);
  if(fromId===toId)return toast("يجب أن يكون المخزنان مختلفين",true);
  const inputs=prodInputs.filter(l=>l.productId&&l.qty>0),outputs=prodOutputs.filter(l=>l.productId&&l.qty>0);
  if(!inputs.length)return toast("أضف مادة مستهلكة واحدة على الأقل",true);
  if(!outputs.length)return toast("أضف منتجاً ناتجاً واحداً على الأقل",true);
  const btn=document.getElementById("prod-submit");setBusy(btn,true,"تنفيذ عملية الإنتاج");
  try{
    const batch=writeBatch(db),id=opId(),from=warehouses.find(w=>w.id===fromId),to=warehouses.find(w=>w.id===toId),inputDetails=[],outputDetails=[];
    inputs.forEach(line=>{const p=products.find(x=>x.id===line.productId);if(!p)return;batch.update(doc(db,"products",p.id),{quantity:(Number(p.quantity)||0)-line.qty,updatedAt:serverTimestamp()});inputDetails.push({productId:p.id,productName:p.name,qty:line.qty,unit:p.quantityType||""});});
    outputs.forEach(line=>{const p=products.find(x=>x.id===line.productId);if(!p)return;batch.update(doc(db,"products",p.id),{quantity:(Number(p.quantity)||0)+line.qty,updatedAt:serverTimestamp()});outputDetails.push({productId:p.id,productName:p.name,qty:line.qty,unit:p.quantityType||""});});
    batch.set(doc(collection(db,"warehouseOperations")),{type:"production",opId:id,fromWarehouseId:fromId,fromWarehouseName:from?.name??"",toWarehouseId:toId,toWarehouseName:to?.name??"",inputs:inputDetails,outputs:outputDetails,note,performedBy:currentUser?.email??"—",createdAt:serverTimestamp()});
    batch.set(doc(collection(db,"activityLog")),{type:"production",summary:`إنتاج: ${from?.name??""} ← ${to?.name??""}`,details:`مدخلات: ${inputs.length} | مخرجات: ${outputs.length}`,opId:id,note,performedBy:currentUser?.email??"—",createdAt:serverTimestamp()});
    batch.set(doc(collection(db,"auditLog")),{action:"إضافة",entity:"عملية إنتاج",page:"المنتجات",details:`إنتاج: ${from?.name??""} ← ${to?.name??""} — مدخلات: ${inputs.length} | مخرجات: ${outputs.length}`,userEmail:currentUser?.email??"—",createdAt:serverTimestamp()});
    await batch.commit();closeModal("production-modal");toast("تمت عملية الإنتاج بنجاح");
  }catch(err){console.error(err);toast("حدث خطأ أثناء التنفيذ",true);}finally{setBusy(btn,false,"تنفيذ عملية الإنتاج");}
}

/* ══════════════════════════════════════
   TRANSFER
══════════════════════════════════════ */
function resetTransfer(){document.getElementById("transfer-form").reset();document.getElementById("trans-qty").value="1";refreshTransferProducts();}
function refreshTransferProducts(){
  const fromId=document.getElementById("trans-from-wh")?.value,toId=document.getElementById("trans-to-wh")?.value;
  fillSelect("trans-product",fromId?products.filter(p=>p.warehouseId===fromId):[],"اختر صنفاً من المخزن المصدر",p=>`${p.name} (${num(p.quantity)} ${p.quantityType||""})`);
  fillSelect("trans-dest-product",toId?products.filter(p=>p.warehouseId===toId):[],"إنشاء صنف زائر تلقائياً",p=>`${p.name} (${num(p.quantity)} ${p.quantityType||""})`);
}
async function submitTransfer(e){
  e.preventDefault();
  const fromId=document.getElementById("trans-from-wh").value,toId=document.getElementById("trans-to-wh").value,srcId=document.getElementById("trans-product").value,destId=document.getElementById("trans-dest-product").value,qty=Number(document.getElementById("trans-qty").value)||0,note=document.getElementById("trans-note").value.trim();
  if(!fromId||!toId)return toast("اختر المخزنين",true);if(fromId===toId)return toast("يجب أن يكون المخزنان مختلفين",true);if(!srcId)return toast("اختر الصنف المراد تحويله",true);if(qty<=0)return toast("أدخل كمية صحيحة",true);
  const src=products.find(p=>p.id===srcId);if(!src)return;if((Number(src.quantity)||0)<qty)return toast(`الكمية المتوفرة (${num(src.quantity)}) أقل من المطلوب`,true);
  const btn=document.getElementById("trans-submit");setBusy(btn,true,"تنفيذ التحويل");
  try{
    const batch=writeBatch(db),id=opId(),from=warehouses.find(w=>w.id===fromId),to=warehouses.find(w=>w.id===toId);let destFinal=destId||"";
    batch.update(doc(db,"products",srcId),{quantity:(Number(src.quantity)||0)-qty,updatedAt:serverTimestamp()});
    if(destId){const dp=products.find(p=>p.id===destId);if(dp)batch.update(doc(db,"products",destId),{quantity:(Number(dp.quantity)||0)+qty,updatedAt:serverTimestamp()});}
    else{const ref=doc(collection(db,"products"));destFinal=ref.id;batch.set(ref,{name:src.name,serialId:src.serialId||"",description:src.description||"",quantity:qty,quantityType:src.quantityType||"قطعة",price:src.price||0,imageUrl:src.imageUrl||null,warehouseId:toId,warehouseName:to?.name??"",isVisiting:true,sourceProductId:srcId,sourceWarehouseId:fromId,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}
    batch.set(doc(collection(db,"warehouseOperations")),{type:"transfer",opId:id,fromWarehouseId:fromId,fromWarehouseName:from?.name??"",toWarehouseId:toId,toWarehouseName:to?.name??"",productId:srcId,productName:src.name,destProductId:destFinal,quantity:qty,unit:src.quantityType||"",note,performedBy:currentUser?.email??"—",createdAt:serverTimestamp()});
    batch.set(doc(collection(db,"activityLog")),{type:"transfer",summary:`تحويل: ${src.name} من ${from?.name??""} إلى ${to?.name??""}`,details:`${num(qty)} ${src.quantityType||""}`,opId:id,note,performedBy:currentUser?.email??"—",createdAt:serverTimestamp()});
    batch.set(doc(collection(db,"auditLog")),{action:"إضافة",entity:"عملية تحويل",page:"المنتجات",details:`تحويل: ${src.name} من ${from?.name??""} إلى ${to?.name??""} — ${num(qty)} ${src.quantityType||""}`,userEmail:currentUser?.email??"—",createdAt:serverTimestamp()});
    await batch.commit();closeModal("transfer-modal");toast("تم التحويل بنجاح");
  }catch(err){console.error(err);toast("حدث خطأ أثناء التنفيذ",true);}finally{setBusy(btn,false,"تنفيذ التحويل");}
}

/* ══════════════════════════════════════
   STOCK ADJUST
══════════════════════════════════════ */
function resetAdjust(){document.getElementById("adjust-form").reset();document.getElementById("adj-qty").value="1";adjustType="add";updateAdjustTypeUI();refreshAdjustProducts();updateAdjustPreview();}
function updateAdjustTypeUI(){document.querySelectorAll("[data-adj-type]").forEach(b=>b.classList.toggle("selected",b.dataset.adjType===adjustType));updateAdjustPreview();}
function refreshAdjustProducts(){const whId=document.getElementById("adj-warehouse")?.value;fillSelect("adj-product",whId?products.filter(p=>p.warehouseId===whId):[],"اختر صنفاً",p=>`${p.name} (${num(p.quantity)} ${p.quantityType||""})`);updateAdjustPreview();}
function updateAdjustPreview(){
  const p=products.find(x=>x.id===document.getElementById("adj-product")?.value),qty=Number(document.getElementById("adj-qty")?.value)||0,before=Number(p?.quantity)||0,after=adjustType==="add"?before+qty:Math.max(0,before-qty);
  const unit=p?.quantityType||"";if(document.getElementById("adj-before"))document.getElementById("adj-before").textContent=p?`${num(before)} ${unit}`:"—";if(document.getElementById("adj-after"))document.getElementById("adj-after").textContent=p?`${num(after)} ${unit}`:"—";
}
async function submitAdjust(e){
  e.preventDefault();const whId=document.getElementById("adj-warehouse").value,prodId=document.getElementById("adj-product").value,qty=Number(document.getElementById("adj-qty").value)||0,note=document.getElementById("adj-note").value.trim();
  if(!whId)return toast("اختر المخزن",true);if(!prodId)return toast("اختر صنفاً",true);if(qty<=0)return toast("أدخل كمية صحيحة",true);
  const p=products.find(x=>x.id===prodId),wh=warehouses.find(x=>x.id===whId);if(!p)return;const before=Number(p.quantity)||0;if(adjustType==="consume"&&qty>before)return toast(`الكمية المطلوبة (${num(qty)}) أكبر من المتوفر (${num(before)})`,true);const after=adjustType==="add"?before+qty:Math.max(0,before-qty);
  const btn=document.getElementById("adj-submit");setBusy(btn,true,"تنفيذ التعديل");
  try{
    await updateDoc(doc(db,"products",prodId),{quantity:after,updatedAt:serverTimestamp()});
    const tid=adjustTxId();
    await addDoc(collection(db,"warehouseAdjustments"),{warehouseId:whId,warehouseName:wh?.name??whId,productId:prodId,productName:p.name,productUnit:p.quantityType||"",type:adjustType,qty,qtyBefore:before,qtyAfter:after,note,txId:tid,performedBy:currentUser?.email||"—",createdAt:serverTimestamp()});
    await addDoc(collection(db,"auditLog"),{action:adjustType==="add"?"إضافة":"استهلاك",entity:"تعديل مخزون",page:"المنتجات",details:(adjustType==="add"?"إضافة ":"استهلاك ")+num(qty)+" "+(p.quantityType||"")+" من "+p.name+" في "+(wh?.name??whId)+" | قبل: "+num(before)+" | بعد: "+num(after),userEmail:currentUser?.email||"—",createdAt:serverTimestamp()}).catch(()=>{});
    closeModal("adjust-modal");toast(adjustType==="add"?"تمت الإضافة بنجاح ✓":"تم الاستهلاك بنجاح ✓");
  }catch(err){console.error(err);toast("حدث خطأ أثناء الحفظ",true);}finally{setBusy(btn,false,"تنفيذ التعديل");}
}

/* ══════════════════════════════════════
   PRODUCT + WAREHOUSE
══════════════════════════════════════ */
function generateSerial(warehouseId){const idx=warehouses.findIndex(w=>w.id===warehouseId),whNum=idx>=0?idx+1:1,count=products.filter(p=>p.warehouseId===warehouseId).length+1;return `W${whNum}-${String(count).padStart(5,"0")}`;}
function refreshProductExisting(){fillSelect("product-existing",products,"اختر منتجاً",p=>`${p.name} — ${p.warehouseName||warehouses.find(w=>w.id===p.warehouseId)?.name||""}`);}
function resetProductForm(){
  document.getElementById("product-form").reset();productMode="add";productEditingId=null;pendingProductFile=null;document.getElementById("product-image-preview").style.display="none";document.getElementById("product-image-text").textContent="اضغط لاختيار صورة";setProductMode("add");
}
function setProductMode(mode){
  productMode=mode;productEditingId=null;document.querySelectorAll("[data-product-mode]").forEach(b=>b.classList.toggle("selected",b.dataset.productMode===mode));document.getElementById("product-existing-wrap").style.display=mode==="edit"?"block":"none";document.getElementById("product-warehouse").disabled=mode==="edit";
  if(mode==="add"){document.getElementById("product-existing").value="";document.getElementById("product-name").value="";document.getElementById("product-desc").value="";document.getElementById("product-current-qty").value="0";document.getElementById("product-price").value="0";document.getElementById("product-unit").value="قطعة";document.getElementById("product-serial").value=document.getElementById("product-warehouse").value?generateSerial(document.getElementById("product-warehouse").value):"";}
}
function loadProductForEdit(){
  const p=products.find(x=>x.id===document.getElementById("product-existing").value);productEditingId=p?.id||null;if(!p)return;
  document.getElementById("product-warehouse").value=p.warehouseId||"";document.getElementById("product-name").value=p.name||"";document.getElementById("product-serial").value=p.serialId||generateSerial(p.warehouseId);document.getElementById("product-desc").value=p.description||"";document.getElementById("product-current-qty").value=Number(p.quantity)||0;document.getElementById("product-unit").value=p.quantityType||"قطعة";document.getElementById("product-price").value=Number(p.price)||0;
  const img=document.getElementById("product-image-preview");if(p.imageUrl){img.src=p.imageUrl;img.style.display="block";document.getElementById("product-image-text").textContent="الصورة الحالية — اضغط للتغيير";}else{img.style.display="none";document.getElementById("product-image-text").textContent="اضغط لاختيار صورة";}
}
async function submitProduct(e){
  e.preventDefault();const name=document.getElementById("product-name").value.trim(),warehouseId=document.getElementById("product-warehouse").value;if(!warehouseId)return toast("اختر المخزن",true);if(!name)return toast("أدخل اسم المنتج",true);if(productMode==="edit"&&!productEditingId)return toast("اختر المنتج المراد تعديله",true);
  const old=products.find(p=>p.id===productEditingId),serialId=document.getElementById("product-serial").value.trim()||(old?.serialId||generateSerial(warehouseId)),description=document.getElementById("product-desc").value.trim(),quantity=productEditingId?(Number(old?.quantity)||0):0,quantityType=document.getElementById("product-unit").value,price=Number(document.getElementById("product-price").value)||0,wh=warehouses.find(w=>w.id===warehouseId),btn=document.getElementById("product-submit");setBusy(btn,true,"حفظ المنتج");
  try{
    let imageUrl=old?.imageUrl??null;if(pendingProductFile)imageUrl=await compressImage(pendingProductFile);
    const data={name,serialId,description,quantity,quantityType,price,imageUrl,warehouseId,warehouseName:wh?.name??"",updatedAt:serverTimestamp()};
    if(productEditingId){await updateDoc(doc(db,"products",productEditingId),data);await writeAudit("تعديل","منتج",`${name} — ${serialId}`,"المنتجات");toast("تم تحديث المنتج");}
    else{await addDoc(collection(db,"products"),{...data,createdAt:serverTimestamp()});await writeAudit("إضافة","منتج",`${name} — ${serialId}`,"المنتجات");toast("تمت إضافة المنتج");}
    closeModal("product-modal");
  }catch(err){console.error(err);toast("حدث خطأ أثناء حفظ المنتج",true);}finally{setBusy(btn,false,"حفظ المنتج");}
}
async function submitWarehouse(e){
  e.preventDefault();const name=document.getElementById("warehouse-name").value.trim();if(!name)return toast("أدخل اسم المخزن",true);const btn=document.getElementById("warehouse-submit");setBusy(btn,true,"حفظ المخزن");
  try{await addDoc(collection(db,"warehouses"),{name,createdAt:serverTimestamp()});await writeAudit("إضافة","مخزن",name,"المنتجات");closeModal("warehouse-modal");toast("تمت إضافة المخزن");}catch(err){console.error(err);toast("حدث خطأ",true);}finally{setBusy(btn,false,"حفظ المخزن");}
}

/* ══════════════════════════════════════
   FINANCE — same dir/type semantics as finance page
══════════════════════════════════════ */
async function nextFinId(){
  const ref=doc(db,"counters","finance_trans");let seq=1;
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);seq=(snap.exists()?Number(snap.data().seq)||0:0)+1;tx.set(ref,{seq},{merge:true});});
  return "F-"+String(seq).padStart(4,"0");
}
async function writeAudit(action,entity,details,page="المالية"){
  try{await addDoc(collection(db,"auditLog"),{action,entity,page,details,userEmail:currentUser?.email||"—",createdAt:serverTimestamp()});}catch(err){console.error("auditLog",err);}
}
function buildDeductMonths(){
  const sel=document.getElementById("fin-deduct-month"),now=new Date(),curY=now.getFullYear(),curM=now.getMonth(),next=new Date(curY,curM+1,1);
  const opts=[new Date(curY,curM,1),next];sel.innerHTML=opts.map((d,i)=>{const val=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,label=d.toLocaleDateString("ar-EG-u-nu-latn",{month:"long",year:"numeric"});return `<option value="${val}">${i===0?"الشهر الحالي":"الشهر القادم"} — ${label}</option>`;}).join("");
}
function openFinance(type){
  const cfg=FIN_TYPES[type];if(!cfg)return;financeType=type;document.getElementById("finance-form").reset();document.getElementById("fin-date").value=today();document.getElementById("fin-modal-title").textContent=cfg.label;document.getElementById("fin-modal-icon").textContent=cfg.icon;
  document.getElementById("fin-dir-field").style.display=cfg.fixed?"none":"block";document.getElementById("fin-employee-field").style.display=type==="advance"?"block":"none";document.getElementById("fin-month-field").style.display=type==="advance"?"block":"none";document.getElementById("fin-party-field").style.display=(type==="withdrawal"||type==="deposit"||type==="other")?"block":"none";
  if(type==="advance")buildDeductMonths();
  if(type==="withdrawal"||type==="deposit"){document.getElementById("fin-party-label").textContent="جهة الصرف / المصدر";document.getElementById("fin-party").placeholder="مثال: إيجار، مصروفات إدارية…";}else if(type==="other"){document.getElementById("fin-party-label").textContent="اسم الجهة";document.getElementById("fin-party").placeholder="اختياري";}
  document.querySelectorAll("[data-fin-dir]").forEach(c=>c.classList.remove("active-in","active-out"));
  if(cfg.fixed){const r=document.querySelector(`input[name="fin-dir"][value="${cfg.dir}"]`);if(r)r.checked=true;}
  updateFinanceDirHint();document.getElementById("finance-modal").classList.add("open");document.body.style.overflow="hidden";
}
function updateFinanceDirHint(){
  const cfg=FIN_TYPES[financeType],hint=document.getElementById("fin-dir-hint");if(!cfg){hint.className="dir-box custom";hint.textContent="اختر العملية";return;}
  const dir=cfg.fixed?cfg.dir:document.querySelector('input[name="fin-dir"]:checked')?.value;
  document.querySelectorAll("[data-fin-dir]").forEach(c=>{c.classList.remove("active-in","active-out");if(c.dataset.finDir===dir)c.classList.add(dir==="in"?"active-in":"active-out");});
  if(!dir){hint.className="dir-box custom";hint.textContent="حدد اتجاه العملية";}else if(dir==="in"){hint.className="dir-box in";hint.textContent="✅ هذه العملية ستُضاف إلى رصيد الصندوق";}else{hint.className="dir-box out";hint.textContent="⚠️ هذه العملية ستُخصم من رصيد الصندوق";}
}
async function submitFinance(e){
  e.preventDefault();const cfg=FIN_TYPES[financeType];if(!cfg)return toast("اختر نوع العملية",true);const amount=Number(document.getElementById("fin-amount").value);if(!amount||amount<=0)return toast("أدخل مبلغاً صحيحاً",true);const dir=cfg.fixed?cfg.dir:document.querySelector('input[name="fin-dir"]:checked')?.value;if(!dir)return toast("حدد اتجاه العملية",true);
  const empId=financeType==="advance"?document.getElementById("fin-employee").value:"";if(financeType==="advance"&&!empId)return toast("اختر الموظف أولاً",true);const emp=employees.find(x=>x.id===empId);const deductMonth=financeType==="advance"?document.getElementById("fin-deduct-month").value:"";if(financeType==="advance"&&!deductMonth)return toast("حدد شهر الخصم من الراتب",true);
  const partyName=document.getElementById("fin-party").value.trim();let merchantId="",merchantName="";const matched=partyName?merchants.find(m=>(m.name||"").trim().toLowerCase()===partyName.toLowerCase()):null;if(matched){merchantId=matched.id;merchantName=matched.name;}
  const date=document.getElementById("fin-date").value;if(!date)return toast("اختر التاريخ",true);const btn=document.getElementById("fin-submit");setBusy(btn,true,"حفظ العملية");
  try{const finId=await nextFinId(),data={type:financeType,dir,amount,date,description:document.getElementById("fin-desc").value.trim(),partyName,merchantId,merchantName,employeeId:empId,employeeName:emp?.name??"",deductMonth:financeType==="advance"?deductMonth:"",sourcePage:"المالية",_active:true};await addDoc(collection(db,"finance_transactions"),{...data,finId,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await writeAudit("إضافة","حركة مالية",`${finId} — ${data.type} — ${data.amount} ج.م${data.employeeName?" — "+data.employeeName:""}${data.merchantName?" — "+data.merchantName:""}`);closeModal("finance-modal");toast("تمت الإضافة — المعرف: "+finId);}catch(err){console.error(err);toast("خطأ أثناء الحفظ",true);}finally{setBusy(btn,false,"حفظ العملية");}
}

/* ══════════════════════════════════════
   MERCHANT PAYMENT
══════════════════════════════════════ */
function resetMerchantPay(){
  document.getElementById("merchant-pay-form").reset();document.getElementById("mp-date").value=today();document.querySelector('input[name="mp-type"][value="in"]').checked=true;document.getElementById("mp-cash").checked=true;updateMerchantPayStyle();
}
function updateMerchantPayStyle(){
  const type=document.querySelector('input[name="mp-type"]:checked')?.value||"in";
  document.querySelectorAll("[data-mp-type]").forEach(c=>{c.classList.remove("active-in","active-out");if(c.dataset.mpType===type)c.classList.add(type==="in"?"active-in":"active-out");});
  const hint=document.getElementById("mp-dir-hint");if(type==="in"){hint.className="dir-box in";hint.textContent="تسديد مستحقات: يقل دين التاجر، والنقد — إن وُجد — يدخل الصندوق.";}else{hint.className="dir-box out";hint.textContent="إضافة على الحساب: يزيد دين التاجر، والنقد — إن وُجد — يخرج من الصندوق.";}
}
async function submitMerchantPay(e){
  e.preventDefault();const merchantId=document.getElementById("mp-merchant").value,merchant=merchants.find(m=>m.id===merchantId);if(!merchant)return toast("اختر التاجر أولاً",true);const payType=document.querySelector('input[name="mp-type"]:checked')?.value;if(!payType)return toast("اختر نوع الحركة",true);const amount=Number(document.getElementById("mp-amount").value);if(!amount||amount<=0)return toast("أدخل مبلغاً صحيحاً",true);const date=document.getElementById("mp-date").value;if(!date)return toast("اختر التاريخ",true);const isCash=document.getElementById("mp-cash").checked,desc=document.getElementById("mp-desc").value.trim(),autoDesc=desc||(payType==="in"?`دفعة من ${merchant.name}`:`إضافة لحساب ${merchant.name}`),btn=document.getElementById("mp-submit");setBusy(btn,true,"حفظ الدفعة");
  try{
    const finId=await nextFinId(),batch=writeBatch(db);
    batch.set(doc(collection(db,"finance_transactions")),{type:"merchant",dir:payType,amount,date,description:autoDesc,merchantId,merchantName:merchant.name,partyName:merchant.name,employeeId:"",employeeName:"",finId,_active:true,sourcePage:"المالية",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    if(isCash)batch.set(doc(collection(db,"finance_transactions")),{type:payType==="in"?"deposit":"withdrawal",dir:payType==="in"?"in":"out",amount,date,description:`دفعة تاجر (${merchant.name}) — ${autoDesc}`,partyName:merchant.name,merchantId:"",merchantName:"",employeeId:"",employeeName:"",finId,_active:true,sourcePage:"المالية",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await batch.commit();await writeAudit("إضافة","دفعة تاجر",`${merchant.name} — ${payType==="in"?"تسديد مستحقات":"زيادة دين"} — ${amount} ج.م${isCash?" (نقدي)":""}`);closeModal("merchant-pay-modal");toast("تم الحفظ — "+finId);
  }catch(err){console.error(err);toast("خطأ أثناء الحفظ",true);}finally{setBusy(btn,false,"حفظ الدفعة");}
}

/* ══════════════════════════════════════
   UI binding
══════════════════════════════════════ */
function bindUI(){
  if(uiBound)return;uiBound=true;bindModalShell();
  document.querySelectorAll("[data-fin-type]").forEach(b=>b.addEventListener("click",()=>openFinance(b.dataset.finType)));

  document.getElementById("sale-warehouse").addEventListener("change",()=>{saleLines.forEach(l=>l.productId="");renderSaleLines();updateSaleSummary();});
  document.getElementById("sale-merchant").addEventListener("change",updateSaleSummary);
  document.getElementById("sale-add-line").addEventListener("click",()=>{saleLines.push({id:++saleLineId,productId:"",qty:1,price:0});renderSaleLines();});
  document.querySelectorAll("[data-sale-pay]").forEach(c=>c.addEventListener("click",()=>{c.querySelector("input").checked=true;updateSalePayStyle();}));
  document.getElementById("sale-form").addEventListener("submit",submitSale);

  document.getElementById("prod-from-wh").addEventListener("change",()=>{prodInputs.forEach(l=>l.productId="");renderProdLines("input");});
  document.getElementById("prod-to-wh").addEventListener("change",()=>{prodOutputs.forEach(l=>l.productId="");renderProdLines("output");});
  document.getElementById("prod-add-input").addEventListener("click",()=>{prodInputs.push({id:++prodLineId,productId:"",qty:1});renderProdLines("input");});
  document.getElementById("prod-add-output").addEventListener("click",()=>{prodOutputs.push({id:++prodLineId,productId:"",qty:1});renderProdLines("output");});
  document.getElementById("production-form").addEventListener("submit",submitProduction);

  document.getElementById("trans-from-wh").addEventListener("change",refreshTransferProducts);document.getElementById("trans-to-wh").addEventListener("change",refreshTransferProducts);document.getElementById("transfer-form").addEventListener("submit",submitTransfer);

  document.querySelectorAll("[data-adj-type]").forEach(b=>b.addEventListener("click",()=>{adjustType=b.dataset.adjType;updateAdjustTypeUI();}));document.getElementById("adj-warehouse").addEventListener("change",refreshAdjustProducts);document.getElementById("adj-product").addEventListener("change",updateAdjustPreview);document.getElementById("adj-qty").addEventListener("input",updateAdjustPreview);document.getElementById("adjust-form").addEventListener("submit",submitAdjust);

  document.querySelectorAll("[data-product-mode]").forEach(b=>b.addEventListener("click",()=>setProductMode(b.dataset.productMode)));document.getElementById("product-existing").addEventListener("change",loadProductForEdit);document.getElementById("product-warehouse").addEventListener("change",()=>{if(productMode==="add")document.getElementById("product-serial").value=generateSerial(document.getElementById("product-warehouse").value);});document.getElementById("product-image").addEventListener("change",()=>{const f=document.getElementById("product-image").files[0];if(!f)return;pendingProductFile=f;const img=document.getElementById("product-image-preview");img.src=URL.createObjectURL(f);img.style.display="block";document.getElementById("product-image-text").textContent=f.name;});document.getElementById("product-form").addEventListener("submit",submitProduct);document.getElementById("warehouse-form").addEventListener("submit",submitWarehouse);

  document.querySelectorAll("[data-fin-dir]").forEach(c=>c.addEventListener("click",()=>{c.querySelector("input").checked=true;updateFinanceDirHint();}));document.getElementById("finance-form").addEventListener("submit",submitFinance);

  document.querySelectorAll("[data-mp-type]").forEach(c=>c.addEventListener("click",()=>{const type=c.dataset.mpType;c.querySelector("input").checked=true;if(type==="out")document.getElementById("mp-cash").checked=false;else document.getElementById("mp-cash").checked=true;updateMerchantPayStyle();}));document.getElementById("merchant-pay-form").addEventListener("submit",submitMerchantPay);
}

onAuthStateChanged(auth,user=>{
  if(!user){location.href="/index.html";return;}
  currentUser=user;renderNav(user);initSearchableSelects();bindUI();startData();document.getElementById("app").style.visibility="visible";hideLoader();
});
