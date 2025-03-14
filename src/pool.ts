import { openPositionWithFixedAmount } from './operations/create_pool';
import dotenv from 'dotenv';

dotenv.config();
const accessToken = process.env.FORDEFI_API_USER_TOKEN ?? "";

async function main() {

  // Pool params
  const pool = {
    id: "0x3b585786b13af1d8ea067ab37101b6513a05d2f90cfe60e8b1d9e1b46a63c4fa",
    coin_a: {
      address: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI"
    },
    coin_b: {
      address: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"
    }
  };

  // Price range
  const lowerTick = -100000; 
  const upperTick = 100000;  

  // Liquidity params
  const liquidityParams = {
    fix_amount_a: true, 
    coinAmount: "1000", // Amount of the fixed token
    tokenMaxA: "1000", // Max amount of token A to use (if fix_amount_a is false)
    tokenMaxB: "1000"  // Max amount of token B to use (if fix_amount_a is true)
  };


  const fordefiConfig = {
    accessToken: accessToken,
    privateKeyPath: "./fordefi_secret/private.pem",
    vaultId: "0bbd4f4b-dcb0-47f0-a1a9-4a09614cd8c2",
    network: "mainnet" as const,
    senderAddress:"0x70dfa34773429dc83d4b56866acb595471d3d7d79e3fbce035c0179d0617492c"
  };

  try {

    const result = await openPositionWithFixedAmount(
      pool,
      lowerTick,
      upperTick,
      liquidityParams,
      fordefiConfig
    );

    console.log("Transaction result:", result);
  } catch (error) {
    console.error("Error opening position:", error);
  }
}

main();