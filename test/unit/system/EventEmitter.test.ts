import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import {
  EventEmitter,
  EventEmitter__factory,
  AddressBook,
  AddressBook__factory,
  Config,
  Config__factory,
} from '../../../typechain-types'

describe('EventEmitter Contract Unit Tests', () => {
  let eventEmitter: EventEmitter
  let addressBook: AddressBook
  let config: Config
  let testOwner: HardhatEthersSigner
  let user: HardhatEthersSigner
  let impersonatedConfig: SignerWithAddress
  let initSnapshot: string

  before(async () => {
    const signers = await ethers.getSigners()
    testOwner = signers[0]
    user = signers[9]

    // Deploy all contracts using the deployment fixture
    await deployments.fixture()

    eventEmitter = EventEmitter__factory.connect(
      (await deployments.get('EventEmitter')).address,
      ethers.provider,
    )

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
      ethers.provider,
    )

    config = Config__factory.connect(
      (await deployments.get('Config')).address,
      ethers.provider,
    )

    // Impersonate Config contract since it's already registered as protocol contract
    await impersonateAccount(await config.getAddress())
    impersonatedConfig = await ethers.getSigner(await config.getAddress())
    await setBalance(impersonatedConfig.address, ethers.parseEther('100'))

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Initialization', () => {
    it('should initialize with correct address book', async () => {
      expect(await eventEmitter.addressBook()).to.equal(await addressBook.getAddress())
    })

    it('should set genesis block', async () => {
      expect(await eventEmitter.genesisBlock()).gt(0)
    })
  })

  describe('Pool Events', () => {
    it('should emit Pool_OutgoingTrancheClaimed when called by protocol contract', async () => {
      const claimer = ethers.Wallet.createRandom().address
      const trancheIndex = 1n
      const amountClaimed = ethers.parseEther('100')
      const holdToken = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter.connect(impersonatedConfig).emitPool_OutgoingTrancheClaimed(
          claimer,
          trancheIndex,
          amountClaimed,
          holdToken
        )
      )
        .to.emit(eventEmitter, 'Pool_OutgoingTrancheClaimed')
        .withArgs(impersonatedConfig.address, claimer, trancheIndex, amountClaimed, holdToken)
    })

    it('should revert Pool_OutgoingTrancheClaimed when called by non-protocol contract', async () => {
      const claimer = ethers.Wallet.createRandom().address
      const trancheIndex = 1n
      const amountClaimed = ethers.parseEther('100')
      const holdToken = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter.connect(user).emitPool_OutgoingTrancheClaimed(
          claimer,
          trancheIndex,
          amountClaimed,
          holdToken
        )
      ).to.be.revertedWith('Not a protocol contract!')
    })

    it('should emit Pool_RwaMinted when called by protocol contract', async () => {
      const minter = ethers.Wallet.createRandom().address
      const rwaAmountMinted = ethers.parseEther('100')
      const holdAmountPaid = ethers.parseEther('50')
      const feePaid = ethers.parseEther('1')
      const percentBefore = 5000n // 50%
      const userPercent = 1000n // 10%
      const targetReached = true
      const businessId = "test-business"
      const poolId = "test-pool"
      const holdToken = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter.connect(impersonatedConfig).emitPool_RwaMinted(
          minter,
          rwaAmountMinted,
          holdAmountPaid,
          feePaid,
          percentBefore,
          userPercent,
          targetReached,
          businessId,
          poolId,
          holdToken
        )
      )
        .to.emit(eventEmitter, 'Pool_RwaMinted')
        .withArgs(
          impersonatedConfig.address,
          minter,
          rwaAmountMinted,
          holdAmountPaid,
          feePaid,
          percentBefore,
          userPercent,
          targetReached,
          businessId,
          poolId,
          holdToken
        )
    })

    it('should emit Pool_RwaBurned when called by protocol contract', async () => {
      const burner = ethers.Wallet.createRandom().address
      const rwaAmountBurned = ethers.parseEther('100')
      const holdAmountReceived = ethers.parseEther('50')
      const bonusAmountReceived = ethers.parseEther('10')
      const holdFeePaid = ethers.parseEther('1')
      const bonusFeePaid = ethers.parseEther('0.2')
      const percentBefore = 5000n // 50%
      const userPercent = 1000n // 10%
      const targetReached = true
      const businessId = "test-business"
      const poolId = "test-pool"
      const holdToken = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter.connect(impersonatedConfig).emitPool_RwaBurned(
          burner,
          rwaAmountBurned,
          holdAmountReceived,
          bonusAmountReceived,
          holdFeePaid,
          bonusFeePaid,
          percentBefore,
          userPercent,
          targetReached,
          businessId,
          poolId,
          holdToken
        )
      )
        .to.emit(eventEmitter, 'Pool_RwaBurned')
        .withArgs(
          impersonatedConfig.address,
          burner,
          rwaAmountBurned,
          holdAmountReceived,
          bonusAmountReceived,
          holdFeePaid,
          bonusFeePaid,
          percentBefore,
          userPercent,
          targetReached,
          businessId,
          poolId,
          holdToken
        )
    })
  })

  describe('RWA Events', () => {
    it('should emit RWA_Transfer when called by protocol contract', async () => {
      const from = ethers.Wallet.createRandom().address
      const to = ethers.Wallet.createRandom().address
      const tokenId = 1n
      const amount = ethers.parseEther('100')
      const pool = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter.connect(impersonatedConfig).emitRWA_Transfer(from, to, tokenId, amount, pool)
      )
        .to.emit(eventEmitter, 'RWA_Transfer')
        .withArgs(impersonatedConfig.address, from, to, tokenId, amount, pool)
    })

    it('should emit RWA_Deployed when called by protocol contract', async () => {
      const deployer = ethers.Wallet.createRandom().address
      const owner = ethers.Wallet.createRandom().address
      const entityId = "test-entity"

      await expect(
        eventEmitter.connect(impersonatedConfig).emitRWA_Deployed(deployer, owner, entityId)
      )
        .to.emit(eventEmitter, 'RWA_Deployed')
        .withArgs(impersonatedConfig.address, deployer, owner, entityId)
    })

    it('should revert RWA_Transfer when called by non-protocol contract', async () => {
      const from = ethers.Wallet.createRandom().address
      const to = ethers.Wallet.createRandom().address
      const tokenId = 1n
      const amount = ethers.parseEther('100')
      const pool = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter.connect(user).emitRWA_Transfer(from, to, tokenId, amount, pool)
      ).to.be.revertedWith('Not a protocol contract!')
    })
  })

  describe('Contract Management', () => {
    it('should return correct unique contract id', async () => {
      expect(await eventEmitter.uniqueContractId()).to.equal(ethers.keccak256(ethers.toUtf8Bytes("EventEmitter")))
    })

    it('should return correct implementation version', async () => {
      expect(await eventEmitter.implementationVersion()).to.equal(1n)
    })
  })
})