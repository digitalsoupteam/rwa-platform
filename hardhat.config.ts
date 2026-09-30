import { defineConfig } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import hardhatDeploy from 'hardhat-deploy';
import * as dotenv from 'dotenv';

dotenv.config();

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
