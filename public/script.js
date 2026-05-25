/* ═══════════════════════════════════════════
   KingBadboi Tech TempMail — script.js  v2
   Fixed: inbox parsing, HTML render, OTP detection, fast refresh
═══════════════════════════════════════════ */

const STATE = {
  email: null,
  refreshCountdown: 10,
  countdownTimer: null,
  messageCount: 0
};

/* ── DOM REFS ── */
const modal       = document.getElementById('followModal');
const emailText   = document.getElementById('emailText');
const statusDot   = document.getElementById('statusDot');
const statusTxt   = document.getElementById('statusTxt');
const inboxList   = document.getElementById('inboxList');
const domainSel   = document.getElementById('domainSelect');
const countdownEl = document.getElementById('countdown');
const toast       = document.getElementById('toast');
const inboxBadge  = document.getElementById('inboxBadge');

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

/* ── GENERATE ── */
async function generateEmail() {
  const domain = domainSel.value;
  setLoading('btnGenerate', true, '⚡ Generate');
  stopAutoRefresh();
  emailText.textContent = 'Generating...';
  emailText.className = 'placeholder';
  setStatus('idle', 'Requesting mailbox...');

  try {
    const res  = await fetch(`/api/generate?domain=${encodeURIComponent(domain)}`);
    const data = await res.json();

    if (data.success && data.result && data.result.email) {
      STATE.email = data.result.email;
      emailText.textContent = STATE.email;
      emailText.className = '';

      // Warn if mailbox status is bad
      const emailStatus = data.result.emailStatus || '';
      const uptime      = data.result.uptime      || '';

      if (uptime === 'online') {
        setStatus('online', 'Mailbox ready — waiting for mail');
      } else if (uptime === 'offline' || emailStatus === 'bad') {
        setStatus('warn', '⚠ Mailbox may be slow — try refreshing or regenerate');
        showToast('⚠ This mailbox status is unstable. Still try sending mail!');
      } else {
        setStatus('online', 'Mailbox created — send mail to it now');
      }

      STATE.messageCount = 0;
      renderInboxEmpty('USE THIS EMAIL — MESSAGES WILL APPEAR HERE AUTOMATICALLY');
      startAutoRefresh();
      showToast('✅ Email generated! Copy it and use on any site.');
    } else {
      emailText.textContent = '⚠ Could not generate';
      emailText.className = 'placeholder';
      setStatus('offline', 'Generation failed');
      showToast('❌ Failed to get email. Retry.');
    }
  } catch (err) {
    emailText.textContent = '⚠ Server error';
    emailText.className = 'placeholder';
    showToast('❌ Network error — is server running?');
  } finally {
    setLoading('btnGenerate', false, '⚡ Generate');
  }
}

/* ── COPY ── */
function copyEmail() {
  if (!STATE.email) return showToast('⚠ Generate an email first!');
  const copy = () => {
    const t = document.createElement('textarea');
    t.value = STATE.email;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    document.body.removeChild(t);
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(STATE.email).catch(copy);
  } else {
    copy();
  }
  showToast('📋 Email copied to clipboard!');
}

/* ── FETCH INBOX ── */
async function fetchInbox(silent = false) {
  if (!STATE.email) return;
  if (!silent) setLoading('btnRefresh', true, '🔄 Refresh');

  try {
    const res  = await fetch(`/api/inbox?email=${encodeURIComponent(STATE.email)}`);
    const data = await res.json();

    // Log raw response for debugging (visible in browser console)
    console.log('[INBOX RAW]', data);

    const messages = data.messages || [];

    if (messages.length > 0) {
      renderInbox(messages);
      if (messages.length !== STATE.messageCount) {
        STATE.messageCount = messages.length;
        if (!silent) showToast(`📨 ${messages.length} message(s) in inbox!`);
        else         showToast(`📨 New mail arrived!`);
      }
      setStatus('online', `${messages.length} message(s) in inbox`);
    } else {
      if (!silent) {
        showToast('📭 No messages yet. Did you send to this email?');
        renderInboxEmpty('NO MESSAGES YET — SEND AN EMAIL TO THIS ADDRESS');
      }
      if (STATE.messageCount === 0) {
        setStatus('online', 'Waiting for mail...');
      }
    }
  } catch (err) {
    console.error('[INBOX FETCH ERROR]', err);
    if (!silent) showToast('❌ Failed to check inbox.');
  } finally {
    if (!silent) setLoading('btnRefresh', false, '🔄 Refresh');
  }
}

