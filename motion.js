(()=>{"use strict";
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
/* spotlight: event delegation so dynamic blog cards work too */
const SEL=".service-card,.project-card,.skill-card,.post-card,.home-blog-card,.process__step,.result-card,.timeline__card,.edu-lang__card,.price-card,.pricing-card,.plan-card";
document.addEventListener("pointermove",e=>{const c=e.target.closest&&e.target.closest(SEL);if(!c)return;if(!c.classList.contains("spot"))c.classList.add("spot");const r=c.getBoundingClientRect();c.style.setProperty("--mx",e.clientX-r.left+"px");c.style.setProperty("--my",e.clientY-r.top+"px")},{passive:true});
/* ripple */
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest(".btn");if(!b||reduce)return;const r=b.getBoundingClientRect(),s=Math.max(r.width,r.height),o=document.createElement("span");o.className="rip";o.style.cssText=`width:${s}px;height:${s}px;left:${e.clientX-r.left-s/2}px;top:${e.clientY-r.top-s/2}px`;b.appendChild(o);setTimeout(()=>o.remove(),700)});
/* nav sliding pill */
const links=document.querySelector(".nav__links");
if(links&&!reduce){const pill=document.createElement("span");pill.className="nav__pill";links.prepend(pill);links.classList.add("has-pill");document.querySelector(".nav").classList.add("has-pill");
const items=()=>[...links.querySelectorAll(":scope > li > .nav__link")];
const move=a=>{if(!a||innerWidth<=900){pill.style.opacity="0";return}const li=a.parentElement;pill.style.left=li.offsetLeft-12+"px";pill.style.width=li.offsetWidth+24+"px";pill.style.top=li.offsetTop+a.offsetTop-4+"px";pill.style.height=a.offsetHeight+8+"px";pill.style.opacity="1"};
const active=()=>items().find(a=>a.classList.contains("is-active"));
const rest=()=>move(active());
items().forEach(a=>a.addEventListener("mouseenter",()=>move(a)));
links.addEventListener("mouseleave",rest);
links.addEventListener("focusin",e=>{const a=e.target.closest(".nav__link");if(a)move(a)});
let lastA=null;const mo=new MutationObserver(()=>{const a=active();if(a!==lastA){lastA=a;rest()}});items().forEach(a=>mo.observe(a,{attributes:true,attributeFilter:["class"]}));
addEventListener("resize",rest);addEventListener("load",rest);document.fonts&&document.fonts.ready.then(rest);rest()}
/* aurora orbs behind heroes */
if(!reduce)document.querySelectorAll(".hero,.page-hero,.blog-hero").forEach(h=>{if(h.querySelector(".orb-field"))return;const f=document.createElement("div");f.className="orb-field";f.setAttribute("aria-hidden","true");f.innerHTML='<span class="orb orb--accent" style="width:340px;height:340px;top:-90px;right:-60px"></span><span class="orb orb--gold" style="width:280px;height:280px;bottom:-100px;left:8%"></span>';h.prepend(f)});
})();
