import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
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

  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6'
  }
};

export default config;
