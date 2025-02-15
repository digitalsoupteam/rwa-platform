import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  const backend = signers[1]

  const alreadyDeployed = (await getOrNull('AddressBook')) != null
  if (alreadyDeployed) return

  const deployment = await deploy('AddressBook', {
    contract: 'AddressBook',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [],
        },
      },
    },
  })


    const addressBookContract = AddressBook__factory.connect(deployment.address)
    await addressBookContract.connect(deployer).setBackend(backend.address)
}

deploy.tags = ['AddressBook']
export default deploy
