# Jupiter MCP Server

An MCP server for executing token swaps on the Solana blockchain using Jupiter's new Ultra API. 

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)
![Status](https://img.shields.io/badge/status-active-brightgreen.svg)

## Features

- Fetch swap orders from Jupiter's Ultra API, combining DEX routing and RFQ (Request for Quote) for optimal pricing.
- Execute swaps via Jupiter's Ultra API, handling slippage, priority fees, and transaction landing.


## Prerequisites

- **Node.js**: Version 18 or higher (for native `fetch` support).
- **Solana Wallet**: A private key (base58-encoded) for signing transactions.
- **RPC Endpoint**: Access to a Solana RPC node (e.g., `https://api.mainnet-beta.solana.com`).

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/jupiter-mcp.git
   cd jupiter-mcp
   ```

2. **Install Dependencies**:
   Ensure you have the MCP Server package installed along with other required dependencies:
   ```bash
   npm install
   ```

3. **Client Configuration**:

```json
{
  "mcpServers": {
    "Jupiter-MCP": {
      "command": "node",
      "args": ["path/to/jupiter-mcp/server/index.js"],
      "env": {
        "SOLANA_RPC_URL": "solana rpc url you can access",
        "PRIVATE_KEY": "your private key"
      }
    }
  }
}
```

## Tools

### Ultra API Tools
- **`get-ultra-order`**:
  - **Description**: Fetches a swap order from Jupiter's Ultra API, leveraging both DEX routing and RFQ for optimal pricing.
  - **Inputs**: 
    - `inputMint`: Input token mint address (e.g., SOL or token pubkey).
    - `outputMint`: Output token mint address (e.g., USDC or token pubkey).
    - `amount`: Input amount as a string (e.g., "1.23").
    - `slippageBps`: Slippage tolerance in basis points (e.g., 50 for 0.5%).
  - **Output**: JSON with `requestId`, `transaction` (base64-encoded), `inputMint`, `outputMint`, `inAmount`, `outAmount`, `price`.

- **`execute-ultra-order`**:
  - **Description**: Requests Jupiter to execute the swap transaction on behalf of the wallet owner, handling slippage, priority fees, and transaction landing.
  - **Inputs**: 
    - `requestId`: Unique identifier from `get-ultra-order`.
    - `transaction`: Base64-encoded transaction from `get-ultra-order`.
  - **Output**: JSON with `status`, `transactionId`, `slot`, `inputAmountResult`, `outputAmountResult`, `swapEvents`.

## Example Interaction

Below are examples of interacting with the server using natural language prompts and expected responses:

### Fetching a Swap Order
- **Prompt**: "Get a swap order to trade 1.23 SOL for USDC."
- **Input**: 
  - Tool: `get-ultra-order`
  - Arguments: 
    - `inputMint`: "So11111111111111111111111111111111111111112" (SOL)
    - `outputMint`: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" (USDC)
    - `amount`: "1.23"
- **Response**:
  ```
  {
    "requestId": "a770110b-82c9-46c8-ba61-09d955b27503",
    "transaction": "AQAAAA...base64-encoded-transaction...==",
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "inAmount": "1230000000",
    "outAmount": "19950000",
    "price": 0.01621951219512195
  }
  ```

### Executing a Swap
- **Prompt**: "Execute the swap order with request ID 'a770110b-82c9-46c8-ba61-09d955b27503' using the transaction provided."
- **Input**: 
  - Tool: `execute-ultra-order`
  - Arguments: 
    - `requestId`: "a770110b-82c9-46c8-ba61-09d955b27503"
    - `transaction`: "AQAAAA...base64-encoded-transaction...=="
- **Response**:
  ```
  {
    "status": "Success",
    "transactionId": "5x...solana-transaction-signature...",
    "slot": 299283763,
    "inputAmountResult": "1230000000",
    "outputAmountResult": "19950000",
    "swapEvents": [
      {
        "type": "swap",
        "inputMint": "So11111111111111111111111111111111111111112",
        "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "inAmount": "1230000000",
        "outAmount": "19950000"
      }
    ]
  }
  ```


## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.


