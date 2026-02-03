---
name: flaunch
description: "Launch memecoins on Base via Flaunch. Use gasless API for simple launches or Zap contracts for custom fee distribution. Agents control 100% of fee revenue through treasury managers."
homepage: https://flaunch.gg
metadata:
  openclaw:
    emoji: "🚀"
    requires:
      env:
        - FLAUNCH_CREATOR_ADDRESS
    primaryEnv: FLAUNCH_CREATOR_ADDRESS
---

# Flaunch - Memecoin Launchpad for AI Agents

Flaunch is a token launchpad on Base that gives creators **100% control over fee revenue**. Unlike other launchpads, Flaunch lets you deploy custom treasury manager contracts to distribute fees however you want: staking rewards, buybacks, revenue splits, or entirely novel mechanisms.

## Why Flaunch for Agents?

- **100% Fee Control**: You own all fee revenue. No protocol take from creator earnings.
- **Programmable Treasury**: Deploy custom manager contracts for any fee distribution logic.
- **Built-in Managers**: Use pre-built managers for splits, staking, buybacks.
- **Premine Support**: Buy tokens at launch for liquidity.
- **Gasless API**: Simple HTTP API for quick launches without wallet management.

## Two Paths to Launch

| Path            | Use Case                                   | Complexity | Wallet Needed |
| --------------- | ------------------------------------------ | ---------- | ------------- |
| **Gasless API** | Quick launches, no wallet needed           | Simple     | No            |
| **Flaunch SDK** | Programmatic control, premine, custom fees | Moderate   | Yes           |

> **Note**: The SDK internally uses FlaunchZap contracts. Use the SDK rather than raw contract calls for best results.

---

## Path 1: Gasless API (Simple)

The gasless API at `web2-api.flaunch.gg` handles everything server-side. No wallet or ETH required.

Default parameters for gasless launches:

- **Starting market cap**: $10k
- **Fee split**: 80% dev / 20% community
- **Protocol fees**: None

### Step 1: Upload Token Image

```bash
curl -X POST https://web2-api.flaunch.gg/api/v1/upload-image \
  -H "Content-Type: application/json" \
  -d '{
    "base64Image": "data:image/jpeg;base64,/9j/4AAQSkZJRgAB..."
  }'
```

Response:

```json
{
  "success": true,
  "ipfsHash": "QmX7UbPKJ7Drci3y6p6E8oi5TpUiG7NH3qSzcohPX9Xkvo",
  "tokenURI": "ipfs://QmX7UbPKJ7Drci3y6p6E8oi5TpUiG7NH3qSzcohPX9Xkvo",
  "nsfwDetection": null
}
```

Rate limit: 4 uploads per minute per IP.

### Step 2: Launch Memecoin

Use `/api/v1/base/launch-memecoin` for mainnet or `/api/v1/base-sepolia/launch-memecoin` for testnet:

```bash
# For Base mainnet:
curl -X POST https://web2-api.flaunch.gg/api/v1/base/launch-memecoin \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Awesome Coin",
    "symbol": "MAC",
    "description": "A fun memecoin powered by Flaunch",
    "imageIpfs": "QmX7UbPKJ7Drci3y6p6E8oi5TpUiG7NH3qSzcohPX9Xkvo",
    "websiteUrl": "https://example.com",
    "discordUrl": "https://discord.gg/example",
    "twitterUrl": "https://x.com/example",
    "telegramUrl": "https://t.me/example",
    "creatorAddress": "0x498E93Bc04955fCBAC04BCF1a3BA792f01Dbaa96"
  }'

# For Base Sepolia testnet:
curl -X POST https://web2-api.flaunch.gg/api/v1/base-sepolia/launch-memecoin \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Awesome Coin",
    "symbol": "MAC",
    "description": "A fun memecoin powered by Flaunch",
    "imageIpfs": "QmX7UbPKJ7Drci3y6p6E8oi5TpUiG7NH3qSzcohPX9Xkvo",
    "creatorAddress": "0x498E93Bc04955fCBAC04BCF1a3BA792f01Dbaa96"
  }'
```

