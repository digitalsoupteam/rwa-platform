import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import '@openzeppelin/hardhat-upgrades'
import '@typechain/hardhat'
import 'hardhat-deploy'
import "hardhat-gas-reporter"
import * as dotenv from 'dotenv'

dotenv.config()

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
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
  networks: {
    hardhat: {
      chainId: 1337,
      forking: {
        url: 'https://rpc.ankr.com/bsc_testnet_chapel/46ed43307df1caf3e5552edd36e32161b6173775e5c6d08575ad9831af6ecbe8',
        blockNumber: 48831291,
      },
      // mining: {
      //   auto: true,
      //   interval: 0,
      //   mempool: {
      //     order: "fifo"
      //   }
      // },
      allowBlocksWithSameTimestamp: true,
      accounts: {
        count: 10,
        accountsBalance: '1000000000000000000000000000',
      },
    },
    bscTestnet: {
      url: 'https://rpc.ankr.com/bsc_testnet_chapel/46ed43307df1caf3e5552edd36e32161b6173775e5c6d08575ad9831af6ecbe8',
      chainId: 97,
      accounts: [
        process.env.DEPLOYER!,
        process.env.SIGNER_1!,
        process.env.SIGNER_2!,
        process.env.SIGNER_3!,
      ],
      gasPrice: 1000000000,
      verify: {
        etherscan: {
          apiUrl: 'https://api-testnet.bscscan.com',
        },
      },
    },
  },

  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
  gasReporter: {
    enabled: true
  }
}

export default config
