import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'


const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('Factory')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const addressBook = await get('AddressBook')

  const deployment = await deploy('Factory', {
    contract: 'Factory',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            addressBook.address
          ],
        },
      },
    },
  })

  
  const addressBookContract = AddressBook__factory.connect(addressBook.address)
  await addressBookContract.connect(deployer).setFactory(deployment.address)
}

deploy.tags = ['Factory']
deploy.dependencies = ['DefaultRwaTokenImplementation']
export default deploy