/* ── RENDER INBOX ── */
function renderInbox(messages) {
  inboxList.innerHTML = '';
  if (inboxBadge) inboxBadge.textContent = messages.length;

  messages.forEach((msg, i) => {
    // Normalise field names — API may use different keys
    const from    = msg.from    || msg.sender      || msg.from_address || 'Unknown Sender';
    const subject = msg.subject || msg.title       || msg.sub          || '(No Subject)';
    const rawBody = msg.body    || msg.html         || msg.text
                 || msg.content || msg.message      || msg.bodyText
                 || msg.bodyHtml|| msg.htmlBody      || msg.textBody    || '';
    const time    = msg.date    || msg.received_at  || msg.created_at
                 || msg.time    || msg.timestamp     || '';

    // Detect OTP — handles "123 456", "123-456", plain 4–8 digit codes
    const plainText    = rawBody.replace(/<[^>]+>/g, ' ');
    const searchTarget = subject + ' ' + plainText;
    const otpMatch     = searchTarget.match(/\b(\d[\d\s\-]{3,9}\d)\b/);
    const otp          = otpMatch ? otpMatch[1].replace(/[\s\-]/g, '') : null;

    // Also detect verification links
    const linkMatch  = rawBody.match(/href=["'](https?:\/\/[^"']{10,}(?:verif|confirm|activate|token|auth|click)[^"']*?)["']/i);
    const verifyLink = linkMatch ? linkMatch[1] : null;

    // Render body: prefer HTML, fall back to text with newlines
    const isHtml   = /<[a-z][\s\S]*>/i.test(rawBody);
    const bodyHtml = isHtml
      ? `<iframe class="email-frame" srcdoc="${escAttr(rawBody)}" sandbox="allow-same-origin" onload="autoHeight(this)"></iframe>`
      : `<pre class="email-text">${escHtml(rawBody || '(Empty message)')}</pre>`;

    const item = document.createElement('div');
    item.className = 'message-item';
    item.innerHTML = `
      <div class="message-header" onclick="toggleMsg(${i})">
        <div class="msg-meta">
          <div class="message-from">📧 ${escHtml(String(from))}</div>
          <div class="message-subject">${escHtml(String(subject))}</div>
        </div>
        <div class="msg-right">
          ${otp ? `<span class="otp-chip">${otp}</span>` : ''}
          <span class="message-time">${formatTime(time)}</span>
          <span class="toggle-arrow" id="arrow-${i}">▼</span>
        </div>
      </div>
      <div class="message-body" id="msg-${i}">
        ${otp ? `
          <div class="otp-highlight">
            <div class="otp-label">// VERIFICATION CODE</div>
            <div class="otp-code" onclick="copyOtp('${otp}')" title="Click to copy">${otp} <span style="font-size:12px;opacity:0.5">📋</span></div>
          </div>` : ''}
        ${verifyLink ? `
          <div class="verify-link-box">
            <div class="otp-label">// VERIFICATION LINK DETECTED</div>
            <a href="${escAttr(verifyLink)}" target="_blank" rel="noopener noreferrer" class="btn-verify-link">
              🔗 CLICK TO VERIFY / CONFIRM
            </a>
          </div>` : ''}
        <div class="email-body-wrap">
          ${bodyHtml}
        </div>
      </div>
    `;
    inboxList.appendChild(item);
  });
}

function autoHeight(iframe) {
  try {
    iframe.style.height = (iframe.contentDocument.body.scrollHeight + 20) + 'px';
  } catch (e) { iframe.style.height = '300px'; }
}

function renderInboxEmpty(msg) {
  if (inboxBadge) inboxBadge.textContent = '0';
  inboxList.innerHTML = `
    <div class="inbox-empty">
      <span class="empty-icon">📭</span>
      ${msg || 'INBOX IS EMPTY'}
    </div>
  `;
}

function toggleMsg(i) {
  const body  = document.getElementById(`msg-${i}`);
  const arrow = document.getElementById(`arrow-${i}`);
  const open  = body.classList.toggle('open');
  if (arrow) arrow.textContent = open ? '▲' : '▼';
}

function copyOtp(code) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).catch(() => {});
  }
  showToast(`📋 Code ${code} copied!`);
}

/* ── AUTO REFRESH (10s) ── */
function startAutoRefresh() {
  stopAutoRefresh();
  STATE.refreshCountdown = 10;
  updateCountdown();
  STATE.countdownTimer = setInterval(() => {
    STATE.refreshCountdown--;
    updateCountdown();
    if (STATE.refreshCountdown <= 0) {
      fetchInbox(true);
      STATE.refreshCountdown = 10;
    }
  }, 1000);
}

function stopAutoRefresh() {
  clearInterval(STATE.countdownTimer);
  STATE.countdownTimer = null;
  STATE.refreshCountdown = 10;
  updateCountdown();
}

function updateCountdown() {
  if (countdownEl) countdownEl.textContent = STATE.refreshCountdown;
}

/* ── STATUS ── */
function setStatus(type, msg) {
  const classes = { online: 'online', offline: 'offline', warn: 'warn', idle: '' };
  statusDot.className = 'status-dot ' + (classes[type] || '');
  statusTxt.textContent = msg || 'Standby';
}

/* ── LOADING ── */
function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner"></span>' : label;
}

/* ── TOAST ── */
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 4000);
}

/* ── UTILS ── */
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d)) return String(ts);
    return d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return String(ts); }
}

/* ── WIRE UP ── */
document.getElementById('btnGenerate').addEventListener('click', generateEmail);
document.getElementById('btnCopy').addEventListener('click', copyEmail);
document.getElementById('btnRefresh').addEventListener('click', () => fetchInbox(false));
