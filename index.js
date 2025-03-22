const { McpServer } =require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { Connection, Keypair, VersionedTransaction, PublicKey} = require("@solana/web3.js");
const { getMint } = require("@solana/spl-token");
const bs58 = require("bs58");

const dotenv = require("dotenv")
dotenv.config()

// Configuration
const ULTRA_API = "https://api.jup.ag/ultra/v1";
const RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Base58 encoded private key

// Configure Solana Connection with proxy
const connection = new Connection(RPC_URL, {
  commitment: "confirmed"
});

// Load wallet from private key
const walletKeypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
const walletPublicKey = walletKeypair.publicKey.toString();

// Initialize MCP server
const server = new McpServer({
  name: "Jupiter MCP",
  version: "1.0.0"
});

server.tool(
  "get-ultra-order",
  "Get a swap order from both Jupiter DEX Routing Engine and Jupiter Z (RFQ).",
  {
    inputMint: z.string().describe("Input token mint address"),
    outputMint: z.string().describe("Output token mint address"),
    amount: z.string().describe("Input amount as a string (e.g., '1.23')")
  },
  async ({ inputMint, outputMint, amount, slippageBps }) => {
    try {
      const effectiveInputMint = inputMint;
      const effectiveOutputMint = outputMint;

      const inputMintPublicKey = new PublicKey(effectiveInputMint);
      const inputMintInfo = await getMint(connection, inputMintPublicKey);
      const decimals = inputMintInfo.decimals;

      const amountFloat = parseFloat(amount);
      if (isNaN(amountFloat)) {
        throw new Error("Invalid amount format");
      }
      const amountInt = Math.floor(amountFloat * Math.pow(10, decimals)).toString();

      const params = new URLSearchParams({
        inputMint: effectiveInputMint,
        outputMint: effectiveOutputMint,
        amount: amountInt,
        slippageBps: slippageBps.toString(),
        taker: walletPublicKey
      });

      const response = await fetch(`${ULTRA_API}/order?${params}`);
      const order = await response.json();
      if (!order.transaction) {
        throw new Error("No transaction field in response. Ensure taker address is valid.");
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            requestId: order.requestId,
            transaction: order.transaction,
            inputMint: effectiveInputMint,
            outputMint: effectiveOutputMint,
            inAmount: order.inAmount,
            outAmount: order.outAmount,
            price: Number(order.outAmount) / Number(order.inAmount)
          }, null, 2)
        }]
      };
    } catch (error) {
      console.log(error)
      return {
        content: [{
          type: "text",
          text: `Error fetching order: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "execute-ultra-order",
  "Request Jupiter to execute the swap transaction on behalf of the wallet owner. This includes handling of slippage, priority fees, transaction landing and more.",  
  {
    requestId: z.string().describe("Request ID from get-swap-order"),
    transaction: z.string().describe("Base64 encoded transaction from get-swap-order")
  },
  async ({ requestId, transaction, inputMint, outputMint, amount }) => {
    try {

      let tx = VersionedTransaction.deserialize(Buffer.from(transaction, "base64"));
      tx.sign([walletKeypair]);
      const signedTransaction = Buffer.from(tx.serialize()).toString("base64");

      const executeResponse = await fetch(`${ULTRA_API}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          signedTransaction,
          requestId
        })
      });

      if (!executeResponse.ok) {
        throw new Error(`HTTP error! status: ${executeResponse.status}`);
      }

      const result = await executeResponse.json();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: result.status,
            transactionId: result.signature,
            slot: result.slot,
            inputAmountResult: result.inputAmountResult,
            outputAmountResult: result.outputAmountResult,
            swapEvents: result.swapEvents
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing swap: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Start the server
async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  /*
  console.log(await server._registeredTools['get-swap-order'].callback({
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amount: "1.23",
    token: walletPublicKey,
    slippageBps: 50
  }))
  console.log(await server._registeredTools['execute-swap-order'].callback({
    requestId: "a770110b-82c9-46c8-ba61-09d955b27503",
    transaction: "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHC+oaDbp9I+uYeae3ayA/1sT4qamJ7tq3b9PZmkdhJZ1mH9RsYXp41YrTtfB/VqrENVYdGHG6rtaCOqWfAPswrbh9iVaqrUHPNEIwuvJkSS4mZY8ggefu+qFI49PsepOULZXdFYpJfuoa+lkMfRsGXmW453vsGMQqadwJft+fT84EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACMlyWPTiSJ8bs9ECkUjg2DC1oTmdr/EIQEjnvY2+n4Wawfg/25zlUN6V1VjNx5VGHM9DdKxojsE6mEACIKeNoGAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAAC0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqns4zl6AR51VvyMcBu7nTFbs5oFQf9sbLeo/SOUQKxzaJWvBOPBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKmrpZYSiXiYJPloNZKFXzIx+ssAA5/HzJnPbcFMqSRo6AcHAAUCwFwVAAcACQNpRAgAAAAAAAQCAAIMAgAAAHBtb0kAAAAACQUCAA8KBAmT8Xtk9ISudv4FBgADAA4ECgEBCRMKAAIDCQ4BCAkQAA0MCwIDChEGJOUXy5d6460qAQAAAD0AZAABgE9QSQAAAAAZSXkJAAAAAFMABQoDAgAAAQkBXebA5bRGJSJ69exFtoMFfhkdbXv3/0Pj0l8x1dXoHawDum+4BMATuXA="
  }))
  */
}

startServer().catch(console.error);

