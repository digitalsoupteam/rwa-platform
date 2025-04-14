import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import {
  EventEmitter,
  EventEmitter__factory,
  Factory,
  Factory__factory,
  AddressBook,
  AddressBook__factory,
  UUPSUpgradeable,
  UUPSUpgradeable__factory,
  Governance,
  Governance__factory,
} from '../../typechain-types'

describe('EventEmitter Contract Unit Tests', () => {
  let eventEmitter: EventEmitter
  let factory: Factory
  let addressBook: AddressBook
  let testOwner: HardhatEthersSigner
  let user: HardhatEthersSigner
  let impersonateFactory: SignerWithAddress
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

    factory = Factory__factory.connect((await deployments.get('Factory')).address, ethers.provider)

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
      ethers.provider,
    )

    // Impersonate Factory contract to test protocol events
    await impersonateAccount(await factory.getAddress())
    impersonateFactory = await ethers.getSigner(await factory.getAddress())
    await setBalance(impersonateFactory.address, ethers.parseEther('100'))

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

  describe('Event Emission', () => {
    it('should emit Factory_RWADeployed event when called by protocol contract', async () => {
      const token = ethers.Wallet.createRandom().address
      const owner = ethers.Wallet.createRandom().address
      const entityId = "test-entity"

      await expect(eventEmitter.connect(impersonateFactory).emitFactory_RWADeployed(token, owner, entityId))
        .to.emit(eventEmitter, 'Factory_RWADeployed')
        .withArgs(await factory.getAddress(), token, owner, entityId)
    })

    it('should emit Factory_PoolDeployed event when called by protocol contract', async () => {
      const pool = ethers.Wallet.createRandom().address
      const owner = ethers.Wallet.createRandom().address
      const entityId = "entity-1"
      const rwa = ethers.Wallet.createRandom().address
      const rwaId = 1n
      const expectedHoldAmount = ethers.parseEther('1000')
      const rewardPercent = 1500n
      const entryPeriodExpired = 1234567890n
      const completionPeriodExpired = 1234567999n
      const poolType = "stable"
      const payload = "0x"

      await expect(
        eventEmitter.connect(impersonateFactory).emitFactory_PoolDeployed(
          pool,
          owner,
          entityId,
          rwa,
          rwaId,
          expectedHoldAmount,
          rewardPercent,
          entryPeriodExpired,
          completionPeriodExpired,
          poolType,
          payload
        ),
      )
        .to.emit(eventEmitter, 'Factory_PoolDeployed')
        .withArgs(
          await factory.getAddress(),
          pool,
          owner,
          entityId,
          rwa,
          rwaId,
          expectedHoldAmount,
          rewardPercent,
          entryPeriodExpired,
          completionPeriodExpired,
          poolType,
          payload
        )
    })

    it('should revert when non-protocol contract tries to emit event', async () => {
      const token = ethers.Wallet.createRandom().address
      const owner = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter.connect(user).emitFactory_RWADeployed(token, owner, ""),
      ).to.be.revertedWith('Not a protocol contract!')
    })
  })

  describe('BasePool Events', () => {
    it('should emit BasePool_AccumulatedAmountsUpdated event when called by protocol contract', async () => {
      const entityId = "test-entity"
      const accumulatedHoldAmount = ethers.parseEther('100')
      const accumulatedRwaAmount = ethers.parseEther('50')

      await expect(
        eventEmitter.connect(impersonateFactory).emitBasePool_AccumulatedAmountsUpdated(
          entityId,
          accumulatedHoldAmount,
          accumulatedRwaAmount
        )
      )
        .to.emit(eventEmitter, 'BasePool_AccumulatedAmountsUpdated')
        .withArgs(await factory.getAddress(), entityId, accumulatedHoldAmount, accumulatedRwaAmount)
    })

    it('should emit BasePool_TargetReached event when called by protocol contract', async () => {
      const entityId = "test-entity"
      const allocatedHoldAmount = ethers.parseEther('1000')

      await expect(
        eventEmitter.connect(impersonateFactory).emitBasePool_TargetReached(entityId, allocatedHoldAmount)
      )
        .to.emit(eventEmitter, 'BasePool_TargetReached')
        .withArgs(await factory.getAddress(), entityId, allocatedHoldAmount)
    })

    it('should emit BasePool_FullyReturned event when called by protocol contract', async () => {
      const entityId = "test-entity"
      const isFullyReturned = true

      await expect(
        eventEmitter.connect(impersonateFactory).emitBasePool_FullyReturned(entityId, isFullyReturned)
      )
        .to.emit(eventEmitter, 'BasePool_FullyReturned')
        .withArgs(await factory.getAddress(), entityId, isFullyReturned)
    })

    it('should emit BasePool_ReturnedAmountUpdated event when called by protocol contract', async () => {
      const entityId = "test-entity"
      const returnedAmount = ethers.parseEther('500')

      await expect(
        eventEmitter.connect(impersonateFactory).emitBasePool_ReturnedAmountUpdated(entityId, returnedAmount)
      )
        .to.emit(eventEmitter, 'BasePool_ReturnedAmountUpdated')
        .withArgs(await factory.getAddress(), entityId, returnedAmount)
    })

    it('should emit BasePool_EmergencyStop event when called by protocol contract', async () => {
      const entityId = "test-entity"
      const paused = true

      await expect(
        eventEmitter.connect(impersonateFactory).emitBasePool_EmergencyStop(entityId, paused)
      )
        .to.emit(eventEmitter, 'BasePool_EmergencyStop')
        .withArgs(await factory.getAddress(), entityId, paused)
    })

    it('should emit BasePool_AvailableReturnBalanceUpdated event when called by protocol contract', async () => {
      const entityId = "test-entity"
      const availableReturnBalance = ethers.parseEther('750')

      await expect(
        eventEmitter.connect(impersonateFactory).emitBasePool_AvailableReturnBalanceUpdated(
          entityId,
          availableReturnBalance
        )
      )
        .to.emit(eventEmitter, 'BasePool_AvailableReturnBalanceUpdated')
        .withArgs(await factory.getAddress(), entityId, availableReturnBalance)
    })

    it('should emit BasePool_AllocatedHoldAmountClaimed event when called by protocol contract', async () => {
      const entityId = "test-entity"
      const allocatedHoldAmount = ethers.parseEther('1000')

      await expect(
        eventEmitter.connect(impersonateFactory).emitBasePool_AllocatedHoldAmountClaimed(
          entityId,
          allocatedHoldAmount
        )
      )
        .to.emit(eventEmitter, 'BasePool_AllocatedHoldAmountClaimed')
        .withArgs(await factory.getAddress(), entityId, allocatedHoldAmount)
    })
  })

  describe('RWA Events', () => {
    it('should emit RWA_Transfer event when called by protocol contract', async () => {
      const from = ethers.Wallet.createRandom().address
      const to = ethers.Wallet.createRandom().address
      const tokenId = 1n
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitRWA_Transfer(from, to, tokenId, amount))
        .to.emit(eventEmitter, 'RWA_Transfer')
        .withArgs(await factory.getAddress(), from, to, tokenId, amount)
    })
  })

  describe('upgrades', () => {
    let newEventEmitter: EventEmitter
    let proxyEventEmitter: UUPSUpgradeable
    let governance: Governance
    let impersonateGovernance: SignerWithAddress

    beforeEach(async () => {
      governance = Governance__factory.connect(await addressBook.governance(), ethers.provider)
      await impersonateAccount(await governance.getAddress())
      impersonateGovernance = await ethers.getSigner(await governance.getAddress())
      proxyEventEmitter = UUPSUpgradeable__factory.connect(
        await eventEmitter.getAddress(),
        ethers.provider,
      )
      const EventEmitter = await ethers.getContractFactory('EventEmitter')
      newEventEmitter = await EventEmitter.deploy()
    })

    it('should upgrade contract', async () => {
      await expect(
        proxyEventEmitter
          .connect(impersonateGovernance)
          .upgradeToAndCall(await newEventEmitter.getAddress(), '0x'),
      ).to.not.be.reverted

      expect(await eventEmitter.getAddress()).to.equal(await ethers.resolveAddress(eventEmitter))
    })

    it('should not allow non-owner to upgrade', async () => {
      await expect(
        eventEmitter.connect(user).upgradeToAndCall(await newEventEmitter.getAddress(), '0x'),
      ).to.be.revertedWith('Only Governance!')
    })

    it('should not allow upgrade to non-contract address', async () => {
      await expect(
        eventEmitter.connect(impersonateGovernance).upgradeToAndCall(user.address, '0x'),
      ).to.be.revertedWithoutReason()
    })

    it('should preserve state after upgrade', async () => {
      const addressBookBefore = await eventEmitter.addressBook()

      await eventEmitter
        .connect(impersonateGovernance)
        .upgradeToAndCall(await newEventEmitter.getAddress(), '0x')

      expect(await eventEmitter.addressBook()).to.equal(addressBookBefore)
    })

    it('should emit Upgraded event', async () => {
      await expect(
        eventEmitter
          .connect(impersonateGovernance)
          .upgradeToAndCall(await newEventEmitter.getAddress(), '0x'),
      )
        .to.emit(eventEmitter, 'Upgraded')
        .withArgs(await newEventEmitter.getAddress())
    })
  })
})