import { Transaction as TransactionBlock } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import * as classes_1 from "@firefly-exchange/library-sui/dist/src/classes";
import { signWithApiSigner } from "../signing/signer";
import { formRequest } from "../api_request/form_request";
import { createAndSignTx } from "../api_request/pushToApi";

const suiClient = new SuiClient({
  url: getFullnodeUrl("mainnet"),
});

const config = {
  GlobalConfig:
    "0x03db251ba509a8d5d8777b6338836082335d93eecbdd09a11e190a1cff51c352",
  ProtocolFeeCap:
    "0x55697473304e901372020f30228526c4e93558b23259d90bc6fdddedf83295d2",
  Display: "0x5f34ee74e113d74ae9546695af6e6d0fde51731fe8d9a71309f8e66b725d54ab",
  AdminCap:
    "0xc5e736b21175e1f8121d58b743432a39cbea8ee23177b6caf7c2a0aadba8d8b9",
  UpgradeCap:
    "0xd5b2d2159a78030e6f07e028eb75236693ed7f2f32fecbdc1edb32d3a2079c0d",
  Publisher:
    "0xd9810c5d1ec5d13eac8a70a059cc0087b34d245554d8704903b2492eebb17767",
  BasePackage:
    "0x3492c874c1e3b3e2984e8c41b589e642d4d0a5d6459e5a9cfc2d52fd7c89c267",
  CurrentPackage:
    "0x6c796c3ab3421a68158e0df18e4657b2827b1f8fed5ed4b82dba9c935988711b",
  Operators: {
    Admin: "0x37a8d55f29e5b4bdba0cb3fe0ba51a93db8c868fe0de649e1bf36bb42ea7d959",
  },
  Pools: [
    {
      id: "0x3b585786b13af1d8ea067ab37101b6513a05d2f90cfe60e8b1d9e1b46a63c4fa",
      coinA:
        "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
      coinB:
        "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      coinADecimals: 9,
      coinBDecimals: 6,
      name: "SUI-USDC",
      fee: 2000,
      tickSpacing: 40,
    },
  ],
};
  
function asUintN(int: any, bits = 32) {
  return BigInt.asUintN(bits, BigInt(int)).toString();
}

function _openPositionInternal(
  pool: any,
  lowerTick: any,
  upperTick: any,
  options: any
) {
  const txb = options.txb;
  const tickLowerBits = Number(asUintN(BigInt(lowerTick)).toString());
  const tickUpperBits = Number(asUintN(BigInt(upperTick)).toString());
  const [position] = txb.moveCall({
    arguments: [
      txb.object(config.GlobalConfig),
      txb.object(pool.id),
      txb.pure.u32(tickLowerBits),
      txb.pure.u32(tickUpperBits),
    ],
    target: `${config.CurrentPackage}::pool::open_position`,
    typeArguments: [pool.coin_a.address, pool.coin_b.address],
  });
  return { txb, position };
}

async function _provideLiquidityFixedAmountInternal(
  senderAddress: string,
  pool: any,
  position: any,
  liquidityInput: any,
  options: any
) {
  const txb = options.txb;
  const sender = `0x70dfa34773429dc83d4b56866acb595471d3d7d79e3fbce035c0179d0617492c`
  const [amountAMax, amountBMax] = liquidityInput.fix_amount_a
    ? [liquidityInput.coinAmount, liquidityInput.tokenMaxB]
    : [liquidityInput.tokenMaxA, liquidityInput.coinAmount];
  const amount = liquidityInput.coinAmount;
  const [splitCoinA, mergeCoinA] =
    await classes_1.CoinUtils.createCoinWithBalance(
      suiClient,
      txb,
      amountAMax.toString(),
      pool.coin_a.address,
      senderAddress
    );
  const [splitCoinB, mergeCoinB] =
    await classes_1.CoinUtils.createCoinWithBalance(
      suiClient,
      txb,
      amountBMax.toString(),
      pool.coin_b.address,
      senderAddress
    );
  txb.moveCall({
    arguments: [
      txb.object(SUI_CLOCK_OBJECT_ID),
      txb.object(config.GlobalConfig),
      txb.object(pool.id),
      txb.object(position),
      txb.object(splitCoinA),
      txb.object(splitCoinB),
      txb.pure.u64(amount.toString()),
      txb.pure.u64(amountAMax.toString()),
      txb.pure.u64(amountBMax.toString()),
      txb.pure.bool(liquidityInput.fix_amount_a),
    ],
    target: `${config.CurrentPackage}::gateway::provide_liquidity_with_fixed_amount`,
    typeArguments: [pool.coin_a.address, pool.coin_b.address],
  });
  // merge the remaining coins and send them all back to user
  const coins: any[] = [];
  [mergeCoinA, mergeCoinB].forEach((item) => {
    if (item) {
      coins.push(item);
    }
  });
  if (coins.length > 0) {
    txb.transferObjects(coins, sender);
  }
  return txb;
}

export async function openPositionWithFixedAmount(
  pool: any,
  lowerTick: any,
  upperTick: any,
  params: any,
  fordefiConfig: {
    accessToken: string;
    privateKeyPath: string;
    vaultId: string;
    network: "mainnet" | "testnet";
    senderAddress: string;
  }
) {
  let txb = new TransactionBlock();
  const result = _openPositionInternal(pool, lowerTick, upperTick, {
    txb,
  });
  txb = result.txb;
  const position = result.position;
  txb = await _provideLiquidityFixedAmountInternal(fordefiConfig.senderAddress, pool, position, params, {
    txb,
  });

  const senderAddress = fordefiConfig.senderAddress || "";

  txb.transferObjects([position], senderAddress);
  txb.setGasBudget(100000000);
  txb.setSender(senderAddress);

  console.log("Using sender address:", senderAddress);

  const bcsData = await txb.build({ client: suiClient });
  const bcsBase64 = Buffer.from(bcsData).toString("base64");

  // 9. Prepare request body for Fordefi custody service
  const fordefiVault = fordefiConfig.vaultId; // Vault ID in Fordefi
  const requestBody = JSON.stringify(await formRequest(fordefiVault, bcsBase64));

  // 10. Create signature for Fordefi API authentication
  const pathEndpoint = "/api/v1/transactions/create-and-wait";
  const timestamp = new Date().getTime();
  const payload = `${pathEndpoint}|${timestamp}|${requestBody}`;
  const signature = await signWithApiSigner(payload);

  try {
    const response = await createAndSignTx(pathEndpoint, fordefiConfig.accessToken, signature, timestamp, requestBody);
    
    console.log("Response received:", Object.keys(response));
    
    if (!response || !response.data) {
      throw new Error("Invalid response received from Fordefi API");
    }

    const fordDefiResult = response.data;
    console.log(fordDefiResult)

    const sig = fordDefiResult?.signatures?.[0];
    if (!sig) {
      throw new Error("Signature not returned from Fordefi!");
    }
    console.log("Transaction completed! ✅");
    
  } catch (error) {
    console.error("Error processing Fordefi transaction:", error);
    throw error; 
  }

}