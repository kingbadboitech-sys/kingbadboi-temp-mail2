/* ═══════════════════════════════════════════
   KingBadboi Tech TempMail — script.js v3
   Powered by mail.tm — real inbox, works on
   Instagram, TikTok, WhatsApp, Twitter, etc.
═══════════════════════════════════════════ */

const STATE = {
  email:    null,
  password: null,
  token:    null,
  countdown: 10,
  timer:    null,
  msgCount: 0,
  domains:  []
};

/* ── DOM ── */
const modal      = document.getElementById('followModal');
const emailText  = document.getElementById('emailText');
const statusDot  = document.getElementById('statusDot');
const statusTxt  = document.getElementById('statusTxt');
const inboxList  = document.getElementById('inboxList');
const domainSel  = document.getElementById('domainSelect');
const cdEl       = document.getElementById('countdown');
const toast      = document.getElementById('toast');
const badge      = document.getElementById('inboxBadge');

/* ── MODAL ── */
document.getElementById('btnFollowNow').addEventListener('click', () => {
  window.open('https://whatsapp.com/channel/0029Vb7ivq9HLHQcS4XgQu2Q', '_blank');
  setTimeout(closeModal, 1500);
});
document.getElementById('btnEnterAnyway').addEventListener('click', closeModal);
function closeModal() {
  modal.style.opacity = '0';
  modal.style.transition = 'opacity 0.3s';
  setTimeout(() => { modal.style.display = 'none'; }, 300);
}

/* ── LOAD DOMAINS ON START ── */
async function loadDomains() {
  try {
    const res  = await fetch('/api/domains');
    const data = await res.json();
    if (data.success && data.domains.length) {
      STATE.domains = data.domains;
      domainSel.innerHTML = '';
      data.domains.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `@${d}`;
        domainSel.appendChild(opt);
      });
    }
  } catch(e) {
    console.error('Domain load failed', e);
  }
}
loadDomains();

/* ── GENERATE EMAIL ── */
async function generateEmail() {
  setLoading('btnGenerate', true, '⚡ Generate');
  stopTimer();
  STATE.token = null;
  STATE.email = null;

  emailText.textContent = 'Creating mailbox...';
  emailText.className   = 'placeholder';
  setStatus('idle', 'Setting up your mailbox...');

  // Random username + strong random password
  const user     = 'kbb' + Math.random().toString(36).slice(2, 9);
  const domain   = domainSel.value;
  const address  = `${user}@${domain}`;
  const password = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  try {
    // Step 1: create account
    const createRes  = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ address, password })
    });
    const createData = await createRes.json();
    if (!createData.success) throw new Error(createData.message || 'Account creation failed');

    // Step 2: get token
    const tokenRes  = await fetch('/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ address, password })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.success) throw new Error('Login failed');

    STATE.email    = address;
    STATE.password = password;
    STATE.token    = tokenData.token;
    STATE.msgCount = 0;

    emailText.textContent = STATE.email;
    emailText.className   = '';
    setStatus('online', 'Mailbox ready — use this email anywhere!');
    renderEmpty('USE THIS EMAIL ON ANY SITE — MAIL ARRIVES HERE AUTOMATICALLY');
    if (badge) badge.textContent = '0';
    startTimer();
    showToast('✅ Real mailbox ready! Works on Instagram, TikTok, Google & more.');
  } catch(err) {
    emailText.textContent = '⚠ Failed — tap retry';
    emailText.className   = 'placeholder';
    setStatus('offline', 'Error: ' + err.message);
    showToast('❌ ' + err.message + ' — try again!');
  } finally {
    setLoading('btnGenerate', false, '⚡ Generate');
  }
}

/* ── COPY ── */
function copyEmail() {
  if (!STATE.email) return showToast('⚠ Generate an email first!');
  try { navigator.clipboard.writeText(STATE.email); } catch(e) {
    const t = document.createElement('textarea');
    t.value = STATE.email;
    document.body.appendChild(t); t.select();
    document.execCommand('copy'); document.body.removeChild(t);
  }
  showToast('📋 Email copied! Paste it on any signup form.');
}

