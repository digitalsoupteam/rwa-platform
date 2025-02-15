import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'


const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('PoolImplementation')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const addressBook = await get('AddressBook')

  const deployment = await deploy('PoolImplementation', {
    contract: 'Pool',
    from: deployer.address,
  })
  
  const addressBookContract = AddressBook__factory.connect(addressBook.address)
  await addressBookContract.connect(deployer).setPoolImplementation(deployment.address)
}

deploy.tags = ['PoolImplementation']
deploy.dependencies = ['RWAImplementation']
export default deploy
