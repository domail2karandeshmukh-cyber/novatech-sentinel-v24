const byId = id => document.getElementById(id);
const unpaired = byId('unpaired');
const paired = byId('paired');
const statusBox = document.querySelector('.footer-status');
const consent = byId('consent');
const shutdownButton = byId('shutdown-button');
let session = null;

function status(message, isError = false) {
  byId('status').textContent = message;
  statusBox.classList.toggle('error', isError);
}

function saveSession(next) {
  session = next;
  if (next) sessionStorage.setItem('novatech-remote-v2.3', JSON.stringify(next));
  else sessionStorage.removeItem('novatech-remote-v2.3');
  unpaired.hidden = Boolean(next);
  paired.hidden = !next;
  shutdownButton.disabled = !next || !consent.checked;
  if (next) {
    byId('controller-name').textContent = next.name;
    updateRemaining();
  }
}

function updateRemaining() {
  if (!session) return;
  const remaining = Math.max(0, session.expiresAt - Date.now());
  const sec = Math.ceil(remaining / 1000);
  byId('time-remaining').textContent = `${Math.floor(sec / 60).toString().padStart(2,'0')}:${(sec % 60).toString().padStart(2,'0')}`;
  byId('time-progress').style.width = `${Math.min(100, (remaining / (30 * 60 * 1000)) * 100)}%`;
  if (!remaining) {
    saveSession(null);
    status('Your 30-minute pairing has expired. Ask the Mac owner to create a new session.', true);
  }
}

async function api(path, { method = 'GET', data, token = session?.token } = {}) {
  const response = await fetch(path, {
    method,
    headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not complete the request.');
  return result;
}

byId('pair-button').addEventListener('click', async () => {
  const code = byId('pin').value.trim();
  if (!/^\d{6}$/.test(code)) { status('Enter the six-digit code shown on Karan’s Mac.', true); return; }
  const button = byId('pair-button');
  button.disabled = true;
  try {
    const result = await api('/api/pair', { method: 'POST', data: { code }, token: null });
    saveSession(result);
    byId('pin').value = '';
    status('Secure 30-minute pairing established. Ask Karan to save his work before requesting shutdown.');
  } catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
});

consent.addEventListener('change', () => { shutdownButton.disabled = !session || !consent.checked; });
byId('disconnect-button').addEventListener('click', () => {
  saveSession(null);
  consent.checked = false;
  status('You disconnected this laptop. The Mac owner can also revoke the active session immediately.');
});

shutdownButton.addEventListener('click', async () => {
  if (!session || !consent.checked) return;
  if (!window.confirm('Send a shutdown REQUEST to Karan’s Mac? His Mac will ask him to Allow or Cancel.')) return;
  shutdownButton.disabled = true;
  status('Shutdown request sent. Waiting for a separate confirmation on Karan’s Mac…');
  try {
    const result = await api('/api/shutdown', { method: 'POST', data: { confirmation: 'REQUEST MAC SHUTDOWN' } });
    status(result.status === 'preview' ? 'Preview passed. The Mac was not shut down.' : result.status === 'cancelled' ? 'Karan rejected the shutdown request. Mac remains on.' : 'macOS accepted the request. The target computer may now switch off.');
  } catch (error) { status(`No confirmation received: ${error.message}. Check the Mac itself.`, true); }
  finally { consent.checked = false; shutdownButton.disabled = !session; if (session) shutdownButton.disabled = true; }
});

async function resume() {
  try {
    const cached = JSON.parse(sessionStorage.getItem('novatech-remote-v2.3') || 'null');
    if (cached?.token && cached.expiresAt > Date.now()) {
      const verified = await api('/api/session', { token: cached.token });
      saveSession({ ...cached, ...verified });
      status('Secure pairing restored from this browser session. Mac owner approval remains mandatory.');
    } else { saveSession(null); }
  } catch { saveSession(null); }
}

setInterval(updateRemaining, 1000);
void resume();
