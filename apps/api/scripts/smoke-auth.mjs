// Signs in to a running API the way the app does: challenge, EIP-191 signature, verify, then /me.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const API = process.env.API_URL ?? 'http://localhost:8000';
const account = privateKeyToAccount(process.env.SMOKE_PRIVATE_KEY ?? generatePrivateKey());

async function call(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const challenge = await call('GET', `/auth/challenge?address=${account.address}`);
const signature = await account.signMessage({ message: challenge.message });
const verified = await call('POST', '/auth/verify', { address: account.address, signature });
console.log('verify:', { isNew: verified.isNew, handle: verified.user.handle, address: verified.user.address });

const me = await call('GET', '/me', undefined, verified.token);
console.log('me:', me.id === verified.user.id ? 'same user' : 'MISMATCH');

const handle = `smoke_${Date.now().toString(36).slice(-6)}`;
const availability = await call('GET', `/directory/available?handle=${handle}`);
console.log('available:', availability);
const updated = await call('PUT', '/me', { handle, displayName: 'Smoke Test', homeCurrency: 'NGN', country: 'NG' }, verified.token);
console.log('updated:', { handle: updated.handle, homeCurrency: updated.homeCurrency });

const resolved = await call('GET', `/directory/resolve?handle=@${handle}`);
console.log('resolved:', resolved.address === account.address ? 'address matches' : 'MISMATCH');

const again = await call('POST', '/auth/verify', { address: account.address, signature }).catch((e) => e.message);
console.log('replayed signature refused:', typeof again === 'string' && again.includes('401') ? 'yes' : `NO: ${JSON.stringify(again)}`);

const taken = await call('GET', `/directory/available?handle=${handle}`);
console.log('handle now taken:', taken.available === false ? 'yes' : 'NO');