/* ── FETCH INBOX ── */
async function fetchInbox(silent = false) {
  if (!STATE.token) return;
  if (!silent) setLoading('btnRefresh', true, '🔄 Refresh');

  try {
    const res  = await fetch(`/api/inbox?token=${encodeURIComponent(STATE.token)}`);
    const data = await res.json();

    if (!data.success) {
      // Token may have expired — try to re-login
      if (!silent) showToast('⚠ Session expired. Regenerate email.');
      return;
    }

    const msgs = data.messages || [];
    if (badge) badge.textContent = msgs.length;

    if (msgs.length === 0) {
      if (!silent) showToast('📭 No messages yet. Send an email to your address!');
      if (STATE.msgCount === 0) renderEmpty('WAITING FOR MAIL... AUTO-CHECKING EVERY 10s');
      return;
    }

    if (msgs.length !== STATE.msgCount) {
      STATE.msgCount = msgs.length;
      showToast(`📨 ${msgs.length} message(s) in inbox!`);
    }

    setStatus('online', `${msgs.length} message(s) received`);
    renderInbox(msgs);
  } catch(e) {
    if (!silent) showToast('❌ Inbox check failed.');
  } finally {
    if (!silent) setLoading('btnRefresh', false, '🔄 Refresh');
  }
}

/* ── OPEN FULL MESSAGE ── */
async function openMessage(id, el) {
  if (el.dataset.loaded) {
    el.classList.toggle('open');
    return;
  }
  if (!STATE.token) return;

  el.innerHTML = '<div style="padding:20px;text-align:center"><span class="spinner"></span> Loading...</div>';
  el.classList.add('open');

  try {
    const res  = await fetch(`/api/message/${id}?token=${encodeURIComponent(STATE.token)}`);
    const data = await res.json();
    if (!data.success) { el.innerHTML = '<div style="padding:16px;color:var(--accent2)">Failed to load message.</div>'; return; }

    const msg      = data.message;
    const htmlBody = msg.html && msg.html[0] ? msg.html[0] : null;
    const textBody = msg.text || '';
    const rawBody  = htmlBody || textBody || '(No content)';

    // OTP detection — covers 4-8 digit codes, spaced, dashed
    const searchIn = (msg.subject || '') + ' ' + textBody;
    const otpMatch = searchIn.match(/\b(\d[\d \-]{2,7}\d)\b/);
    const otp      = otpMatch ? otpMatch[1].replace(/[\s\-]/g, '') : null;

    // Verification link detection
    const linkRx   = /href=["'](https?:\/\/[^"']{15,}(?:verif|confirm|activate|token|auth|click|validate|account)[^"']*?)["']/i;
    const linkMatch = rawBody.match(linkRx);
    const vLink    = linkMatch ? linkMatch[1] : null;

    let html = '';

    if (otp) {
      html += `
        <div class="otp-highlight">
          <div class="otp-label">// VERIFICATION CODE DETECTED</div>
          <div class="otp-code" onclick="copyOtp('${otp}')" title="Tap to copy">
            ${otp} <span style="font-size:13px;opacity:0.5">📋 tap to copy</span>
          </div>
        </div>`;
    }

    if (vLink) {
      html += `
        <div class="verify-link-box">
          <div class="otp-label">// VERIFICATION LINK FOUND</div>
          <a href="${escAttr(vLink)}" target="_blank" rel="noopener noreferrer" class="btn-verify-link">
            🔗 CLICK HERE TO VERIFY / CONFIRM ACCOUNT
          </a>
        </div>`;
    }

    if (htmlBody) {
      // Render HTML email in sandboxed iframe
      html += `<div class="email-body-wrap">
        <iframe class="email-frame"
          srcdoc="${escAttr(htmlBody)}"
          sandbox="allow-same-origin allow-popups"
          onload="iframeHeight(this)">
        </iframe>
      </div>`;
    } else {
      html += `<div class="email-body-wrap"><pre class="email-text">${escHtml(textBody || '(Empty)')}</pre></div>`;
    }

    el.innerHTML   = html;
    el.dataset.loaded = '1';
  } catch(e) {
    el.innerHTML = '<div style="padding:16px;color:var(--accent2)">Error loading message.</div>';
  }
}

