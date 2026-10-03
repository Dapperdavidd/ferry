// Creates a funded Ferry account to send to during a demo. Prints its key to stdout only.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const API = process.env.API_URL;
async function call(method, path, body, token) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const key = process.env.RECIPIENT_PRIVATE_KEY ?? generatePrivateKey();
const account = privateKeyToAccount(key);
const challenge = await call('GET', `/auth/challenge?address=${account.address}`);
const signature = await account.signMessage({ message: challenge.message });
const { token } = await call('POST', '/auth/verify', { address: account.address, signature });
const me = await call('PUT', '/me', { handle: process.env.RECIPIENT_HANDLE ?? "bola", displayName: 'Bola', homeCurrency: 'NGN', country: 'NG' }, token);
const fund = await call('POST', '/wallet/fund', undefined, token);
console.log(JSON.stringify({ handle: me.handle, address: me.address, fundTx: fund.txHash }));
process.stdout.write(`KEY ${key}\n`);
