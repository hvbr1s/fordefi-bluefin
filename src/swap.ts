import { swapAssets } from './operations/create_swap';
import { SuiClient } from "@firefly-exchange/library-sui";
import dotenv from 'dotenv';

dotenv.config();
const accessToken = process.env.FORDEFI_API_USER_TOKEN ?? "";

// Initialize SUI client with mainnet endpoint
const client = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

async function main() {

  const fordefiConfig = {
    accessToken: accessToken,
    privateKeyPath: "./fordefi_secret/private.pem",
    vaultId: "0bbd4f4b-dcb0-47f0-a1a9-4a09614cd8c2",
    network: "mainnet" as const,
    senderAddress:"0x70dfa34773429dc83d4b56866acb595471d3d7d79e3fbce035c0179d0617492c" // Your Fordefi SUI Vault address
  };
  // Swap parameters
  const swapParams = {
    poolId: "0xa701a909673dbc597e63b4586ace6643c02ac0e118382a78b9a21262a4a2e35d", // Bluefin Pool ID for SUI/USDC
    amount: 1_000_000_000, // Amount to swap (1 SUI = 1_000_000_000 MIST)
    aToB: true,            // Direction: true = SUI to USDC
    byAmountIn: true       // byAmountIn: true = amount specified is the input amount
  };

  try {
    console.log("Starting swap operation...");
    console.log(`Pool ID: ${swapParams.poolId}`);
    console.log(`Amount: ${swapParams.amount}`);
    console.log(`Direction: ${swapParams.aToB ? 'SUI to USDC' : 'USDC to SUI'}`);
    console.log(`By amount in: ${swapParams.byAmountIn ? 'Yes' : 'No'}`);
    
    await swapAssets(
      swapParams.poolId,
      swapParams.amount,
      swapParams.aToB,
      swapParams.byAmountIn,
      fordefiConfig.accessToken,
      fordefiConfig.vaultId,
      fordefiConfig.senderAddress,
      client
    );

    console.log("Swap completed successfully!");
  } catch (error) {
    console.error("Error executing swap:", error);
  }
}

main();