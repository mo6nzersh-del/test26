(function(){
 "use strict";
 if(window.UIStability)return;
 const modalSelector=".modal-overlay.open,.dash-modal.open,.overlay.open,[id$='-modal'].open,[id$='-overlay'].open,[role='dialog'][aria-modal='true'],.mobile-menu.open,#mob-tab-overlay.open";
 const watchSelector=".modal-overlay,.dash-modal,.overlay,[id$='-modal'],[id$='-overlay'],[role='dialog'],.mobile-menu,#mob-tab-overlay";
 const scrollSelector=".modal-box,.dash-modal-box,.modal-body,.modal,.smart-options,.iss-options,.fin-search-options,.tx-period-tabs,.table-wrap,.stmt-modal-body,#cash-rpt-body,#wh-log-body,.records-list";
 const horizontalSelector=".table-wrap,.tx-period-tabs,.section-tabs,.wh-adj-table-wrap,.stmt-preview-stage";
 let ready=false,queued=false,printing=false,baselineBody="",baselineHtml="";
 const watched=new WeakSet();
 function visible(el){
  if(!el||!el.isConnected)return false;
  const s=getComputedStyle(el);
  if(s.display==="none"||s.visibility==="hidden")return false;
  return el.getClientRects().length>0;
 }
 function hasOpenModal(){return Array.from(document.querySelectorAll(modalSelector)).some(visible)}
 function isPrinting(){
  return printing||!!window.matchMedia?.("print").matches||
   Array.from(document.body?.classList||[]).some(name=>/print/i.test(name));
 }
 function recoverScroll(){
  if(!ready||isPrinting()||hasOpenModal())return false;
  const body=document.body,html=document.documentElement;
  if(!body||!html)return false;
  // Only repair an inline lock left behind by a closed dialog. Never change computed print/layout CSS.
  if(body.style.overflow==="hidden")body.style.overflow=baselineBody;
  if(html.style.overflow==="hidden")html.style.overflow=baselineHtml;
  return true;
 }
 function scheduleRecovery(){
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;recoverScroll()});
 }
 function markScrollRegions(root=document){
  if(root.matches?.(scrollSelector))root.classList.add("ui-scroll-region");
  if(root.matches?.(horizontalSelector))root.classList.add("ui-horizontal-scroll");
  root.querySelectorAll?.(scrollSelector).forEach(el=>el.classList.add("ui-scroll-region"));
  root.querySelectorAll?.(horizontalSelector).forEach(el=>el.classList.add("ui-horizontal-scroll"));
 }
 function init(){
  if(ready)return;ready=true;
  baselineBody=document.body.style.overflow==="hidden"?"":document.body.style.overflow;
  baselineHtml=document.documentElement.style.overflow==="hidden"?"":document.documentElement.style.overflow;
  markScrollRegions();
  const observer=new MutationObserver(records=>{
   for(const record of records){
    if(record.type==="attributes"){scheduleRecovery();continue}
    for(const node of record.addedNodes){
     if(node.nodeType!==1)continue;
     if(node.matches?.(watchSelector))watch(node);
     node.querySelectorAll?.(watchSelector).forEach(watch);
     // Mark only a scrollable subtree that actually contains a relevant region.
     if(node.matches?.(scrollSelector)||node.matches?.(horizontalSelector)||node.querySelector?.(scrollSelector))markScrollRegions(node);
    }
   }
  });
  function watch(el){
   if(watched.has(el))return;watched.add(el);
   observer.observe(el,{attributes:true,attributeFilter:["class","aria-hidden","aria-modal"]});
  }
  document.querySelectorAll(watchSelector).forEach(watch);
  observer.observe(document.body,{childList:true});
  observer.observe(document.body,{attributes:true,attributeFilter:["style"]});
  observer.observe(document.documentElement,{attributes:true,attributeFilter:["style"]});
  document.addEventListener("click",scheduleRecovery);
  document.addEventListener("keydown",e=>{if(e.key==="Escape")scheduleRecovery()});
  window.addEventListener("pageshow",scheduleRecovery);
  window.addEventListener("popstate",scheduleRecovery);
  window.addEventListener("pagehide",()=>{queued=false});
  window.addEventListener("beforeprint",()=>{printing=true});
  window.addEventListener("afterprint",()=>{printing=false;scheduleRecovery()});
  scheduleRecovery();
 }
 window.UIStability={recoverScroll,scheduleRecovery,markScrollRegions};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
