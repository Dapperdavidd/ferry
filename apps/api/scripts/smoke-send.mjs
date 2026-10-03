// End to end on a live API and Monad testnet: fund A from the faucet, send A → @B, confirm both sides.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const API = process.env.API_URL ?? 'http://localhost:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function signIn(account) {
  const challenge = await call('GET', `/auth/challenge?address=${account.address}`);
  const signature = await account.signMessage({ message: challenge.message });
  const verified = await call('POST', '/auth/verify', { address: account.address, signature });
  return verified.token;
}

/** Numbers travel as strings in JSON; viem signs bigints. */
function toSignable(typedData) {
  const fields = typedData.types[typedData.primaryType];
  const message = {};
  for (const field of fields) {
    const value = typedData.message[field.name];
    message[field.name] = /^u?int/.test(field.type) ? BigInt(value) : value;
  }
  return { ...typedData, message };
}

async function waitFor(label, check, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await check();
    if (result) return result;
    await sleep(1500);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const A = privateKeyToAccount(generatePrivateKey());
const B = privateKeyToAccount(generatePrivateKey());
const tokenA = await signIn(A);
const tokenB = await signIn(B);
const handleB = `b_${Date.now().toString(36).slice(-6)}`;
await call('PUT', '/me', { handle: handleB, displayName: 'Bola', homeCurrency: 'NGN', country: 'NG' }, tokenB);
console.log('accounts:', A.address, '→ @' + handleB, B.address);

const fund = await call('POST', '/wallet/fund', undefined, tokenA);
console.log('faucet tx:', fund.txHash);
const funded = await waitFor('funding to confirm', async () => {
  const list = await call('GET', '/transfers?limit=5', undefined, tokenA);
  const row = list.items.find((r) => r.txHash === fund.txHash);
  return row?.status === 'CONFIRMED' ? row : row?.status === 'FAILED' ? Promise.reject(new Error('funding failed')) : null;
});
console.log('funding:', funded.status, funded.kind, `$${funded.usdValue}`);
const balanceA = await call('GET', '/wallet/balances', undefined, tokenA);
console.log('A balance:', `$${balanceA.usdValue}`);

const prepared = await call('POST', '/transfers/prepare', { to: `@${handleB}`, amountRaw: '25000000', memo: 'Lunch' }, tokenA);
console.log('prepared:', prepared.recipient.handle, prepared.typedData.primaryType, 'fee', prepared.feeRaw);
if (prepared.typedData.message.to.toLowerCase() !== B.address.toLowerCase()) throw new Error('typed data names the wrong recipient');
const signature = await A.signTypedData(toSignable(prepared.typedData));
const submitted = await call('POST', '/transfers/submit', { intentId: prepared.intentId, signature }, tokenA);
console.log('submitted:', submitted.status, submitted.txHash);

const again = await call('POST', '/transfers/submit', { intentId: prepared.intentId, signature }, tokenA);
console.log('resubmit is idempotent:', again.txHash === submitted.txHash ? 'yes' : 'NO');

const confirmedA = await waitFor('send to confirm', async () => {
  const list = await call('GET', '/transfers?limit=5', undefined, tokenA);
  const row = list.items.find((r) => r.id === submitted.transferId);
  return row?.status === 'CONFIRMED' ? row : row?.status === 'FAILED' ? Promise.reject(new Error('send failed')) : null;
});
console.log('A sees:', confirmedA.direction, confirmedA.status, `$${confirmedA.usdValue}`, 'to @' + confirmedA.counterparty?.handle, 'memo', confirmedA.memo);
const confirmedB = await waitFor("B's arrival", async () => {
  const list = await call('GET', '/transfers?limit=5', undefined, tokenB);
  const row = list.items.find((r) => r.txHash === submitted.txHash);
  return row?.status === 'CONFIRMED' ? row : null;
});
console.log('B sees:', confirmedB.direction, confirmedB.status, `$${confirmedB.usdValue}`, 'from', confirmedB.counterparty?.address === A.address ? 'A' : 'UNKNOWN');
const balanceB = await call('GET', '/wallet/balances', undefined, tokenB);
console.log('B balance:', `$${balanceB.usdValue}`);
const balanceA2 = await call('GET', '/wallet/balances', undefined, tokenA);
console.log('A balance:', `$${balanceA2.usdValue}`);
console.log('explorer:', `https://testnet.monadscan.com/tx/${submitted.txHash}`);
