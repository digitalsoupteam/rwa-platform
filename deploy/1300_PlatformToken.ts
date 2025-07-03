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
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            addressBook.address, // initialAddressBook
            'RWA_PLATFORM', // initialName
            'RWAP', // initialSymbol
            [deployer.address], // initialHolders
            [ethers.parseEther('21000000')], // initialAmounts
          ],
        },
      },
    },
  })

  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'setPlatformToken',
    deployment.address
  )
}

deploy.tags = ['PlatformToken']
deploy.dependencies = ['EventEmitter']
export default deploy