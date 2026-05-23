import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('PlatformToken')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const addressBook = await get('AddressBook')

  const deployment = await deploy('PlatformToken', {
    contract: 'PlatformToken',
    from: deployer.address,
    log: true,
    waitConfirmations: 2,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            addressBook.address, // initialAddressBook
            'RWA_PLATFORM', // initialName
            'RWAP', // initialSymbol
          ],
        },
      },
    },
  })

  await deployments.execute(
    'AddressBook',
    { from: deployer.address, log: true, waitConfirmations: 2 },
    'setPlatformToken',
    deployment.address
  )

  await deployments.execute(
    'PlatformToken',
    { from: deployer.address, log: true, waitConfirmations: 2 },
    'mint',
    [deployer.address], // holders
    [ethers.parseEther('21000000')] // amounts
  )
}

deploy.tags = ['PlatformToken']
deploy.dependencies = ['EventEmitter']
export default deploy