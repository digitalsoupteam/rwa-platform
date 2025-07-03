import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('Timelock')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const addressBook = await get('AddressBook')

  const deployment = await deploy('Timelock', {
    contract: 'Timelock',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [addressBook.address],
        },
      },
    },
  })

  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'setTimelock',
    deployment.address
  )
}

deploy.tags = ['Timelock']
deploy.dependencies = ['DaoStaking']
export default deploy