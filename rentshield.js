const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SOLANA_PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DEFAULT_ORIGIN = "https://rentandrugshield.com";

let cachedLiveBase = { url: null, expiresAt: 0 };

function resetRentShieldCache() {
  cachedLiveBase = { url: null, expiresAt: 0 };
}

function isValidSolanaPublicKey(input) {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (!SOLANA_PUBKEY_RE.test(trimmed)) return false;
  const bytes = [0];
  for (let i = 0; i < trimmed.length; i += 1) {
    let carry = BASE58_ALPHABET.indexOf(trimmed[i]);
    if (carry < 0) return false;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingOnes = 0;
  while (leadingOnes < trimmed.length && trimmed[leadingOnes] === "1") {
    leadingOnes += 1;
  }
  return bytes.length + leadingOnes === 32;
}

function assertPublicAddress(value, label) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!isValidSolanaPublicKey(trimmed)) {
    throw new Error(
      `Invalid ${label}: expected a 32-byte base58 Solana public key. Never pass private keys or seed phrases.`
    );
  }
  return trimmed;
}

async function resolveLiveApiBase(fetchImpl = fetch) {
  const now = Date.now();
  if (cachedLiveBase.url && cachedLiveBase.expiresAt > now) {
    return cachedLiveBase.url;
  }
  const response = await fetchImpl(`${DEFAULT_ORIGIN}/live_endpoint.json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const candidate = String(payload?.api_base || payload?.endpoint || "")
    .trim()
    .replace(/\/+$/, "");
  if (!candidate) return null;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:") return null;
  cachedLiveBase = { url: candidate, expiresAt: now + 5 * 60 * 1000 };
  return candidate;
}

async function requestRentShield(pathname, init, fetchImpl = fetch) {
  const envBase = String(process.env.RENTSHIELD_API_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const initialBase =
    envBase ||
    (cachedLiveBase.url && cachedLiveBase.expiresAt > Date.now()
      ? cachedLiveBase.url
      : DEFAULT_ORIGIN);

  let response = await fetchImpl(`${initialBase}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(10000)
  });

  if (!envBase && (response.status === 404 || response.status === 405)) {
    const liveBase = await resolveLiveApiBase(fetchImpl);
    if (liveBase && liveBase !== initialBase) {
      response = await fetchImpl(`${liveBase}${pathname}`, {
        ...init,
        signal: AbortSignal.timeout(10000)
      });
    }
  }

  if (!response.ok) {
    throw new Error(`Rent & Rug Shield request failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function checkTokenRugShield(mint, fetchImpl = fetch) {
  const cleanMint = assertPublicAddress(mint, "mint address");
  const headers = {
    Accept: "application/json",
    "X-Payment-Protocol": "x402"
  };
  if (process.env.RENTSHIELD_API_KEY) {
    headers["X-API-Key"] = process.env.RENTSHIELD_API_KEY;
  }
  const data = await requestRentShield(
    `/api/v1/shield-check?mint=${encodeURIComponent(cleanMint)}`,
    { method: "GET", headers },
    fetchImpl
  );
  const score = typeof data.score === "number" ? data.score : data.safety_score;
  return {
    mint: data.mint || cleanMint,
    symbol: data.symbol || null,
    name: data.name || null,
    tokenProgram: data.token_program || null,
    score: typeof score === "number" ? score : null,
    safeToBuy: Boolean(
      data.safe_to_buy ?? (typeof score === "number" && score >= 75 && !data.hidden_pda_rent_trap)
    ),
    verdict: data.verdict || null,
    layersChecked: data.layers_checked ?? 11,
    layersPassed: data.layers_passed ?? null,
    checklistSummary: data.checklist_summary || null,
    mintAuthorityActive: Boolean(data.mint_authority_active),
    freezeAuthorityActive: Boolean(data.freeze_authority_active),
    hasPermanentDelegate: Boolean(data.has_permanent_delegate),
    hasTransferHook: Boolean(data.has_transfer_hook),
    hiddenPdaRentTrap: Boolean(data.hidden_pda_rent_trap),
    checks: Array.isArray(data.checks) ? data.checks : [],
    reportUrl: `${DEFAULT_ORIGIN}/audit/${cleanMint}`
  };
}

async function scanWalletUnclaimedRent(walletAddress, fetchImpl = fetch) {
  const cleanWallet = assertPublicAddress(walletAddress, "wallet address");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (process.env.RENTSHIELD_API_KEY) {
    headers["X-API-Key"] = process.env.RENTSHIELD_API_KEY;
  }
  const data = await requestRentShield(
    "/api/scan-wallet",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ wallet: cleanWallet, user_initiated: false })
    },
    fetchImpl
  );
  return {
    wallet: data.wallet || cleanWallet,
    isFirstFreeClaim: Boolean(data.is_first_free_claim),
    effectiveFeeBps: data.effective_fee_bps ?? data.fee_bps ?? 0,
    reclaimableCount: data.reclaimable_count ?? 0,
    emptyCount: data.empty_count ?? 0,
    dustCount: data.dust_count ?? 0,
    activeCount: data.active_count ?? 0,
    totalReclaimableSol: data.total_reclaimable_sol ?? 0,
    totalReclaimableLamports: data.total_reclaimable_lamports ?? 0,
    emptyReclaimable: Array.isArray(data.empty_reclaimable) ? data.empty_reclaimable : [],
    dustReclaimable: Array.isArray(data.dust_reclaimable) ? data.dust_reclaimable : [],
    claimUrl: `${DEFAULT_ORIGIN}/?wallet=${cleanWallet}`
  };
}

module.exports = {
  isValidSolanaPublicKey,
  assertPublicAddress,
  checkTokenRugShield,
  scanWalletUnclaimedRent,
  resetRentShieldCache
};
