/* ═══════════════════════════════════════════
   KingBadboi Tech TempMail — script.js
═══════════════════════════════════════════ */

const STATE = {
  email: null,
  followed: false,
  refreshInterval: null,
  refreshCountdown: 30,
  countdownTimer: null,
  messages: []
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

/* ── MODAL ── */
document.getElementById('btnFollowNow').addEventListener('click', () => {
  window.open('https://whatsapp.com/channel/0029Vb7ivq9HLHQcS4XgQu2Q', '_blank');
  setTimeout(() => {
    STATE.followed = true;
    closeModal();
  }, 1500);
});

document.getElementById('btnEnterAnyway').addEventListener('click', () => {
  STATE.followed = false;
  closeModal();
});

function closeModal() {
  modal.style.opacity = '0';
  modal.style.transform = 'scale(1.05)';
  modal.style.transition = 'all 0.3s ease';
  setTimeout(() => { modal.style.display = 'none'; }, 300);
}

/* ── GENERATE EMAIL ── */
async function generateEmail() {
  const domain = domainSel.value;
  setLoading('btnGenerate', true);
  stopAutoRefresh();

  emailText.textContent = 'Generating...';
  emailText.className = 'placeholder';
  setStatus('idle');

  try {
    const res  = await fetch(`/api/generate?domain=${encodeURIComponent(domain)}`);
    const data = await res.json();

    if (data.success && data.result && data.result.email) {
      STATE.email = data.result.email;
      emailText.textContent = STATE.email;
      emailText.className = '';

      const uptime = data.result.uptime || 'unknown';
      if (uptime === 'online') setStatus('online', 'Mailbox active');
      else if (uptime === 'offline') setStatus('offline', 'Mailbox offline');
      else setStatus('idle', `Status: ${uptime}`);

      inboxList.innerHTML = '';
      STATE.messages = [];
      renderInboxEmpty();
      startAutoRefresh();
      showToast('✅ Email generated!');
    } else {
      emailText.textContent = '⚠ Could not generate';
      emailText.className = 'placeholder';
      showToast('❌ Generation failed. Retry.', 'error');
    }
  } catch (err) {
    emailText.textContent = '⚠ Server error';
    emailText.className = 'placeholder';
    showToast('❌ Network error.', 'error');
  } finally {
    setLoading('btnGenerate', false);
  }
}

/* ── COPY EMAIL ── */
function copyEmail() {
  if (!STATE.email) return showToast('⚠ No email to copy!');
  navigator.clipboard.writeText(STATE.email)
    .then(() => showToast('📋 Copied to clipboard!'))
    .catch(() => {
      const t = document.createElement('textarea');
      t.value = STATE.email;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
      showToast('📋 Copied!');
    });
}

/* ── FETCH INBOX ── */
async function fetchInbox(silent = false) {
  if (!STATE.email) return;
  if (!silent) setLoading('btnRefresh', true);

  try {
    const res  = await fetch(`/api/inbox?email=${encodeURIComponent(STATE.email)}`);
    const data = await res.json();

    if (data.success && Array.isArray(data.result)) {
      renderInbox(data.result);
    } else if (data.success && data.result && typeof data.result === 'object') {
      // Some APIs return object with messages array
      const msgs = data.result.messages || data.result.inbox || [];
      renderInbox(msgs);
    } else {
      if (!silent) showToast('📭 No new messages yet.');
    }
  } catch (err) {
    if (!silent) showToast('❌ Failed to fetch inbox.', 'error');
  } finally {
    if (!silent) setLoading('btnRefresh', false);
  }
}

/* ── RENDER INBOX ── */
function renderInbox(messages) {
  if (!messages || messages.length === 0) {
    renderInboxEmpty();
    return;
  }

  STATE.messages = messages;
  inboxList.innerHTML = '';

  messages.forEach((msg, i) => {
    const from    = msg.from || msg.sender || 'Unknown Sender';
    const subject = msg.subject || '(No Subject)';
    const body    = msg.body || msg.text || msg.html || msg.content || '(No content)';
    const time    = msg.date || msg.time || msg.created_at || '';

    // Try to extract OTP
    const otpMatch = (body + ' ' + subject).match(/\b(\d{4,8})\b/);
    const otp = otpMatch ? otpMatch[1] : null;

    const item = document.createElement('div');
    item.className = 'message-item';
    item.innerHTML = `
      <div class="message-header" onclick="toggleMessage(${i})">
        <div>
          <div class="message-from">${escHtml(from)}</div>
          <div class="message-subject">${escHtml(subject)}</div>
        </div>
        <div class="message-time">${formatTime(time)}</div>
      </div>
      <div class="message-body" id="msg-${i}">
        ${otp ? `
          <div class="otp-highlight">
            <div class="otp-label">// VERIFICATION CODE DETECTED</div>
            <div class="otp-code">${otp}</div>
          </div>` : ''}
        ${escHtml(stripHtml(body))}
      </div>
    `;
    inboxList.appendChild(item);
  });

  if (messages.length > 0) showToast(`📨 ${messages.length} message(s) found!`);
}

function renderInboxEmpty() {
  inboxList.innerHTML = `
    <div class="inbox-empty">
      <span class="empty-icon">📭</span>
      INBOX IS EMPTY<br>
      <span style="font-size:10px;opacity:0.5;margin-top:6px;display:block">
        USE YOUR EMAIL ABOVE — MESSAGES APPEAR HERE
      </span>
    </div>
  `;
}

function toggleMessage(i) {
  const body = document.getElementById(`msg-${i}`);
  body.classList.toggle('open');
}

/* ── AUTO REFRESH ── */
function startAutoRefresh() {
  stopAutoRefresh();
  STATE.refreshCountdown = 30;
  updateCountdown();

  STATE.countdownTimer = setInterval(() => {
    STATE.refreshCountdown--;
    updateCountdown();
    if (STATE.refreshCountdown <= 0) {
      fetchInbox(true);
      STATE.refreshCountdown = 30;
    }
  }, 1000);
}

function stopAutoRefresh() {
  clearInterval(STATE.countdownTimer);
  STATE.countdownTimer = null;
  STATE.refreshCountdown = 30;
  updateCountdown();
}

function updateCountdown() {
  if (countdownEl) countdownEl.textContent = STATE.refreshCountdown;
}

/* ── STATUS ── */
function setStatus(type, msg) {
  statusDot.className = 'status-dot ' + (type || '');
  statusTxt.textContent = msg || (type === 'online' ? 'Online' : type === 'offline' ? 'Offline' : 'Standby');
}

/* ── LOADING ── */
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn._original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._original || btn.innerHTML;
  }
}

/* ── TOAST ── */
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ── UTILS ── */
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || html;
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

/* ── WIRE UP BUTTONS ── */
document.getElementById('btnGenerate').addEventListener('click', generateEmail);
document.getElementById('btnCopy').addEventListener('click', copyEmail);
document.getElementById('btnRefresh').addEventListener('click', () => fetchInbox(false));
