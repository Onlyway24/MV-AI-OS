/**
 * ONLYWAY Premium Command Center Experience.
 *
 * This is the canonical presentation layer for the local Command Center. It is
 * deliberately isolated from domain state: every value, status, gate and
 * permission continues to come from the existing read models and boundaries.
 */
export const COMMAND_CENTER_PREMIUM_CSS = `
:root{
  color-scheme:dark;
  --ow-canvas:#030305;
  --ow-canvas-soft:#09070b;
  --ow-surface-primary:rgba(14,12,17,.86);
  --ow-surface-decision:rgba(22,17,25,.9);
  --ow-surface-operational:rgba(11,15,22,.82);
  --ow-surface-evidence:rgba(16,15,18,.72);
  --ow-surface-warning:rgba(47,29,13,.72);
  --ow-surface-glass:rgba(14,12,17,.68);
  --ow-text-primary:#f7f3ee;
  --ow-text-secondary:#bbb5bd;
  --ow-text-tertiary:#938c97;
  --ow-gold:#d9b77f;
  --ow-gold-bright:#f0d69d;
  --ow-chrome:#d8d3dd;
  --ow-violet:#9b68d2;
  --ow-cobalt:#7899f2;
  --ow-success:#73d292;
  --ow-warning:#efb85f;
  --ow-danger:#f0787d;
  --ow-bronze-dark:var(--ow-text-tertiary);
  --ow-bronze:var(--ow-gold);
  --ow-gold-light:var(--ow-gold-bright);
  --ow-chrome-dark:var(--ow-text-tertiary);
  --ow-chrome:var(--ow-text-secondary);
  --ow-chrome-bright:var(--ow-chrome);
  --ow-chrome-white:var(--ow-text-primary);
  --ow-muted:var(--ow-text-tertiary);
  --ow-ivory:var(--ow-text-primary);
  --ow-line:rgba(238,230,240,.12);
  --ow-line-strong:rgba(222,188,128,.3);
  --ow-glow:0 24px 72px rgba(0,0,0,.42);
  --ow-glow-decision:0 28px 90px rgba(36,15,49,.34),inset 0 1px 0 rgba(255,255,255,.06);
  --ow-blur:24px;
  --ow-space-1:4px;
  --ow-space-2:8px;
  --ow-space-3:12px;
  --ow-space-4:16px;
  --ow-space-5:20px;
  --ow-space-6:24px;
  --ow-space-8:32px;
  --ow-space-10:40px;
  --ow-space-12:48px;
  --ow-space-16:64px;
  --ow-radius-sm:10px;
  --ow-radius-md:16px;
  --ow-radius-lg:24px;
  --ow-radius-xl:32px;
  --ow-type-display:clamp(2.8rem,5vw,5.8rem);
  --ow-type-page:clamp(2rem,3vw,3.5rem);
  --ow-type-section:clamp(1.45rem,2vw,2.15rem);
  --ow-type-card:1.05rem;
  --ow-type-body:.875rem;
  --ow-type-meta:.72rem;
  --ow-type-label:.625rem;
  --ow-type-numeric:clamp(1.65rem,2.6vw,2.7rem);
  --ow-leading-tight:1.02;
  --ow-leading-body:1.58;
  --ow-z-world:-1;
  --ow-z-content:1;
  --ow-z-sidebar:80;
  --ow-z-overlay:90;
  --ow-z-dialog:100;
  --ow-motion-fast:140ms;
  --ow-motion-standard:260ms;
  --ow-motion-slow:420ms;
  --ow-ease:cubic-bezier(.2,.75,.25,1);
  --ow-focus:0 0 0 2px var(--ow-canvas),0 0 0 5px var(--ow-gold-bright),0 0 28px rgba(120,153,242,.38);
  --ow-sidebar-expanded:272px;
  --ow-sidebar-compact:88px;
  --cc-bg:var(--ow-canvas);
  --cc-surface:var(--ow-surface-primary);
  --cc-elevated:var(--ow-surface-decision);
  --cc-gold:var(--ow-gold);
  --cc-bright:var(--ow-gold-bright);
  --cc-ivory:var(--ow-text-primary);
  --cc-muted:var(--ow-text-secondary);
  --cc-border:var(--ow-line-strong);
  --cc-line:var(--ow-line);
  --cc-success:var(--ow-success);
  --cc-danger:var(--ow-danger);
  --cc-shadow:var(--ow-glow);
  --focus-bg:var(--ow-canvas);
  --focus-surface:var(--ow-surface-primary);
  --focus-surface-2:var(--ow-surface-evidence);
  --focus-text:var(--ow-text-primary);
  --focus-secondary:var(--ow-text-secondary);
  --focus-line:var(--ow-line);
}

html{
  background:var(--ow-canvas);
  scroll-behavior:smooth;
}
body{
  background:var(--ow-canvas);
  color:var(--ow-text-primary);
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;
  font-size:var(--ow-type-body);
  line-height:var(--ow-leading-body);
  margin:0;
  overflow:hidden;
}
button,input,select,textarea{font:inherit}
button,a,select,input,textarea,summary{-webkit-tap-highlight-color:transparent}
:where(a,button,input,select,textarea,summary,[tabindex]):focus{outline:none}
:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{
  border-radius:max(6px,inherit);
  box-shadow:var(--ow-focus)!important;
  outline:0!important;
  position:relative;
  z-index:2;
}
[hidden]{display:none!important}

.cc-app{
  display:grid;
  grid-template-columns:var(--ow-sidebar-expanded) minmax(0,1fr);
  height:100dvh;
  isolation:isolate;
  min-height:100dvh;
  overflow:hidden;
  position:relative;
  transition:grid-template-columns var(--ow-motion-standard) var(--ow-ease);
}
.cc-app[data-sidebar-state="compact"]{grid-template-columns:var(--ow-sidebar-compact) minmax(0,1fr)}
.cc-world{
  inset:0;
  opacity:1!important;
  overflow:hidden;
  pointer-events:none;
  position:fixed;
  transform:none!important;
  z-index:var(--ow-z-world);
}
.cc-world-image{
  background-image:url("/assets/brand/onlyway-obsidian-chrome-original.png")!important;
  background-position:68% 45%;
  background-repeat:no-repeat;
  background-size:min(88vw,1450px) auto;
  filter:brightness(.58) contrast(1.05) saturate(.92)!important;
  inset:-3%;
  opacity:.8!important;
  position:absolute;
  transform:translate3d(var(--cc-parallax-x,0),calc(var(--cc-parallax-y,0) + var(--cc-scroll-shift,0)),0);
  transition:transform var(--ow-motion-slow) var(--ow-ease);
}
.cc-world-vignette{
  background:
    linear-gradient(90deg,rgba(3,3,5,.98) 0%,rgba(3,3,5,.83) 25%,rgba(3,3,5,.5) 58%,rgba(3,3,5,.78) 100%),
    linear-gradient(180deg,rgba(3,3,5,.42),rgba(3,3,5,.82));
  inset:0;
  position:absolute;
}
.cc-world-light{
  animation:none!important;
  background:radial-gradient(circle at 73% 20%,rgba(155,104,210,.11),transparent 32%),radial-gradient(circle at 76% 72%,rgba(120,153,242,.09),transparent 35%);
  inset:0;
  opacity:1;
  position:absolute;
  transform:none!important;
}

.cc-sidebar{
  align-self:stretch;
  backdrop-filter:blur(var(--ow-blur)) saturate(125%);
  background:linear-gradient(180deg,rgba(7,6,9,.92),rgba(6,5,8,.8));
  border:0;
  border-right:1px solid var(--ow-line);
  box-shadow:18px 0 68px rgba(0,0,0,.18);
  display:flex;
  flex-direction:column;
  grid-column:1;
  height:100dvh;
  min-width:0;
  overflow:hidden;
  padding:var(--ow-space-6) var(--ow-space-4) var(--ow-space-4);
  position:relative;
  top:auto;
  width:auto;
  z-index:var(--ow-z-sidebar);
}
.cc-sidebar-head{align-items:center;display:flex;gap:var(--ow-space-2);min-height:52px}
.cc-brand{
  align-items:center;
  display:flex;
  gap:var(--ow-space-3);
  margin:0;
  min-width:0;
  padding:var(--ow-space-1);
  text-decoration:none;
}
.cc-brand-mark,.cc-mobile-brand span{
  animation:none!important;
  background:linear-gradient(145deg,rgba(240,214,157,.2),rgba(18,14,22,.9) 52%,rgba(120,153,242,.14));
  border:1px solid rgba(240,214,157,.42);
  border-radius:13px;
  box-shadow:inset 0 1px rgba(255,255,255,.13),0 8px 26px rgba(0,0,0,.3);
  color:var(--ow-gold-bright);
  display:grid;
  flex:0 0 42px;
  font-family:Georgia,"Times New Roman",serif;
  font-size:.7rem;
  height:42px;
  letter-spacing:.08em;
  place-items:center;
  width:42px;
}
.cc-brand-copy{min-width:0}
.cc-brand b{
  background:none;
  color:var(--ow-text-primary);
  font-family:inherit;
  font-size:.88rem;
  font-weight:650;
  letter-spacing:.02em;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.cc-brand small{color:var(--ow-text-tertiary);font-size:.58rem;letter-spacing:.13em;text-transform:uppercase}
.cc-sidebar-toggle{
  background:rgba(255,255,255,.04);
  border:1px solid var(--ow-line);
  border-radius:12px;
  color:var(--ow-text-secondary);
  cursor:pointer;
  display:grid;
  flex:0 0 44px;
  height:44px;
  margin-left:auto;
  place-items:center;
  transition:background var(--ow-motion-fast) ease,border-color var(--ow-motion-fast) ease,color var(--ow-motion-fast) ease;
  width:44px;
}
.cc-sidebar-toggle:hover{background:rgba(255,255,255,.08);border-color:var(--ow-line-strong);color:var(--ow-text-primary)}
.cc-nav{
  align-self:stretch;
  display:grid;
  gap:var(--ow-space-2);
  grid-template-columns:minmax(0,1fr);
  justify-self:stretch;
  margin-top:var(--ow-space-10);
  min-width:0;
  overflow:visible;
  padding:0;
  position:static;
  width:100%;
}
.cc-nav a,.cc-app[data-sidebar-state="compact"] .cc-nav a{
  align-items:center;
  background:transparent;
  border:1px solid transparent;
  border-radius:14px;
  color:var(--ow-text-secondary);
  display:grid;
  font-size:.78rem;
  gap:var(--ow-space-3);
  grid-template-columns:30px minmax(0,1fr);
  min-height:48px;
  padding:var(--ow-space-2) var(--ow-space-3);
  text-decoration:none;
  transition:background var(--ow-motion-fast) ease,border-color var(--ow-motion-fast) ease,color var(--ow-motion-fast) ease;
  white-space:nowrap;
}
.cc-nav a:before{display:none}
.cc-nav a:hover{background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.06);color:var(--ow-text-primary)}
.cc-nav a.is-active{
  background:linear-gradient(96deg,rgba(217,183,127,.16),rgba(155,104,210,.1));
  border-color:rgba(217,183,127,.2);
  color:var(--ow-text-primary);
}
.cc-nav-icon{color:var(--ow-gold);font-size:.78rem;text-align:center}
.cc-nav-label{display:block;font-size:.78rem}
.cc-sidebar-foot{
  align-items:center;
  border:0;
  color:var(--ow-text-tertiary);
  display:flex;
  font-size:.67rem;
  gap:var(--ow-space-3);
  margin-top:auto;
  min-height:44px;
  padding:var(--ow-space-3);
}
.cc-live-dot{animation:none!important;flex:0 0 auto}
.cc-operator{
  align-items:center;
  background:rgba(255,255,255,.035);
  border:1px solid var(--ow-line);
  border-radius:14px;
  display:flex;
  gap:var(--ow-space-3);
  margin-top:var(--ow-space-2);
  min-height:54px;
  padding:var(--ow-space-2) var(--ow-space-3);
}
.cc-avatar{flex:0 0 34px;height:34px;width:34px}
.cc-operator b{font-size:.72rem}.cc-operator small{font-size:.62rem}
.cc-app[data-sidebar-state="compact"] .cc-sidebar{padding-inline:14px}
.cc-app[data-sidebar-state="compact"] .cc-brand-copy,
.cc-app[data-sidebar-state="compact"] .cc-nav-label,
.cc-app[data-sidebar-state="compact"] .cc-sidebar-foot-label,
.cc-app[data-sidebar-state="compact"] .cc-operator>span:last-child{display:none}
.cc-app[data-sidebar-state="compact"] .cc-sidebar-head{display:grid;justify-items:center}
.cc-app[data-sidebar-state="compact"] .cc-brand{justify-content:center}
.cc-app[data-sidebar-state="compact"] .cc-sidebar-toggle{margin:var(--ow-space-2) auto 0}
.cc-app[data-sidebar-state="compact"] .cc-nav a{grid-template-columns:1fr;justify-items:center;padding-inline:var(--ow-space-2)}
.cc-app[data-sidebar-state="compact"] .cc-operator{justify-content:center;padding-inline:var(--ow-space-2)}
.cc-mobile-brand,.cc-mobile-menu{display:none}
.cc-sidebar-backdrop{display:none}

.cc-main{
  display:flex;
  flex-direction:column;
  grid-column:2;
  height:100dvh;
  margin:0;
  max-width:none;
  min-width:0;
  overflow-x:hidden;
  overflow-y:auto;
  padding:clamp(24px,3vw,48px) clamp(24px,4vw,72px) 96px;
  position:relative;
  scrollbar-color:rgba(217,183,127,.28) transparent;
  width:100%;
  z-index:var(--ow-z-content);
}
.cc-main>*{flex:0 0 auto;min-width:0}
.cc-topbar{order:0}
.cc-oracle-composer{order:1}
.cc-command-result{order:2}
.cc-command-help{order:3}
.cc-overview{order:4}
.cc-revenue-hero{order:5}
.cc-revenue-journey{order:6}
.cc-venture-today{order:7}
.cc-main>#approvals{order:8}
.cc-main>[data-primary-view]:not(.cc-overview):not(.cc-revenue-hero):not(.cc-revenue-journey):not(.cc-venture-today){order:10}
.cc-topbar{
  align-items:end;
  border:0;
  display:grid;
  gap:var(--ow-space-8);
  grid-template-columns:minmax(240px,.72fr) minmax(580px,1.28fr);
  padding:0 0 var(--ow-space-5);
}
.cc-command-title .cc-eyebrow{
  color:var(--ow-text-tertiary);
  font-family:inherit;
  font-size:var(--ow-type-label);
  font-weight:630;
  letter-spacing:.13em;
  text-transform:uppercase;
}
.cc-eyebrow span:first-child{color:var(--ow-gold)}
.cc-command-title h1,.cc-topbar h1{
  color:var(--ow-text-primary);
  font-family:inherit;
  font-size:clamp(2rem,3.2vw,3.25rem);
  font-weight:650;
  letter-spacing:-.052em;
  line-height:1;
  margin:var(--ow-space-3) 0 0;
}
.cc-topbar-subtitle{color:var(--ow-text-secondary);font-size:.78rem;margin:var(--ow-space-3) 0 0;max-width:42rem}
.cc-status-rail{
  align-items:stretch;
  backdrop-filter:blur(18px);
  background:rgba(8,8,11,.52);
  border:1px solid var(--ow-line);
  border-radius:16px;
  display:grid;
  gap:0;
  grid-template-columns:repeat(5,minmax(0,1fr));
  min-width:0;
  overflow:hidden;
}
.cc-status-rail span{
  background:transparent;
  border-left:1px solid var(--ow-line);
  color:var(--ow-text-tertiary);
  display:grid;
  font-size:.56rem;
  gap:2px;
  line-height:1.35;
  min-height:58px;
  min-width:0;
  padding:var(--ow-space-3);
}
.cc-status-rail span:first-child{border-left:0}
.cc-status-rail b{
  color:var(--ow-text-primary);
  display:block;
  font-size:.61rem;
  font-weight:620;
  letter-spacing:.02em;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.cc-status-rail .cc-lock{color:var(--ow-warning)}
.cc-status-dot{height:6px;margin-right:4px;width:6px}

.cc-command.cc-oracle-composer{
  align-items:start;
  backdrop-filter:blur(20px);
  background:linear-gradient(120deg,rgba(15,12,18,.78),rgba(8,10,16,.7));
  border:1px solid var(--ow-line);
  border-radius:20px;
  box-shadow:0 18px 52px rgba(0,0,0,.23);
  display:grid;
  gap:var(--ow-space-3);
  grid-template-columns:42px minmax(0,1fr) auto;
  margin:var(--ow-space-3) 0 0;
  padding:var(--ow-space-3);
  transition:border-color var(--ow-motion-fast) ease,box-shadow var(--ow-motion-fast) ease;
}
.cc-command.cc-oracle-composer:focus-within{border-color:var(--ow-line-strong);box-shadow:var(--ow-glow-decision)}
.cc-oracle-mark{
  background:linear-gradient(145deg,rgba(217,183,127,.2),rgba(120,153,242,.12));
  border:1px solid rgba(217,183,127,.28);
  border-radius:13px;
  color:var(--ow-gold-bright)!important;
  display:grid;
  font-size:.65rem!important;
  height:42px;
  letter-spacing:.08em;
  place-items:center;
  width:42px;
}
.cc-oracle-composer textarea{
  background:transparent;
  border:0;
  color:var(--ow-text-primary);
  min-height:42px;
  outline:0;
  padding:9px 0 4px;
  resize:none;
  width:100%;
}
.cc-oracle-composer textarea::placeholder{color:var(--ow-text-tertiary)}
.cc-oracle-composer kbd{align-self:center;border-color:var(--ow-line);border-radius:7px;color:var(--ow-text-tertiary);margin-right:var(--ow-space-2)}
.cc-oracle-controls{
  border-top:1px solid transparent;
  display:grid;
  gap:var(--ow-space-3);
  grid-column:1/-1;
  grid-template-columns:minmax(150px,.7fr) minmax(140px,.55fr) minmax(320px,1.5fr) auto;
  max-height:0;
  opacity:0;
  overflow:hidden;
  padding:0;
  pointer-events:none;
  transform:translateY(-4px);
  transition:max-height var(--ow-motion-standard) var(--ow-ease),opacity var(--ow-motion-fast) ease,padding var(--ow-motion-standard) var(--ow-ease),transform var(--ow-motion-standard) var(--ow-ease),border-color var(--ow-motion-standard) ease;
}
.cc-oracle-composer:focus-within .cc-oracle-controls{
  border-top-color:var(--ow-line);
  max-height:300px;
  opacity:1;
  overflow:visible;
  padding:var(--ow-space-4) 0 2px;
  pointer-events:auto;
  transform:none;
}
.cc-oracle-select{color:var(--ow-text-tertiary);font-size:.6rem;letter-spacing:.07em;text-transform:uppercase}
.cc-oracle-select select{
  background:rgba(255,255,255,.045);
  border:1px solid var(--ow-line);
  border-radius:11px;
  color:var(--ow-text-primary);
  display:block;
  margin-top:var(--ow-space-2);
  min-height:44px;
  padding:0 var(--ow-space-3);
  width:100%;
}
.cc-oracle-deliverables{border:0;display:flex;flex-wrap:wrap;gap:var(--ow-space-2);margin:0;padding:0}
.cc-oracle-deliverables legend{color:var(--ow-text-tertiary);font-size:.6rem;letter-spacing:.07em;margin-bottom:var(--ow-space-2);text-transform:uppercase;width:100%}
.cc-oracle-deliverables label{align-items:center;background:rgba(255,255,255,.035);border:1px solid var(--ow-line);border-radius:999px;color:var(--ow-text-secondary);display:flex;font-size:.61rem;gap:6px;min-height:44px;padding:4px 9px}
.cc-oracle-actions{align-items:end;display:flex;gap:var(--ow-space-2)}
.cc-oracle-actions button{border-radius:11px;min-height:44px;padding-inline:var(--ow-space-4);white-space:nowrap}
.cc-command-result{color:var(--ow-text-secondary);font-size:.68rem;margin:var(--ow-space-2) var(--ow-space-2) 0;min-height:18px}
.cc-command-help{color:var(--ow-text-tertiary);font-size:.62rem;line-height:1.45;margin:0 var(--ow-space-2)}

.cc-section,.cc-overview{margin-top:var(--ow-space-12)}
.cc-overview{display:flex;flex-direction:column}
.cc-overview-heading{order:0}
.cc-decision-inbox{order:1}
.cc-hero-grid{order:2}
.cc-metrics{order:3}
.cc-daily-console{order:4}
.cc-section-heading{align-items:end;display:flex;gap:var(--ow-space-6);justify-content:space-between;margin-bottom:var(--ow-space-5)}
.cc-section-heading h2,.cc-section-heading h3{
  color:var(--ow-text-primary);
  font-family:inherit;
  font-size:var(--ow-type-section);
  font-weight:630;
  letter-spacing:-.04em;
  line-height:1.08;
  margin:var(--ow-space-2) 0 0;
}
.cc-kicker,.cc-panel-label,.cc-brief-label{color:var(--ow-gold);font-size:var(--ow-type-label);font-weight:650;letter-spacing:.14em;text-transform:uppercase}
.cc-section-note,.cc-section-heading time{color:var(--ow-text-tertiary);font-size:var(--ow-type-meta)}
.cc-decision-inbox{
  backdrop-filter:blur(var(--ow-blur));
  background:
    radial-gradient(circle at 92% 0,rgba(120,153,242,.14),transparent 28%),
    linear-gradient(135deg,rgba(28,20,32,.9),rgba(12,11,16,.78));
  border:1px solid rgba(217,183,127,.25);
  border-radius:var(--ow-radius-xl);
  box-shadow:var(--ow-glow-decision);
  margin:0;
  min-height:220px;
  overflow:hidden;
  padding:clamp(24px,3vw,44px);
  position:relative;
}
.cc-daily-heading{align-items:end;display:flex;gap:var(--ow-space-5);justify-content:space-between}
.cc-daily-heading h3{font-family:inherit;font-size:clamp(1.4rem,2.4vw,2.4rem);font-weight:640;letter-spacing:-.04em;margin:6px 0 0}
.cc-decision-inbox-list{display:grid;gap:var(--ow-space-3);margin-top:var(--ow-space-6)}
.cc-decision-item{
  align-items:center;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.065);
  border-radius:var(--ow-radius-md);
  display:grid;
  gap:var(--ow-space-4);
  grid-template-columns:minmax(0,1fr) auto;
  min-height:72px;
  padding:var(--ow-space-4) var(--ow-space-5);
}
.cc-decision-item:hover{background:rgba(255,255,255,.055);transform:none!important}
.cc-hero-grid{display:grid;gap:var(--ow-space-4);grid-template-columns:minmax(260px,.7fr) minmax(360px,1.3fr);margin-top:var(--ow-space-5)}
.cc-system-core,.cc-brief{
  backdrop-filter:blur(18px);
  background:var(--ow-surface-glass);
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-lg);
  box-shadow:var(--ow-glow);
  min-height:280px;
}
.cc-system-core{background:radial-gradient(circle at center,rgba(217,183,127,.1),transparent 28%),rgba(9,8,12,.66)}
.cc-core-orbit,.cc-system-core:before,.cc-system-core:after{animation:none!important}
.cc-brief{padding:clamp(24px,3vw,42px)}
.cc-brief h2{font-family:inherit;font-weight:620;letter-spacing:-.035em}
.cc-brief strong{color:var(--ow-gold-bright);font-family:inherit;font-size:1.35rem;font-weight:610}
.cc-metrics{
  display:grid;
  gap:var(--ow-space-2);
  grid-template-columns:repeat(6,minmax(0,1fr));
  margin-top:var(--ow-space-4);
}
.cc-metric{
  background:rgba(8,8,11,.56);
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-md);
  min-height:112px;
  padding:var(--ow-space-4);
}
.cc-metric strong{font-family:inherit;font-size:var(--ow-type-numeric);font-weight:610;letter-spacing:-.04em}
.cc-metric .cc-metric-label,.cc-metric p{color:var(--ow-text-tertiary)}
.cc-daily-console{
  background:rgba(8,8,11,.52);
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-lg);
  margin-top:var(--ow-space-4);
  padding:var(--ow-space-6);
}

.cc-revenue-hero,.cc-tower-intro,.cc-agent-hero{
  backdrop-filter:blur(var(--ow-blur));
  background:
    radial-gradient(circle at 90% 12%,rgba(155,104,210,.16),transparent 34%),
    linear-gradient(135deg,rgba(13,11,17,.82),rgba(8,9,14,.75));
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-xl);
  box-shadow:var(--ow-glow);
  overflow:hidden;
}
.cc-revenue-hero{margin-top:var(--ow-space-5)}
.cc-revenue-copy h2,.cc-tower-copy h2,.cc-agent-hero h2{
  color:var(--ow-text-primary);
  font-family:inherit;
  font-size:clamp(2.35rem,4.6vw,5.2rem);
  font-weight:650;
  letter-spacing:-.06em;
  line-height:.94;
}
.cc-revenue-copy h2 em,.cc-tower-copy h2 em{color:var(--ow-gold-bright);font-family:Georgia,"Times New Roman",serif;font-weight:400}
.cc-revenue-pulse{background:rgba(5,6,10,.34);border-color:var(--ow-line)}
.cc-revenue-metrics article,.cc-readiness-card,.cc-revenue-stage,.cc-venture-today-grid>*,.cc-venture-card{
  background:rgba(255,255,255,.035);
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-md);
}
.cc-revenue-journey,.cc-venture-today,.cc-revenue-readiness{
  backdrop-filter:blur(18px);
  background:rgba(9,8,12,.62);
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-lg);
  box-shadow:none;
}

.cc-studio-switcher{
  align-items:center;
  backdrop-filter:blur(var(--ow-blur));
  background:rgba(10,9,13,.78);
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-lg);
  display:grid;
  gap:var(--ow-space-8);
  grid-template-columns:minmax(230px,.62fr) minmax(480px,1.38fr);
  margin-top:var(--ow-space-6);
  padding:var(--ow-space-6);
}
.cc-studio-switcher h2{font-family:inherit;font-size:1.7rem;font-weight:630;letter-spacing:-.04em;margin:var(--ow-space-2) 0}
.cc-studio-switcher p:not(.cc-kicker){color:var(--ow-text-secondary);font-size:.72rem;margin:0;max-width:38rem}
.cc-segmented-control{
  background:rgba(255,255,255,.035);
  border:1px solid var(--ow-line);
  border-radius:15px;
  display:grid;
  gap:4px;
  grid-template-columns:repeat(3,minmax(0,1fr));
  padding:4px;
}
.cc-segmented-control button,.cc-venture-tool-tabs button{
  background:transparent;
  border:1px solid transparent;
  border-radius:11px;
  color:var(--ow-text-secondary);
  cursor:pointer;
  min-height:44px;
  padding:8px 10px;
}
.cc-segmented-control button[aria-selected="true"],.cc-venture-tool-tabs button[aria-selected="true"]{
  background:rgba(217,183,127,.12);
  border-color:rgba(217,183,127,.19);
  color:var(--ow-text-primary);
}
.cc-production-layout,.cc-business-shell,.cc-vault-shell,.cc-agent-company-layout--apex{gap:var(--ow-space-5)}
.cc-preview,.cc-package-inspector,.cc-business-dossier,.cc-business-list,.cc-vault-gallery-panel,.cc-vault-detail,.cc-agent-roster,.cc-agent-dossier,.cc-workday-console{
  backdrop-filter:blur(18px);
  background:var(--ow-surface-primary);
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-lg);
  box-shadow:none;
}
.cc-production-card,.cc-reference-card,.cc-agent,.cc-control-button,.cc-modal-button{
  border-radius:var(--ow-radius-md);
  min-height:44px;
}
.cc-production-card:hover,.cc-production-card[aria-pressed="true"],.cc-reference-card:hover,.cc-control-button:hover,.cc-modal-button:hover{
  transform:none!important;
}
.cc-production-card[aria-pressed="true"],.cc-reference-card[aria-pressed="true"],.cc-agent[aria-pressed="true"]{
  border-color:var(--ow-line-strong);
  box-shadow:inset 3px 0 var(--ow-gold);
}
.cc-evidence-panel,.cc-runtime-console,.cc-runtime-jobs,.cc-governance,.cc-approval-panel,.cc-vault-intelligence,.cc-approval-review{
  backdrop-filter:blur(18px);
  background:var(--ow-surface-evidence);
  border:1px solid var(--ow-line);
  border-radius:var(--ow-radius-lg);
  box-shadow:none;
}
.cc-approval-panel,.cc-approval-review{
  background:
    radial-gradient(circle at 100% 0,rgba(120,153,242,.1),transparent 32%),
    var(--ow-surface-decision);
  border-color:rgba(217,183,127,.25);
}
.cc-approval-review{padding:clamp(20px,3vw,40px)}
.cc-approval-review-grid{gap:var(--ow-space-4)}
.cc-approval-review-code{background:rgba(0,0,0,.3);border:1px solid var(--ow-line);border-radius:var(--ow-radius-md);overflow-wrap:anywhere;padding:var(--ow-space-4)}
.cc-visual-review-canvases{gap:var(--ow-space-4)}
.cc-visual-canvas{background:rgba(0,0,0,.28);border:1px solid var(--ow-line);border-radius:var(--ow-radius-lg);overflow:hidden}
.cc-approval-gates>*{border-radius:999px}
.cc-tower-command{background:rgba(4,5,9,.38);border-color:var(--ow-line)}
.cc-tower-seal,.cc-agent-emblem,.cc-agent-dossier-emblem{animation:none!important}
.cc-agent-company-layout--apex .cc-agent{background:rgba(255,255,255,.035);border-color:var(--ow-line)}
.cc-agent-filters,.cc-vault-filters{gap:var(--ow-space-2)}
.cc-agent-filters button,.cc-vault-filters button,.cc-preview-nav button,.cc-text-action,.cc-revenue-download,.cc-primary-link{
  align-items:center;
  border-radius:11px;
  display:inline-flex;
  min-height:44px;
  padding:8px 12px;
}
.cc-oracle-deliverables label,
.cc-tiktok-motion-preview-head button,
.cc-visual-review-nav button{
  align-items:center;
  display:flex;
  min-height:44px!important;
}
.cc-vault-sequence summary{
  display:list-item!important;
  min-height:44px!important;
  padding-block:12px;
}
.cc-venture-today-head a{
  align-items:center;
  border-radius:11px;
  display:inline-flex;
  min-height:44px;
  padding:8px 12px;
}
.cc-agent-filters button,.cc-vault-filters button{background:rgba(255,255,255,.035);border:1px solid var(--ow-line);color:var(--ow-text-secondary)}
.cc-agent-filters button[aria-pressed="true"],.cc-vault-filters button[aria-pressed="true"]{background:rgba(217,183,127,.12);border-color:var(--ow-line-strong);color:var(--ow-text-primary)}
.cc-pipeline-node{background:rgba(255,255,255,.025);border-color:var(--ow-line)}
.cc-runtime-fill{transition:width var(--ow-motion-standard) var(--ow-ease)}
.cc-runtime-bar[data-tone="danger"] .cc-runtime-fill{background:var(--ow-danger)}

.cc-authorization{
  align-items:center;
  display:grid;
  inset:0;
  padding:var(--ow-space-4);
  place-items:center;
  position:fixed;
  z-index:var(--ow-z-dialog);
}
.cc-authorization-backdrop{background:rgba(1,1,3,.82);backdrop-filter:blur(16px);inset:0;position:absolute}
.cc-authorization-dialog{
  background:
    radial-gradient(circle at 92% 0,rgba(155,104,210,.14),transparent 30%),
    rgba(14,12,17,.96);
  border:1px solid var(--ow-line-strong);
  border-radius:var(--ow-radius-xl);
  box-shadow:0 38px 120px rgba(0,0,0,.72);
  max-height:min(760px,calc(100dvh - 32px));
  max-width:720px;
  overflow:auto;
  padding:clamp(24px,4vw,48px);
  position:relative;
  width:min(100%,720px);
}
.cc-authorization-dialog h2{font-family:inherit;font-size:2rem;font-weight:650;letter-spacing:-.04em}
.cc-authorization-details{background:rgba(0,0,0,.22);border:1px solid var(--ow-line);border-radius:var(--ow-radius-lg)}
.cc-authorization-actions{gap:var(--ow-space-3)}
.cc-modal-button{min-height:48px;padding-inline:var(--ow-space-5)}
.cc-authorization[data-confirmation-in-flight="true"] .cc-authorization-backdrop{cursor:progress}

.cc-brand-mark,.cc-core-orbit,.cc-world-light,.cc-tower-seal,.cc-agent-emblem,.cc-agent-dossier-emblem,
.cc-revenue-state:before,.cc-live-dot,.cc-status-dot,.cc-runtime-fill,.cc-system-core:before,.cc-system-core:after{
  animation:none!important;
}
.cc-app[data-runtime-activity] .cc-core-orbit,
.cc-app[data-runtime-activity] .cc-system-core:before,
.cc-app .cc-control-button[data-action="APPROVE_CONTENT"],
.cc-app .cc-modal-button--approve{animation:none!important}

@media (max-width:1280px){
  .cc-topbar{grid-template-columns:1fr}
  .cc-status-rail{grid-template-columns:repeat(5,minmax(115px,1fr))}
  .cc-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
  .cc-oracle-controls{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-oracle-deliverables{grid-column:1/-1}
  .cc-oracle-actions{justify-content:flex-end}
  .cc-studio-switcher{grid-template-columns:1fr}
}

@media (max-width:1100px) and (min-width:821px){
  :root{--ow-sidebar-expanded:232px}
  .cc-main{padding-inline:var(--ow-space-6)}
  .cc-hero-grid{grid-template-columns:1fr}
  .cc-system-core{display:none}
  .cc-revenue-copy h2,.cc-tower-copy h2,.cc-agent-hero h2{font-size:3.8rem}
  .cc-status-rail{overflow-x:auto}
}

@media (max-width:820px){
  html{scroll-behavior:auto}
  body{overflow-x:hidden;overflow-y:auto;padding-bottom:0!important}
  .cc-app,.cc-app[data-sidebar-state="compact"]{
    display:block;
    height:auto;
    min-height:100svh;
    overflow:visible;
  }
  .cc-world-image{
    background-position:64% 15%;
    background-size:auto min(92vh,820px);
    filter:brightness(.5) contrast(1.05) saturate(.88);
    opacity:.72!important;
  }
  .cc-world-vignette{background:linear-gradient(180deg,rgba(3,3,5,.7),rgba(3,3,5,.92) 55%,rgba(3,3,5,.97))}
  .cc-mobile-brand{
    align-items:center;
    color:var(--ow-text-primary);
    display:flex;
    gap:var(--ow-space-2);
    left:var(--ow-space-4);
    min-height:48px;
    position:fixed;
    text-decoration:none;
    top:max(var(--ow-space-2),env(safe-area-inset-top));
    z-index:calc(var(--ow-z-sidebar) + 2);
  }
  .cc-mobile-brand span{flex-basis:34px;height:34px;width:34px}
  .cc-mobile-brand b{font-size:.75rem;letter-spacing:.01em}
  .cc-mobile-menu{
    align-content:center;
    background:rgba(10,9,13,.78);
    border:1px solid var(--ow-line);
    border-radius:13px;
    display:grid!important;
    gap:5px;
    height:48px;
    left:auto!important;
    padding:0 13px;
    position:fixed;
    right:var(--ow-space-4)!important;
    top:max(var(--ow-space-2),env(safe-area-inset-top));
    width:48px;
    z-index:calc(var(--ow-z-sidebar) + 2);
  }
  .cc-mobile-menu span{background:var(--ow-text-primary);border-radius:2px;display:block;height:1px;width:20px}
  .cc-app .cc-sidebar,.cc-app[data-sidebar-state="compact"] .cc-sidebar{
    background:rgba(7,6,9,.97);
    border:0;
    border-right:1px solid var(--ow-line);
    display:flex;
    height:100dvh!important;
    inset:0 auto 0 0;
    overflow-y:auto!important;
    padding:max(72px,calc(56px + env(safe-area-inset-top))) var(--ow-space-4) max(var(--ow-space-4),env(safe-area-inset-bottom));
    position:fixed!important;
    transform:translateX(-104%)!important;
    transition:transform var(--ow-motion-standard) var(--ow-ease)!important;
    width:min(86vw,340px)!important;
    z-index:calc(var(--ow-z-sidebar) + 1);
  }
  .cc-app[data-mobile-sidebar="open"] .cc-sidebar{transform:translateX(0)!important}
  .cc-sidebar-head{display:none!important}
  .cc-nav,.cc-app[data-sidebar-state="compact"] .cc-nav{
    background:transparent;
    border:0;
    border-radius:0;
    bottom:auto;
    box-shadow:none;
    display:grid;
    gap:var(--ow-space-2);
    grid-template-columns:1fr;
    left:auto;
    margin:0;
    max-width:none;
    padding:0;
    position:static!important;
    right:auto;
    width:auto!important;
  }
  .cc-nav a,.cc-app[data-sidebar-state="compact"] .cc-nav a{
    display:grid;
    gap:var(--ow-space-3);
    grid-template-columns:34px minmax(0,1fr);
    justify-items:start;
    min-height:52px;
    padding:var(--ow-space-2) var(--ow-space-3);
  }
  .cc-nav-label,.cc-app[data-sidebar-state="compact"] .cc-nav-label{display:block;font-size:.82rem}
  .cc-sidebar-foot{border-top:1px solid var(--ow-line);font-size:.67rem;margin-top:auto}
  .cc-sidebar-foot-label{display:block!important;font-size:.67rem}
  .cc-sidebar .cc-operator{display:flex}
  .cc-sidebar-backdrop{
    background:rgba(1,1,3,.72);
    backdrop-filter:blur(8px);
    inset:0;
    position:fixed;
    z-index:var(--ow-z-sidebar);
  }
  .cc-sidebar-backdrop:not([hidden]){display:block}
  .cc-main{
    display:flex;
    height:auto;
    min-height:100svh;
    overflow:visible;
    padding:max(84px,calc(68px + env(safe-area-inset-top))) var(--ow-space-4) 72px;
    width:100%;
  }
  .cc-topbar{display:block;padding-bottom:var(--ow-space-4)}
  .cc-command-title h1,.cc-topbar h1{font-size:clamp(2.2rem,11vw,3.4rem)}
  .cc-topbar-subtitle{font-size:.75rem}
  .cc-status-rail{
    display:flex;
    gap:0;
    margin-top:var(--ow-space-5);
    overflow-x:auto;
    overscroll-behavior-inline:contain;
    scroll-snap-type:x proximity;
  }
  .cc-status-rail span{border-left:1px solid var(--ow-line);flex:0 0 142px;scroll-snap-align:start}
  .cc-command.cc-oracle-composer{grid-template-columns:38px minmax(0,1fr)}
  .cc-oracle-composer .cc-oracle-mark{display:grid!important;grid-column:1;grid-row:1;height:38px;width:38px}
  .cc-oracle-composer textarea{grid-column:2;grid-row:1;min-width:0}
  .cc-oracle-composer kbd{display:none}
  .cc-oracle-controls{
    grid-column:1/-1;
    grid-template-columns:1fr;
  }
  .cc-oracle-composer:focus-within .cc-oracle-controls{max-height:680px}
  .cc-oracle-deliverables{grid-column:auto}
  .cc-oracle-actions{display:grid;grid-template-columns:1fr}
  .cc-oracle-actions button{width:100%}
  .cc-command-help{display:none}
  .cc-revenue-journey,.cc-venture-today{display:none!important}
  .cc-section,.cc-overview{margin-top:var(--ow-space-8)}
  .cc-section-heading,.cc-daily-heading{align-items:start;display:grid;gap:var(--ow-space-2)}
  .cc-decision-inbox{border-radius:var(--ow-radius-lg);min-height:0;padding:var(--ow-space-5)}
  .cc-decision-item{align-items:start;grid-template-columns:1fr}
  .cc-hero-grid{grid-template-columns:1fr}
  .cc-system-core{display:none}
  .cc-metrics{display:flex;overflow-x:auto;padding:2px 2px var(--ow-space-2);scroll-snap-type:x proximity}
  .cc-metric{flex:0 0 154px;scroll-snap-align:start}
  .cc-revenue-hero,.cc-tower-intro,.cc-agent-hero{border-radius:var(--ow-radius-lg)}
  .cc-revenue-copy,.cc-revenue-pulse{padding:var(--ow-space-6) var(--ow-space-5)}
  .cc-revenue-copy h2,.cc-tower-copy h2,.cc-agent-hero h2{font-size:clamp(2.3rem,12vw,4rem)}
  .cc-studio-switcher{align-items:start;border-radius:var(--ow-radius-lg);display:grid;grid-template-columns:1fr;padding:var(--ow-space-5)}
  .cc-segmented-control{grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
  .cc-production-layout,.cc-business-shell,.cc-vault-shell,.cc-agent-company-layout--apex,.cc-runtime-grid{grid-template-columns:minmax(0,1fr)}
  .cc-preview,.cc-package-inspector,.cc-vault-detail{position:static}
  .cc-agent-company-layout--apex .cc-agent-grid{display:grid;overflow:visible}
  .cc-agent-company-layout--apex .cc-agent{max-width:none;width:100%}
  .cc-authorization{padding:var(--ow-space-3)}
  .cc-authorization-dialog{border-radius:var(--ow-radius-lg);max-height:calc(100dvh - 24px);padding:var(--ow-space-5)}
  .cc-authorization-actions{display:grid;grid-template-columns:1fr}
  .cc-modal-button{width:100%}
}

@media (max-width:430px){
  .cc-main{padding-inline:var(--ow-space-3)}
  .cc-mobile-brand{left:var(--ow-space-3)}
  .cc-mobile-menu{right:var(--ow-space-3)!important}
  .cc-status-rail span{flex-basis:132px}
  .cc-command.cc-oracle-composer{padding:var(--ow-space-2)}
  .cc-oracle-deliverables label{border-radius:12px;width:100%}
  .cc-revenue-copy,.cc-revenue-pulse{padding:var(--ow-space-5) var(--ow-space-4)}
  .cc-daily-console{padding:var(--ow-space-4)}
  .cc-segmented-control{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-venture-tool-tabs{display:flex;overflow-x:auto}
  .cc-venture-tool-tabs button{flex:0 0 auto}
  .cc-agent-filters,.cc-vault-filters{flex-wrap:nowrap;overflow-x:auto}
  .cc-agent-filters button,.cc-vault-filters button{flex:0 0 auto}
}

@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto!important}
  *,*:before,*:after{
    animation:none!important;
    scroll-behavior:auto!important;
    transition-duration:.01ms!important;
    transition-delay:0ms!important;
  }
  .cc-world-image{transform:none!important}
}
`;
