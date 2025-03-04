import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import '@openzeppelin/hardhat-upgrades'
import '@typechain/hardhat'
import 'hardhat-deploy'

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
        url: 'https://rpc.ankr.com/bsc',
        blockNumber: 46685208,
      },
      mining: {
        auto: true,
        interval: 0,
        mempool: {
          order: "fifo"
        }
      },
      allowBlocksWithSameTimestamp: true,
      accounts: {
        count: 10,
        accountsBalance: '1000000000000000000000000000',
      },
    },
  },

  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
}

export default config
