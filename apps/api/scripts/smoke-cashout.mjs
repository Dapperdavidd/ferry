// Live on Monad testnet: fund a user, quote a cash-out to naira, sign, settle through FerrySettlement.
import { createPublicClient, erc20Abi, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const API = process.env.API_URL ?? 'http://localhost:8000';
const RPC = process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz';
const CTK = '0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = createPublicClient({ transport: http(RPC) });

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
  return (await call('POST', '/auth/verify', { address: account.address, signature })).token;
}
function toSignable(typedData) {
  const message = {};
  for (const field of typedData.types[typedData.primaryType]) {
    const value = typedData.message[field.name];
    message[field.name] = /^u?int/.test(field.type) ? BigInt(value) : value;
  }
  return { ...typedData, message };
}
async function waitFor(label, check, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const r = await check();
    if (r) return r;
    await sleep(1500);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const A = privateKeyToAccount(generatePrivateKey());
const token = await signIn(A);
await call('PUT', '/me', { handle: `c_${Date.now().toString(36).slice(-6)}`, homeCurrency: 'NGN', country: 'NG' }, token);
const fund = await call('POST', '/wallet/fund', undefined, token);
await waitFor('funding', async () => (await call('GET', '/transfers?limit=3', undefined, token)).items.find((r) => r.txHash === fund.txHash && r.status === 'CONFIRMED'));
console.log('funded:', `$${(await call('GET', '/wallet/balances', undefined, token)).usdValue}`);

const quote = await call('POST', '/cashout/quote', { amountRaw: '20000000', currency: 'NGN' }, token);
console.log('quote:', { out: quote.outAmountRaw, minOut: quote.minOutRaw, rate: quote.rate, fee: quote.feeRaw, local: `${quote.localCurrency} ${quote.localAmount}`, fx: quote.fxRate });
const prepared = await call('POST', '/cashout/prepare', { quoteId: quote.quoteId }, token);
console.log('prepared:', prepared.typedData.primaryType, 'to', prepared.typedData.message.to);
const partner = await call('GET', '/agora/overview').catch(() => null);
const payoutTo = process.env.PAYOUT_PARTNER_ADDRESS ?? null;
const before = payoutTo ? await client.readContract({ address: CTK, abi: erc20Abi, functionName: 'balanceOf', args: [payoutTo] }) : null;

const signature = await A.signTypedData(toSignable(prepared.typedData));
const submitted = await call('POST', '/cashout/submit', { intentId: prepared.intentId, signature }, token);
console.log('submitted:', submitted.status, submitted.txHash);
const again = await call('POST', '/cashout/submit', { intentId: prepared.intentId, signature }, token);
console.log('resubmit idempotent:', again.txHash === submitted.txHash ? 'yes' : 'NO');

const row = await waitFor('settlement + payout', async () => {
  const list = await call('GET', '/transfers?limit=5', undefined, token);
  const r = list.items.find((x) => x.txHash === submitted.txHash);
  if (r?.status === 'FAILED') throw new Error('cash-out failed');
  return r?.status === 'CONFIRMED' && r.cashout?.payoutStatus === 'SENT' ? r : null;
});
console.log('activity:', row.kind, row.status, `$${row.usdValue}`, '→', `${row.cashout.outToken} ${row.cashout.outAmountRaw}`, `payout ${row.cashout.localCurrency} ${row.cashout.localAmount} ${row.cashout.payoutStatus}`);
console.log('balance after:', `$${(await call('GET', '/wallet/balances', undefined, token)).usdValue}`);
if (before !== null) {
  const after = await client.readContract({ address: CTK, abi: erc20Abi, functionName: 'balanceOf', args: [payoutTo] });
  console.log('partner CTK gained:', (after - before).toString());
}
console.log('explorer:', `https://testnet.monadscan.com/tx/${submitted.txHash}`);