Response:

```json
{
  "success": true,
  "message": "Memecoin launch request queued",
  "jobId": "23209",
  "queueStatus": {
    "position": 0,
    "waitingJobs": 0,
    "activeJobs": 1,
    "estimatedWaitSeconds": 0
  },
  "privy": {
    "type": "wallet",
    "address": "0x498E93Bc04955fCBAC04BCF1a3BA792f01Dbaa96"
  }
}
```

### Step 3: Check Launch Status

Poll the status endpoint with your `jobId`:

```bash
curl https://web2-api.flaunch.gg/api/v1/launch-status/23209
```

Response when pending:

```json
{
  "success": true,
  "state": "waiting",
  "queuePosition": 2,
  "estimatedWaitTime": 120
}
```

Response when complete:

```json
{
  "success": true,
  "state": "completed",
  "queuePosition": 0,
  "estimatedWaitTime": 0,
  "transactionHash": "0xefebe9769e4cb44c40cd5a1785b1f26dc66b47c2d3caa369fb75cad055b89348",
  "collectionToken": {
    "address": "0xe9c1d0294e9507d8913784e888235c9f678f8ee2",
    "imageIpfs": "QmQWinjqfyqhdQZrsaL95DyJ8ozYwg1MgjnHmimvz36B8b",
    "name": "OpenClaw Test Coin",
    "symbol": "OCTEST",
    "tokenURI": "ipfs://QmRwn8gbQgCYDWoWyeJW9R6z3tNmLKngR7w7G3AZuoD9GH",
    "creator": "0x498E93Bc04955fCBAC04BCF1a3BA792f01Dbaa96"
  }
}
```

---

## Path 2: Flaunch SDK (Programmatic)

For more control, use the TypeScript SDK with viem:

```bash
npm install @flaunch/sdk viem
```

```typescript
import { createFlaunch } from "@flaunch/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Read-only SDK (no wallet needed)
const publicClient = createPublicClient({
  chain: baseSepolia, // or `base` for mainnet
  transport: http(),
});
const readSdk = createFlaunch({ publicClient });

// Check if a coin is valid
const isValid = await readSdk.isValidCoin("0x...");
const version = await readSdk.getCoinVersion("0x...");

// Read-write SDK (requires wallet)
const walletClient = createWalletClient({
  account: privateKeyToAccount("0x..."), // Your private key
  chain: baseSepolia,
  transport: http(),
});
const sdk = createFlaunch({ publicClient, walletClient });

// Launch a memecoin via FlaunchZap
const txHash = await sdk.readWriteFlaunchZap.flaunch({
  name: "Agent Coin",
  symbol: "AGENT",
  tokenUri: "ipfs://Qm...", // Use IPFS hash from image upload
  fairLaunchPercent: 0, // SDK requires 0 (protocol supports fair launch via direct contract)
  fairLaunchDuration: 0, // SDK requires 0 (protocol supports fair launch via direct contract)
  initialMarketCapUSD: 10000, // $10k starting mcap
  creator: "0x...", // Your wallet address
  creatorFeeAllocationPercent: 20, // 20% of BidWall fees
});
console.log("TX Hash:", txHash);

// Wait for confirmation and find token address
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log("Status:", receipt.status); // "success"

// Verify the new token
for (const log of receipt.logs) {
  const isValid = await readSdk.isValidCoin(log.address);
  if (isValid) {
    console.log("New Token:", log.address);
    break;
  }
}

// Launch with treasury manager (revenue split)
const txHashWithManager = await sdk.readWriteFlaunchZap.flaunchWithSplitManager({
  name: "Split Token",
  symbol: "SPLIT",
  tokenUri: "ipfs://Qm...",
  fairLaunchPercent: 0, // SDK requires 0
  fairLaunchDuration: 0, // SDK requires 0
  initialMarketCapUSD: 10000,
  creator: "0x...",
  creatorFeeAllocationPercent: 20,
  creatorSplitPercent: 10, // 10% to creator
  managerOwnerSplitPercent: 5, // 5% to manager owner
  splitReceivers: [
    // Remaining 85% split
    { address: "0xAddr1...", percent: 50 },
    { address: "0xAddr2...", percent: 50 },
  ],
});
```

