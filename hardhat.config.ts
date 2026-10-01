import { defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import hardhatDeploy from 'hardhat-deploy';
import { HDNodeWallet } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

// The local stand node (`npx hardhat node`) keeps the built-in dev accounts
// (backend e2e tests sign with indexes 0..8) and additionally unlocks the
// bscTestnet deployer/signer keys from .env, so tests and scripts can send
// transactions from them — the deployer holds the stand PLATFORM/HOLD supply
// on the forked testnet state.
const DEV_MNEMONIC = 'test test test test test test test test test test test junk';
const DEV_ACCOUNT_BALANCE = '1000000000000000000000000000'; // 1e9 BNB each
const devAccounts = Array.from({ length: 20 }, (_, i) => ({
  privateKey: HDNodeWallet.fromPhrase(DEV_MNEMONIC, '', `m/44'/60'/0'/0/${i}`).privateKey,
  balance: DEV_ACCOUNT_BALANCE,
}));
const envAccounts = [process.env.DEPLOYER, process.env.SIGNER_1, process.env.SIGNER_2, process.env.SIGNER_3]
  .filter((privateKey): privateKey is string => typeof privateKey === 'string' && privateKey.length > 0)
  .map((privateKey) => ({ privateKey, balance: DEV_ACCOUNT_BALANCE }));

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, hardhatDeploy],
  solidity: {
    profiles: {
      default: {
        version: '0.8.28',
        settings: {
          evmVersion: 'cancun',
          optimizer: {
            enabled: true,
            runs: 200,
            details: {
              yul: true,
            },
          },
          viaIR: true,
        },
      },
      production: {
        version: '0.8.28',
        settings: {
          evmVersion: 'cancun',
          optimizer: {
            enabled: true,
            runs: 200,
            details: {
              yul: true,
            },
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    // The `default` network is the one used by in-process tasks (like `hardhat test`).
    // It is an EDR-simulated chain forked from bscTestnet.
    default: {
      type: 'edr-simulated',
      chainId: 1337,
      chainType: 'l1',
      allowBlocksWithSameTimestamp: true,
      accounts: {
        count: 10,
        accountsBalance: '1000000000000000000000000000',
      },
      forking: {
        url: 'https://bsc-testnet-rpc.publicnode.com',
      },
    },
    // Local development node for the backend e2e stand (npx hardhat node).
    // chainId 97 matches the backend scanner and e2e tests; forking provides the
    // live testnet USDT mock referenced by Config; interval mining keeps the chain
    // head growing so scanner confirmations mature even without traffic.
    node: {
      type: 'edr-simulated',
      chainId: 97,
      chainType: 'l1',
      allowBlocksWithSameTimestamp: true,
      mining: {
        auto: true,
        interval: 1000,
      },
      forking: {
        url: 'https://bsc-testnet-rpc.publicnode.com',
        // blockNumber: 134141910
      },
      accounts: [...devAccounts, ...envAccounts],
    },
    bscTestnet: {
      type: 'http',
      chainType: 'l1',
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      chainId: 97,
      gasPrice: 10000000000, // 10 gwei
      accounts: [
        process.env.DEPLOYER!,
        process.env.SIGNER_1!,
        process.env.SIGNER_2!,
        process.env.SIGNER_3!,
      ],
    },
  },
  chainDescriptors: {
    97: {
      name: 'bscTestnet',
      chainType: 'l1',
      hardforkHistory: {
        berlin: { blockNumber: 31103030 },
        london: { blockNumber: 31103030 },
        shanghai: { timestamp: 1702972800 },
        cancun: { timestamp: 1713330442 },
      },
    },
  },
  typechain: {
    outDir: 'typechain-types',
    tsNocheck: true,
  },
});
