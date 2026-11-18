const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidSolanaPublicKey,
  checkTokenRugShield,
  scanWalletUnclaimedRent,
  resetRentShieldCache
} = require("../rentshield.js");

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SAMPLE_WALLET = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
const FAKE_SECRET_KEY =
  "5MaiiCavjCmn9Hs1o3eznqDEhRwxo7pXiAYez7keQUviUkauRiTMD8DrESdrNjN8zd9mTmVhRvBJeg5vhyvgrAhG";

test("isValidSolanaPublicKey accepts 32-byte public keys and rejects secret keys or mnemonics", () => {
  assert.equal(isValidSolanaPublicKey(USDC_MINT), true);
  assert.equal(isValidSolanaPublicKey(SAMPLE_WALLET), true);
  assert.equal(isValidSolanaPublicKey(FAKE_SECRET_KEY), false);
  assert.equal(isValidSolanaPublicKey("word1 word2 word3 word4"), false);
  assert.equal(isValidSolanaPublicKey(""), false);
});

test("checkTokenRugShield and scanWalletUnclaimedRent block private keys before any network request", async () => {
  const forbidFetch = async () => {
    throw new Error("Should not call fetch for invalid input");
  };
  await assert.rejects(() => checkTokenRugShield(FAKE_SECRET_KEY, forbidFetch), /Invalid mint address/);
  await assert.rejects(() => scanWalletUnclaimedRent(FAKE_SECRET_KEY, forbidFetch), /Invalid wallet address/);
});

test("checkTokenRugShield resolves live_endpoint.json on 404 and parses 11-layer result", async () => {
  resetRentShieldCache();
  const seen = [];
  const mockFetch = async (url) => {
    seen.push(String(url));
    if (String(url).startsWith("https://rentandrugshield.com/api/v1/shield-check")) {
      return new Response("Not found", { status: 404 });
    }
    if (String(url) === "https://rentandrugshield.com/live_endpoint.json") {
      return new Response(
        JSON.stringify({ ok: true, api_base: "https://gateway.rentandrugshield.example" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        mint: USDC_MINT,
        symbol: "USDC",
        name: "USD Coin",
        token_program: "SPL Token",
        score: 100,
        safe_to_buy: true,
        verdict: "SAFE",
        layers_checked: 11,
        layers_passed: 11,
        checklist_summary: "11/11",
        checks: [{ layer: 1, key: "mint_auth", passed: true }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await checkTokenRugShield(USDC_MINT, mockFetch);
  assert.equal(result.mint, USDC_MINT);
  assert.equal(result.score, 100);
  assert.equal(result.safeToBuy, true);
  assert.equal(result.layersChecked, 11);
  assert.equal(seen.length, 3);
});

test("scanWalletUnclaimedRent sends only public wallet address and maps 0%-first-claim preview", async () => {
  resetRentShieldCache();
  let capturedBody = null;
  const mockFetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        ok: true,
        wallet: SAMPLE_WALLET,
        is_first_free_claim: true,
        effective_fee_bps: 0,
        reclaimable_count: 3,
        empty_count: 3,
        dust_count: 0,
        active_count: 1,
        total_reclaimable_sol: 0.006117,
        total_reclaimable_lamports: 6117840,
        empty_reclaimable: []
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await scanWalletUnclaimedRent(SAMPLE_WALLET, mockFetch);
  assert.deepEqual(capturedBody, { wallet: SAMPLE_WALLET, user_initiated: false });
  assert.equal(result.isFirstFreeClaim, true);
  assert.equal(result.effectiveFeeBps, 0);
  assert.equal(result.emptyCount, 3);
  assert.equal(result.totalReclaimableSol, 0.006117);
});