---

## FlaunchZap Contract Reference

The SDK internally calls FlaunchZap contracts. For reference, here's the underlying structure:

### FlaunchParams Structure

```solidity
struct FlaunchParams {
    string name;                    // Token name
    string symbol;                  // Token symbol
    string tokenUri;                // IPFS metadata URI
    uint initialTokenFairLaunch;    // SDK requires 0 (protocol supports fair launch)
    uint fairLaunchDuration;        // SDK requires 0 (protocol supports fair launch)
    uint premineAmount;             // Tokens creator buys at launch (e.g., 5e27 = 5%)
    address creator;                // Receives ERC721 + premined tokens
    uint24 creatorFeeAllocation;    // Fee share (2dp: 2000 = 20%)
    uint flaunchAt;                 // Launch timestamp (0 = immediate)
    bytes initialPriceParams;       // Initial market cap (e.g., abi.encode(10_000e6) = $10k)
    bytes feeCalculatorParams;      // Fee calculator params (usually abi.encode(0))
}
```

> **Recommendation**: Use the SDK's `readWriteFlaunchZap.flaunch()` method rather than calling contracts directly. The SDK handles parameter encoding and fee calculation automatically.

---

## Treasury Managers - The Power Feature

When you launch on Flaunch, you receive an ERC721 that represents ownership of the token's fee stream. By default, fees go to the ERC721 holder. But with **treasury managers**, you can program complex fee distribution logic.

### Why This Matters for Agents

- Create staking pools where holders earn from trading fees
- Implement automatic buyback programs
- Split revenue between team members, DAOs, or causes
- Build gamified incentives and competitions
- **More flexibility than any other launchpad**

### Available Managers

| Manager                      | Description                                                   |
| ---------------------------- | ------------------------------------------------------------- |
| `AddressFeeSplitManager`     | Split fees between fixed addresses with immutable percentages |
| `BuyBackManager`             | Route fees to BidWall for automatic token buybacks            |
| `StakingManager`             | Let users stake ERC20 tokens to earn fee revenue              |
| `RevenueManager`             | Simple creator + protocol fee split                           |
| `ERC721OwnerFeeSplitManager` | Split based on NFT ownership                                  |

### Deploying a Manager

Use the `TreasuryManagerFactory` to deploy managers:

```solidity
// Build recipient shares array (must sum to 100%)
AddressFeeSplitManager.RecipientShare[] memory recipientShares = 
    new AddressFeeSplitManager.RecipientShare[](2);
recipientShares[0] = AddressFeeSplitManager.RecipientShare({
    recipient: addr1,
    share: 50_00000   // 50% of split share
});
recipientShares[1] = AddressFeeSplitManager.RecipientShare({
    recipient: addr2,
    share: 50_00000   // 50% of split share
});

// Deploy an AddressFeeSplitManager
address manager = treasuryManagerFactory.deployAndInitializeManager(
    addressFeeSplitManagerImpl,
    owner,
    abi.encode(
        AddressFeeSplitManager.InitializeParams({
            creatorShare: 10_00000,   // 10% to token creators
            ownerShare: 5_00000,      // 5% to manager owner
            recipientShares: recipientShares  // remaining 85% split per shares above
        })
    )
);
```

### Manager Fee Breakdown

All managers support three fee tiers:

1. **Creator Share**: Goes to the address that deposited the token
2. **Owner Share**: Goes to the manager owner (you)
3. **Split Share**: Distributed per manager logic (staking, addresses, buyback)

Shares use 5 decimal places: `100_00000` = 100%

### BuyBackManager Example

Route trading fees into automatic token buybacks:

```solidity
BuyBackManager.InitializeParams({
    creatorShare: 10_00000,     // 10% to creators
    ownerShare: 0,               // 0% to owner
    buyBackPoolKey: poolKey      // Target pool for buybacks
})
```

