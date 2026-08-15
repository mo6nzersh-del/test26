import{
  h as redirectIfAuthenticated,
  i as signInWithEmailAndPassword,
  j as auth,
  d as db,
  c as collection,
  q as query,
  w as where,
  g as getDocs
}from"./auth-guard-DMMO1gWE.js?v=blocked2";
import{signOut}from"https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const BASE="/";
redirectIfAuthenticated("dashboard.html");

const form=document.getElementById("login-form");
const errorBox=document.getElementById("error-msg");
const loginBtn=document.getElementById("login-btn");

function showError(message){
  errorBox.textContent=message;
  errorBox.style.display="block";
}
function authMessage(code){
  switch(code){
    case"auth/invalid-email":return"البريد الإلكتروني غير صحيح";
    case"auth/user-not-found":
    case"auth/wrong-password":
    case"auth/invalid-credential":return"البريد الإلكتروني أو كلمة المرور غير صحيحة";
    case"auth/too-many-requests":return"تم تجاوز عدد المحاولات، حاول لاحقاً";
    default:return"حدث خطأ أثناء تسجيل الدخول";
  }
}
async function isBlocked(email){
  const normalized=String(email||"").trim().toLowerCase();
  const snap=await getDocs(query(
    collection(db,"blockedUsers"),
    where("email","==",normalized)
  ));
  return !snap.empty;
}

form.addEventListener("submit",async event=>{
  event.preventDefault();
  errorBox.style.display="none";
  const email=document.getElementById("email").value.trim();
  const password=document.getElementById("password").value;
  loginBtn.disabled=true;
  loginBtn.innerHTML='<span class="spinner"></span>';

  try{
    await signInWithEmailAndPassword(auth,email,password);
    if(await isBlocked(email)){
      await signOut(auth);
      showError("هذا الحساب محذوف ولا يملك صلاحية الدخول إلى النظام");
      loginBtn.disabled=false;
      loginBtn.textContent="دخول";
      return;
    }
    window.location.href=`${BASE}dashboard.html`;
  }catch(err){
    console.error(err);
    showError(authMessage(err?.code));
    loginBtn.disabled=false;
    loginBtn.textContent="دخول";
  }
});
