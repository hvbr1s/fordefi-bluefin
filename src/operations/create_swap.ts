import { QueryChain } from "@firefly-exchange/library-sui/dist/src/spot";
import { SuiClient } from "@firefly-exchange/library-sui";
import { Transaction } from "@mysten/sui/transactions";
import { signWithApiSigner } from "../signing/signer";
import { formRequest } from "../api_request/form_request";
import { createAndSignTx } from "../api_request/pushToApi";
import dotenv from "dotenv";

// Load Fordefi secrets
dotenv.config();
const accessToken = process.env.FORDEFI_API_USER_TOKEN ?? "";

// Initialize SUI client with mainnet endpoint
const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });
// Fordefi vault address on the Sui blockchain
const suiFordefiVault = "0x70dfa34773429dc83d4b56866acb595471d3d7d79e3fbce035c0179d0617492c"

/**
 * Execute a token swap on Bluefin DEX using the Fordefi custody service
 * 
 * @param poolID - The ID of the Bluefin liquidity pool to use for the swap
 * @param amount - The amount to swap (in smallest unit of the coin)
 * @param aToB - Direction of the swap:
 *               - true: swap from coin A to coin B
 *               - false: swap from coin B to coin A
 * @param byAmountIn - How to interpret the amount parameter:
 *                    - true: amount is the input amount to swap
 *                    - false: amount is the expected output amount
 */
export async function swapAssets(
  poolID: string,
  amount: number,
  aToB: boolean,
  byAmountIn: boolean
) {
  // 1. Fetch available SUI coins in the vault (need at least 2: one for swap, one for gas)
  let myCoins = await client.getCoins({
    owner: suiFordefiVault,
    coinType: "0x2::sui::SUI",
  });
  console.log(myCoins.data)

  // 2. Select specific coin objects for the transaction
  //    First coin will be used for the actual swap amount
  //    Second coin will be used to pay for transaction gas
  const coinForSwap = myCoins.data[0];
  console.log("DEBUG - Coin for swap -> ", coinForSwap)
  const coinForGas = myCoins.data[1];
  console.log("DEBUG - Coin for gas -> ", coinForGas)

  // 3. Query the pool details to get information about the trading pair
  const qc = new QueryChain(client);
  const poolState = await qc.getPool(poolID);
  console.log("DEBUG - PoolState: ", poolState);

  // 4. Build the swap transaction
  const tx = new Transaction();

  // Set transaction parameters
  tx.setSender(suiFordefiVault);    // The address initiating the transaction
  tx.setGasOwner(suiFordefiVault)   // The address paying for gas
  tx.setGasBudget(10_000_000);      // Maximum gas allowed for this transaction
  tx.setGasPrice(1000);             // Price per gas unit in MIST (Sui's smallest unit)
  
  // Specify which coin object pays for gas
  tx.setGasPayment([
    {
      objectId: coinForGas.coinObjectId,
      digest: coinForGas.digest,
      version: coinForGas.version,
    },
  ]);

  // 5. Extract coin types from pool state
  const coinA = poolState.coin_a.address
  const coinB = poolState.coin_b.address
  
  // 6. Prepare arguments for the swap based on direction (A→B or B→A)
  let coinAArg;
  let coinBArg;
  if (aToB) {
    // For A→B swap: Use our SUI coin for A, create empty B coin to receive
    coinAArg = tx.object(coinForSwap.coinObjectId);
    coinBArg = tx.moveCall({
      package: "0x2",
      module: "coin",
      function: "zero",
      typeArguments: [coinB],
      arguments: [],
    });
    console.log("Coin B arguments -> ", coinBArg)
  } else {
    // For B→A swap: Create empty A coin to receive, use our SUI coin for B
    coinAArg = tx.moveCall({
      package: "0x2",
      module: "coin",
      function: "zero",
      typeArguments: [coinA],
      arguments: [],
    });
    coinBArg = tx.object(coinForSwap.coinObjectId);
  }
  
  // 7. Construct the swap function call
  tx.moveCall({
    // Bluefin DEX package ID
    package: "0x6c796c3ab3421a68158e0df18e4657b2827b1f8fed5ed4b82dba9c935988711b",
    module: "gateway",
    function: "swap_assets",
    arguments: [
      // Sui system clock object - required for time-based operations
      tx.object("0x6"),
      // Bluefin global configuration object
      tx.object("0x03db251ba509a8d5d8777b6338836082335d93eecbdd09a11e190a1cff51c352"),
      // The specific liquidity pool we're using for this swap
      tx.object(poolID),
      // Coin A - either our coin or an empty receiver depending on swap direction
      coinAArg,
      // Coin B - either our coin or an empty receiver depending on swap direction
      coinBArg,
      // Direction of swap (A→B or B→A)
      tx.pure.bool(aToB),
      // Whether amount specifies input amount or expected output
      tx.pure.bool(byAmountIn),
      // The amount to swap (in smallest unit of the coin)
      tx.pure.u64(amount),
      // Minimum amount to receive (slippage protection)
      tx.pure.u64(1_000_000),
      // Maximum allowed sqrt price after the swap (price impact protection)
      // For A→B swaps, this should be **lower** than current sqrt price
      tx.pure.u128("5295032834")
    ],
    // The specific coin types involved in this swap
    typeArguments: [
      coinA, // In this case: 0x2::sui::SUI
      coinB  // In this case: 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC
    ]
  });
  console.log("DEBUG - Transaction before BCS -> ", tx.getData())
  
  // 8. Serialize the transaction to binary format (BCS)
  const bcsData = await tx.build({ client });
  // Convert binary data to base64 for Fordefi API
  const base64TxData = Buffer.from(bcsData).toString("base64");

  // 9. Prepare request body for Fordefi custody service
  const fordefiVault = "0bbd4f4b-dcb0-47f0-a1a9-4a09614cd8c2"; // Vault ID in Fordefi
  const requestBody = JSON.stringify(await formRequest(fordefiVault, base64TxData));

  // 10. Create signature for Fordefi API authentication
  const pathEndpoint = "/api/v1/transactions/create-and-wait";
  const timestamp = new Date().getTime();
  const payload = `${pathEndpoint}|${timestamp}|${requestBody}`;
  const signature = await signWithApiSigner(payload);

  // 11. Submit the transaction to Fordefi API and wait for result
  const response = await createAndSignTx(pathEndpoint, accessToken, signature, timestamp, requestBody);
  const fordDefiResult = response.data;
  console.log(fordDefiResult)

  // 12. Verify transaction success
  const sig = fordDefiResult.signatures[0];
  if (!sig) {
    throw new Error("Signature not returned from Fordefi!");
  }
  console.log("Transaction completed! ✅");
}

// // Example usage of the swap function
// swapAssets(
//   "0xa701a909673dbc597e63b4586ace6643c02ac0e118382a78b9a21262a4a2e35d", // Bluefin Pool ID for SUI/USDC
//   1_000_000_000,  // Amount to swap (5.8 SUI)
//   true,           // Direction: true = SUI to USDC
//   true,           // byAmountIn: true = amount specified is the input amount
// ).catch((err) => console.error("Error:", err));