### StakingManager Example

Let community members stake tokens to earn fees:

```solidity
StakingManager.InitializeParams({
    stakingToken: tokenAddress,      // Token users stake
    minEscrowDuration: 30 days,      // Lock NFT for 30 days
    minStakeDuration: 7 days,        // Lock stakes for 7 days
    creatorShare: 10_00000,          // 10% to creators
    ownerShare: 5_00000              // 5% to manager owner
})
// Remaining 85% split among stakers proportionally
```

---

## Creating Custom Managers

Extend `TreasuryManager` or `FeeSplitManager` for custom logic:

```solidity
contract MyCustomManager is FeeSplitManager {

    function _initialize(address _owner, bytes calldata _data) internal override {
        // Decode your custom params
        // Set up your distribution logic
    }

    function _deposit(FlaunchToken calldata token, address creator, bytes calldata data) internal override {
        // Handle token deposits
    }

    function balances(address recipient) public view override returns (uint) {
        // Return claimable balance for recipient
    }

    function isValidRecipient(address recipient, bytes memory data) public view override returns (bool) {
        // Define who can claim
    }

    function _captureClaim(address recipient, bytes memory data) internal override returns (uint) {
        // Calculate and record claim amount
    }

    function _dispatchRevenue(address recipient, uint allocation, bytes memory data) internal override {
        // Send fees to recipient
    }
}
```

---

## Contract Addresses

### Base Mainnet (v1.1.5)

| Contract               | Address                                      |
| ---------------------- | -------------------------------------------- |
| PositionManager (1.3)  | `0x23321f11a6d44fd1ab790044fdfde5758c902fdc` |
| Flaunch (1.3)          | `0x516af52d0c629b5e378da4dc64ecb0744ce10109` |
| FlaunchZap             | `0xe52dE1801C10cF709cc8e62d43D783AFe984b510` |
| BidWall                | `0x7f22353d1634223a802D1c1Ea5308Ddf5DD0ef9c` |
| PoolSwap               | `0xdCF8e5E2a21e9B7e37B1B1a6612F1376723dd08e` |
| FeeEscrow              | `0x72e6f7948b1B1A343B477F39aAbd2E35E6D27dde` |
| TreasuryManagerFactory | `0x48af8b28DDC5e5A86c4906212fc35Fa808CA8763` |
| RevenueManager         | `0x1af9B9f168bFd2046f45E0Ce03972864BcE7eE36` |
| AddressFeeSplitManager | `0xf6d8018450109A68acfBCD2523dc43fB31920a7D` |
| StakingManager         | `0xa15F92a7C09a7D6ADbc00FF2DB63e414fBFEA193` |
| Flaunch App            | https://flaunch.gg                           |
| API                    | https://web2-api.flaunch.gg                  |

### Base Sepolia Testnet (v1.1.4)

| Contract                   | Address                                      |
| -------------------------- | -------------------------------------------- |
| PositionManager (1.2)      | `0x4e7cb1e6800a7b297b38bddcecaf9ca5b6616fdc` |
| Flaunch (1.2)              | `0xe2ef58a54ee79dac0d4a130ea58b340124df9438` |
| FlaunchZap                 | `0x312706b6599bb406cb21a91c3314ec7883b014a1` |
| BidWall                    | `0x6f2fa01a05ff8b6efbfefd91a3b85aaf19265a00` |
| PoolSwap                   | `0xB8ed7Dcc436F646999C5A2C8546b9b0ED51CcD01` |
| FeeEscrow                  | `0x73e27908b7d35a9251a54799a8ef4c17e4ed9ff9` |
| TreasuryManagerFactory     | `0xd2f3c6185e06925dcbe794c6574315b2202e9ccd` |
| RevenueManager             | `0x17E02501dE3e420347e7C5fCAe3AD787C5aea690` |
| AddressFeeSplitManager     | `0xf72dcdee692c188de6b14c6213e849982e04069b` |
| StakingManager             | `0x8Ea4074c38cA7a596C740DD9E9D7122ea8E78c3c` |
| ERC721OwnerFeeSplitManager | `0xc98a11e6292bbafb8f55e09a3eef44ba1410a142` |
| Flaunch App                | https://testnet.flaunch.gg                   |

