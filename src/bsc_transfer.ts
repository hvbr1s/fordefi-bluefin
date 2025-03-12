import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { signWithApiSigner } from './signing/signer';
import { formRequest } from './api_request/form_request';
import { createAndSignTx } from './api_request/pushToApi';

// Load environment vars (for FORDEFI_API_USER_TOKEN)
import dotenv from 'dotenv';
dotenv.config();
const accessToken = process.env.FORDEFI_API_USER_TOKEN ?? "";

const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
const tx = new Transaction();

// This is the address of the vault used to create this transaction
tx.setSender('0x70dfa34773429dc83d4b56866acb595471d3d7d79e3fbce035c0179d0617492c');

// These are optional gas budget and price values. 
// They are not required if you'd like Fordefi to compute them for you.
tx.setGasBudget(10000000); // 0.01 SUI
tx.setGasPrice(1000);

const [coin] = tx.splitCoins(tx.gas, [1000]); // amount of MIST to send 1 SUI = 10^9 (1 billion) MIST
tx.transferObjects([coin], '0xf18d01b1d2cd856f53bad11e157fa58b858700263219df0e7d0e2e8c8366645b');
console.log(tx.getData(), tx.getData.toString())

async function main() {

    // Build BSC Data for Tx
    const bcsData = await tx.build({ client });

    // Base64 encode the bcsData
    const base64EncodedData = Buffer.from(bcsData).toString('base64');

    // Prepare the JSON request body
    const fordefiVault = "0bbd4f4b-dcb0-47f0-a1a9-4a09614cd8c2"; // Fordefi SUI vault ID
    const requestBody = JSON.stringify(await formRequest(fordefiVault, base64EncodedData));

    const pathEndpoint = '/api/v1/transactions/create-and-wait';
    const timestamp = new Date().getTime();
    const payload = `${pathEndpoint}|${timestamp}|${requestBody}`;

    const signature = await signWithApiSigner(payload);

    // Call Fordefi
    const response = await createAndSignTx(pathEndpoint, accessToken, signature, timestamp, requestBody);
    const fordDefiResult = await response.data;

    const sig = fordDefiResult.signatures[0];
    if (!sig) {
      throw new Error('Signature not returned from Fordefi!');
    }
    console.log('Transaction completed! ✅')

}

main().catch(console.error);
