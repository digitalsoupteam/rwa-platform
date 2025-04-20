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

  // Base parameters
  const initialBaseMetadataUri = '127.0.0.1/storage/rwa/metadata'
  const initialMinExpectedHoldAmount = ethers.parseEther('10000') // 10,000 USDT
  const initialMaxExpectedHoldAmount = ethers.parseEther('150000') // 150,000 USDT
  const initialMinRewardPercent = 100 // 1%
  const initialMaxRewardPercent = 10000 // 100%
  const initialMinEntryPeriodDuration = 20 * 60 // 20 minutes (for testing, normally 30 days)
  const initialMaxEntryPeriodDuration = 60 * 24 * 60 * 60 // 60 days
  const initialMinCompletionPeriodDuration = 40 * 60 // 40 minutes (for testing, normally 180 days)
  const initialMaxCompletionPeriodDuration = 360 * 24 * 60 * 60 // 360 days
  const initialVirtualMultiplier = 20
  const initialMinPartialReturn = ethers.parseEther('100') // 100 USDT
  const initialHoldToken = '0x66670d16331dc923Ff095f5B0A658F01e6794216' // USDT address
  const initialMinCreateRWAFee = 100 // 100 USDT
  const initialMaxCreateRWAFee = 1000 // 1000 USDT
  const initialMinCreatePoolFeeRatio = 100 // 1%
  const initialMaxCreatePoolFeeRatio = 1000 // 10%
  const initialEntryFeePercent = 300 // 3%
  const initialExitFeePercent = 300 // 3%
  const initialRwaInitialSupply = 21000000
  const initialMinSignersRequired = 3

  // Speculation pool parameters
  const initialBaseRwaAmount = 1_000_000
  const initialSpeculationHoldMultiplier = 20
  const initialSpeculationRwaMultipliers = [
    6, // [0] 44%
    7, // [1] 36.11%
    8, // [2] 30.61%
    9, // [3] 26.56%
    10, // [4] 23.46%
    11, // [5] 21%
    12, // [6] 19%
    13, // [7] 17.36%
    14, // [8] 15.97%
    15, // [9] 14.79%
    16, // [10] 13.78%
    17, // [11] 12.89%
    19, // [12] 11.42%
    21, // [13] 10.25%
    23, // [14] 9.30%
    26, // [15] 8.16%
    30, // [16] 7.02%
    35, // [17] 5.97%
    41  // [18] 5.06%
  ]

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
            initialBaseMetadataUri,
            initialMinExpectedHoldAmount,
            initialMaxExpectedHoldAmount,
            initialMinRewardPercent,
            initialMaxRewardPercent,
            initialMinEntryPeriodDuration,
            initialMaxEntryPeriodDuration,
            initialMinCompletionPeriodDuration,
            initialMaxCompletionPeriodDuration,
            initialVirtualMultiplier,
            initialMinPartialReturn,
            initialHoldToken,
            initialMinCreateRWAFee,
            initialMaxCreateRWAFee,
            initialMinCreatePoolFeeRatio,
            initialMaxCreatePoolFeeRatio,
            initialEntryFeePercent,
            initialExitFeePercent,
            initialRwaInitialSupply,
            initialMinSignersRequired,
            initialBaseRwaAmount,
            initialSpeculationHoldMultiplier,
            initialSpeculationRwaMultipliers
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
