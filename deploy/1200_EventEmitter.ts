import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('EventEmitter')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]
  
  const balance = await ethers.provider.getBalance(deployer.address)
  console.log(`Deployer: ${deployer.address}, Balance: ${ethers.formatEther(balance)} BNB`)

  const addressBook = await get('AddressBook')

  const deployment = await deploy('EventEmitter', {
    contract: 'EventEmitter',
    from: deployer.address,
    log: true,
    waitConfirmations: 2,
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

  console.log('Waiting for network sync...')
  await new Promise(r => setTimeout(r, 10000))

  const balanceBeforeExecute = await ethers.provider.getBalance(deployer.address)
  console.log(`Balance before execute: ${ethers.formatEther(balanceBeforeExecute)} BNB`)

  await deployments.execute(
    'AddressBook',
    { from: deployer.address, log: true, waitConfirmations: 2 },
    'setEventEmitter',
    deployment.address
  )
}

deploy.tags = ['EventEmitter']
deploy.dependencies = ['AddressBook']
export default deploy
