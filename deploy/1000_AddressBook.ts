import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, getOrNull } = deployments

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  const signer1 = signers[1]
  const signer2 = signers[2]
  const signer3 = signers[3]

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

  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'addSigner',
    signer1.address
  )
  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'addSigner',
    signer2.address
  )
  await deployments.execute(
    'AddressBook',
    { from: deployer.address },
    'addSigner',
    signer3.address
  )
}

deploy.tags = ['AddressBook']
export default deploy
