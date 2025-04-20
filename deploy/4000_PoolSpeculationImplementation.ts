import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'


const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('PoolSpeculationImplementation')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const addressBook = await get('AddressBook')

  const deployment = await deploy('PoolSpeculationImplementation', {
    contract: 'SpeculationPool',
    from: deployer.address,
  })
  
  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'setPoolSpeculationImplementation',
    deployment.address
  )
}

deploy.tags = ['PoolSpeculationImplementation']
deploy.dependencies = ['RWAImplementation']
export default deploy