function iframeHeight(iframe) {
  try { iframe.style.height = (iframe.contentDocument.body.scrollHeight + 30) + 'px'; }
  catch(e) { iframe.style.height = '320px'; }
}

/* ── RENDER INBOX ── */
function renderInbox(msgs) {
  inboxList.innerHTML = '';
  msgs.forEach((msg, i) => {
    const from    = msg.from?.address || msg.from?.name || 'Unknown';
    const subject = msg.subject || '(No Subject)';
    const time    = msg.createdAt || '';
    const isNew   = !msg.seen;

    const item = document.createElement('div');
    item.className = 'message-item' + (isNew ? ' msg-new' : '');
    item.innerHTML = `
      <div class="message-header" onclick="toggleMsg(${i}, '${msg.id}')">
        <div class="msg-meta">
          <div class="message-from">📧 ${escHtml(from)}</div>
          <div class="message-subject">${isNew ? '<span class="new-dot">NEW</span> ' : ''}${escHtml(subject)}</div>
        </div>
        <div class="msg-right">
          <span class="message-time">${formatTime(time)}</span>
          <span class="toggle-arrow" id="arrow-${i}">▼</span>
        </div>
      </div>
      <div class="message-body" id="msg-${i}"></div>
    `;
    inboxList.appendChild(item);
  });
}

function toggleMsg(i, id) {
  const body  = document.getElementById(`msg-${i}`);
  const arrow = document.getElementById(`arrow-${i}`);
  const open  = body.classList.toggle('open');
  if (arrow) arrow.textContent = open ? '▲' : '▼';
  if (open)  openMessage(id, body);
}

function copyOtp(code) {
  try { navigator.clipboard.writeText(code); } catch(e) {}
  showToast(`📋 Code ${code} copied to clipboard!`);
}

function renderEmpty(msg) {
  inboxList.innerHTML = `
    <div class="inbox-empty">
      <span class="empty-icon">📭</span>
      ${msg || 'INBOX IS EMPTY'}
    </div>`;
}

/* ── TIMER ── */
function startTimer() {
  stopTimer();
  STATE.countdown = 10;
  updateCd();
  STATE.timer = setInterval(() => {
    STATE.countdown--;
    updateCd();
    if (STATE.countdown <= 0) {
      fetchInbox(true);
      STATE.countdown = 10;
    }
  }, 1000);
}
function stopTimer() { clearInterval(STATE.timer); STATE.countdown = 10; updateCd(); }
function updateCd()  { if (cdEl) cdEl.textContent = STATE.countdown; }

/* ── STATUS ── */
function setStatus(type, msg) {
  statusDot.className = 'status-dot ' + (type || '');
  statusTxt.textContent = msg || 'Standby';
}

/* ── LOADING ── */
function setLoading(id, on, label) {
  const b = document.getElementById(id);
  if (!b) return;
  b.disabled  = on;
  b.innerHTML = on ? '<span class="spinner"></span>' : label;
}

/* ── TOAST ── */
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 4500);
}

/* ── UTILS ── */
function escHtml(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s)  { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    return d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return ts; }
}

/* ── WIRE UP ── */
document.getElementById('btnGenerate').addEventListener('click', generateEmail);
document.getElementById('btnCopy').addEventListener('click', copyEmail);
document.getElementById('btnRefresh').addEventListener('click', () => fetchInbox(false));
