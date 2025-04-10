import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'
import { USDT } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('Config')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const addressBook = await get('AddressBook')

  const minTargetAmount = ethers.parseEther('10000') // 10,000 USDT
  const maxTargetAmount = ethers.parseEther('150000') // 150,000 USDT
  const minProfitPercent = 1000 // 10%
  const maxProfitPercent = 2000 // 20%
  const minInvestmentDuration = 30 * 24 * 60 * 60 // 30 days
  const maxInvestmentDuration = 60 * 24 * 60 * 60 // 60 days
  const minRealiseDuration = 180 * 24 * 60 * 60 // 180 days
  const maxRealiseDuration = 360 * 24 * 60 * 60 // 360 days
  const virtualMultiplier = 20
  const minPartialReturn = ethers.parseEther('1000') // 1,000 USDT
  const holdToken = USDT // USDT address
  const createRWAFee = ethers.parseEther('100') // 100 USDT
  const createPoolFee = ethers.parseEther('200') // 200 USDT
  const buyFeePercent = 300 // 3%
  const sellFeePercent = 300 // 3%
  const rwaInitialSupply = 21000000
  const minSignersRequired = 3

  const deployment = await deploy('Config', {
    contract: 'Config',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            addressBook.address,
            minTargetAmount,
            maxTargetAmount,
            minProfitPercent,
            maxProfitPercent,
            minInvestmentDuration,
            maxInvestmentDuration,
            minRealiseDuration,
            maxRealiseDuration,
            virtualMultiplier,
            minPartialReturn,
            holdToken,
            createRWAFee,
            createPoolFee,
            buyFeePercent,
            sellFeePercent,
            rwaInitialSupply,
            minSignersRequired
          ],
        },
      },
    },
  })

  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'setConfig',
    deployment.address
  )
}

deploy.tags = ['Config']
deploy.dependencies = ['Payment']
export default deploy