### Uniswap V4 (Base Mainnet)

| Contract         | Address                                      |
| ---------------- | -------------------------------------------- |
| PoolManager      | `0x498581ff718922c3f8e6a244956af099b2652b2b` |
| PositionManager  | `0x7c5f5a4bbd8fd63184577525326123b519429bdc` |
| Quoter           | `0x0d5e0f971ed27fbff6c2837bf31316121532048d` |
| Universal Router | `0x6ff5693b99212da76ad316178a184ab56d299b43` |
| Permit2          | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

---

## Example Use Cases

### 1. Quick Community Token

Use gasless API for instant launch:

```bash
# 1. Upload your token image
curl -X POST https://web2-api.flaunch.gg/api/v1/upload-image \
  -H "Content-Type: application/json" \
  -d '{"base64Image": "data:image/png;base64,..."}'
# Returns: {"ipfsHash": "Qm..."}

# 2. Launch on Base mainnet
curl -X POST https://web2-api.flaunch.gg/api/v1/base/launch-memecoin \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Community Coin",
    "symbol": "COMM",
    "description": "Our community token",
    "imageIpfs": "Qm...",
    "creatorAddress": "0xYourWallet..."
  }'
# Returns: {"jobId": "12345"}

# 3. Check status until completed
curl https://web2-api.flaunch.gg/api/v1/launch-status/12345
# Returns token address when state: "completed"

# 4. Share: https://flaunch.gg/base/coin/0xTokenAddress
```

### 2. Agent-Managed Token with Revenue Split

Deploy AddressFeeSplitManager to split fees:

- 50% to community treasury
- 30% to development fund
- 20% to marketing wallet

### 3. Staking Rewards Program

Deploy StakingManager:

- Users stake your token
- Earn proportional share of all trading fees
- Creates natural holding incentive

### 4. Deflationary Buyback

Deploy BuyBackManager:

- All fees route to BidWall
- Continuous buy pressure on token
- Reduces circulating supply over time

### 5. Gaming/Competition

Create custom manager:

- Track user achievements on-chain
- Distribute fees based on leaderboard position
- Reset competitions periodically

---

## Tips for Agents

1. **Start with gasless API** for quick experiments - no wallet needed
2. **Use SDK** when you need programmatic control with a wallet
3. **Set `fairLaunchPercent: 0`** - SDK requires 0 (protocol supports fair launch via direct contract)
4. **Deploy managers** for sophisticated tokenomics
5. **Test on Base Sepolia** before mainnet
6. **creatorFeeAllocation** caps your max take from BidWall fees (2000 = 20%)
7. **Treasury managers** let you do anything with your fee share
8. **ERC721 ownership** = fee stream ownership (transferable!)
9. **Use SDK over raw contracts** - SDK handles encoding and fees automatically

## Verified Examples

These tokens were launched using this documentation:

| Token                        | Network      | Address                                                                                                                                 | Method      |
| ---------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| OpenClaw Agent Token (CLAW)  | Base Mainnet | [`0xe68d316a665ff9af19cdb5fd2e33fcbb065edce5`](https://flaunch.gg/base/coin/0xe68d316a665ff9af19cdb5fd2e33fcbb065edce5)                 | Gasless API |
| SDK Launch Token (SDKLAUNCH) | Base Sepolia | [`0x5c741fc9a17d06bbf0b9f99cbe7258d0e5cc2536`](https://testnet.flaunch.gg/base-sepolia/coin/0x5c741fc9a17d06bbf0b9f99cbe7258d0e5cc2536) | SDK         |

## Resources

- Flaunch App: https://flaunch.gg
- Documentation: https://docs.flaunch.gg
- SDK: `npm install @flaunch/sdk viem`
- Testnet: https://testnet.flaunch.gg
