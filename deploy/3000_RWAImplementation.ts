import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('RWAImplementation')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const addressBook = await get('AddressBook')
  
  const deployment = await deploy('RWAImplementation', {
    contract: 'RWA',
    from: deployer.address,
  })
  
  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'setRWAImplementation',
    deployment.address
  )
}

deploy.tags = ['RWAImplementation']
deploy.dependencies = ['Config']
export default deploy
