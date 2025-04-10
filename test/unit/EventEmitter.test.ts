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

      await expect(eventEmitter.connect(impersonateFactory).emitFactory_RWADeployed(token, owner))
        .to.emit(eventEmitter, 'Factory_RWADeployed')
        .withArgs(await factory.getAddress(), token, owner)
    })

    it('should emit Factory_PoolDeployed event when called by protocol contract', async () => {
      const pool = ethers.Wallet.createRandom().address
      const owner = ethers.Wallet.createRandom().address
      const rwa = ethers.Wallet.createRandom().address
      const rwaId = 1

      await expect(
        eventEmitter.connect(impersonateFactory).emitFactory_PoolDeployed(pool, owner, rwa, rwaId),
      )
        .to.emit(eventEmitter, 'Factory_PoolDeployed')
        .withArgs(await factory.getAddress(), pool, owner, rwa, rwaId)
    })

    it('should emit Pool_Swap event when called by protocol contract', async () => {
      const sender = ethers.Wallet.createRandom().address
      const holdAmount = ethers.parseEther('100')
      const rwaAmount = 50n
      const isRWAIn = false

      await expect(
        eventEmitter
          .connect(impersonateFactory)
          .emitPool_Swap(sender, holdAmount, rwaAmount, isRWAIn),
      )
        .to.emit(eventEmitter, 'Pool_Swap')
        .withArgs(await factory.getAddress(), sender, holdAmount, rwaAmount, isRWAIn)
    })

    it('should emit Pool_EmergencyStop event when called by protocol contract', async () => {
      await expect(eventEmitter.connect(impersonateFactory).emitPool_EmergencyStop(true))
        .to.emit(eventEmitter, 'Pool_EmergencyStop')
        .withArgs(await factory.getAddress(), true)
    })

    it('should revert when non-protocol contract tries to emit event', async () => {
      const token = ethers.Wallet.createRandom().address
      const owner = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter.connect(user).emitFactory_RWADeployed(token, owner),
      ).to.be.revertedWith('Not a protocol contract!')
    })
  })

  describe('DaoStaking Events', () => {
    it('should emit DaoStaking_Staked event when called by protocol contract', async () => {
      const user = ethers.Wallet.createRandom().address
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitDaoStaking_Staked(user, amount))
        .to.emit(eventEmitter, 'DaoStaking_Staked')
        .withArgs(await factory.getAddress(), user, amount)
    })

    it('should emit DaoStaking_Unstaked event when called by protocol contract', async () => {
      const user = ethers.Wallet.createRandom().address
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitDaoStaking_Unstaked(user, amount))
        .to.emit(eventEmitter, 'DaoStaking_Unstaked')
        .withArgs(await factory.getAddress(), user, amount)
    })

    it('should emit DaoStaking_LockExtended event when called by protocol contract', async () => {
      const user = ethers.Wallet.createRandom().address
      const lockUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 // 1 year from now

      await expect(eventEmitter.connect(impersonateFactory).emitDaoStaking_LockExtended(user, lockUntil))
        .to.emit(eventEmitter, 'DaoStaking_LockExtended')
        .withArgs(await factory.getAddress(), user, lockUntil)
    })

    it('should revert when non-protocol contract tries to emit DaoStaking event', async () => {
      const amount = ethers.parseEther('100')

      await expect(
        eventEmitter.connect(user).emitDaoStaking_Staked(user, amount)
      ).to.be.revertedWith('Not a protocol contract!')
    })
  })

  describe('Governance Events', () => {
    it('should emit Governance_ProposalCreated event when called by protocol contract', async () => {
      const proposalId = 1
      const proposer = ethers.Wallet.createRandom().address
      const targets = [ethers.Wallet.createRandom().address]
      const values = [ethers.parseEther('1')]
      const calldatas = ['0x']
      const description = 'Test Proposal'
      const startTime = Math.floor(Date.now() / 1000)
      const endTime = startTime + 3 * 24 * 60 * 60 // 3 days from now

      await expect(
        eventEmitter
          .connect(impersonateFactory)
          .emitGovernance_ProposalCreated(
            proposalId,
            proposer,
            targets,
            values,
            calldatas,
            description,
            startTime,
            endTime
          )
      )
        .to.emit(eventEmitter, 'Governance_ProposalCreated')
        .withArgs(
          await factory.getAddress(),
          proposalId,
          proposer,
          targets,
          values,
          calldatas,
          description,
          startTime,
          endTime
        )
    })

    it('should emit Governance_VoteCast event when called by protocol contract', async () => {
      const voter = ethers.Wallet.createRandom().address
      const proposalId = 1
      const support = true
      const votes = ethers.parseEther('100')

      await expect(
        eventEmitter.connect(impersonateFactory).emitGovernance_VoteCast(voter, proposalId, support, votes)
      )
        .to.emit(eventEmitter, 'Governance_VoteCast')
        .withArgs(await factory.getAddress(), voter, proposalId, support, votes)
    })

    it('should emit Governance_ProposalExecuted event when called by protocol contract', async () => {
      const proposalId = 1

      await expect(eventEmitter.connect(impersonateFactory).emitGovernance_ProposalExecuted(proposalId))
        .to.emit(eventEmitter, 'Governance_ProposalExecuted')
        .withArgs(await factory.getAddress(), proposalId)
    })

    it('should emit Governance_ProposalCanceled event when called by protocol contract', async () => {
      const proposalId = 1

      await expect(eventEmitter.connect(impersonateFactory).emitGovernance_ProposalCanceled(proposalId))
        .to.emit(eventEmitter, 'Governance_ProposalCanceled')
        .withArgs(await factory.getAddress(), proposalId)
    })
  })

  describe('Timelock Events', () => {
    it('should emit Timelock_OperationScheduled event when called by protocol contract', async () => {
      const operationId = ethers.randomBytes(32)
      const target = ethers.Wallet.createRandom().address
      const value = ethers.parseEther('1')
      const data = '0x'
      const timestamp = Math.floor(Date.now() / 1000)

      await expect(
        eventEmitter
          .connect(impersonateFactory)
          .emitTimelock_OperationScheduled(operationId, target, value, data, timestamp)
      )
        .to.emit(eventEmitter, 'Timelock_OperationScheduled')
        .withArgs(await factory.getAddress(), operationId, target, value, data, timestamp)
    })

    it('should emit Timelock_OperationExecuted event when called by protocol contract', async () => {
      const operationId = ethers.randomBytes(32)

      await expect(eventEmitter.connect(impersonateFactory).emitTimelock_OperationExecuted(operationId))
        .to.emit(eventEmitter, 'Timelock_OperationExecuted')
        .withArgs(await factory.getAddress(), operationId)
    })

    it('should emit Timelock_OperationCanceled event when called by protocol contract', async () => {
      const operationId = ethers.randomBytes(32)

      await expect(eventEmitter.connect(impersonateFactory).emitTimelock_OperationCanceled(operationId))
        .to.emit(eventEmitter, 'Timelock_OperationCanceled')
        .withArgs(await factory.getAddress(), operationId)
    })
  })

  describe('Treasury Events', () => {
    it('should emit Treasury_Withdrawn event when called by protocol contract', async () => {
      const token = ethers.Wallet.createRandom().address
      const to = ethers.Wallet.createRandom().address
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitTreasury_Withdrawn(token, to, amount))
        .to.emit(eventEmitter, 'Treasury_Withdrawn')
        .withArgs(await factory.getAddress(), token, to, amount)
    })

    it('should emit Treasury_ETHReceived event when called by protocol contract', async () => {
      const from = ethers.Wallet.createRandom().address
      const amount = ethers.parseEther('1')

      await expect(eventEmitter.connect(impersonateFactory).emitTreasury_ETHReceived(from, amount))
        .to.emit(eventEmitter, 'Treasury_ETHReceived')
        .withArgs(await factory.getAddress(), from, amount)
    })
  })

  describe('Additional Pool Events', () => {
    it('should emit Pool_FeesCollected event when called by protocol contract', async () => {
      const amount = ethers.parseEther('1')
      const treasury = ethers.Wallet.createRandom().address

      await expect(eventEmitter.connect(impersonateFactory).emitPool_FeesCollected(amount, treasury))
        .to.emit(eventEmitter, 'Pool_FeesCollected')
        .withArgs(await factory.getAddress(), amount, treasury)
    })

    it('should emit Pool_ProductOwnerBalanceUpdated event when called by protocol contract', async () => {
      const newBalance = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitPool_ProductOwnerBalanceUpdated(newBalance))
        .to.emit(eventEmitter, 'Pool_ProductOwnerBalanceUpdated')
        .withArgs(await factory.getAddress(), newBalance)
    })

    it('should emit Pool_ReservesUpdated event when called by protocol contract', async () => {
      const realHold = ethers.parseEther('100')
      const virtualHold = ethers.parseEther('200')
      const virtualRwa = ethers.parseEther('300')

      await expect(
        eventEmitter.connect(impersonateFactory).emitPool_ReservesUpdated(realHold, virtualHold, virtualRwa)
      )
        .to.emit(eventEmitter, 'Pool_ReservesUpdated')
        .withArgs(await factory.getAddress(), realHold, virtualHold, virtualRwa)
    })

    it('should emit Pool_InvestmentRepaid event when called by protocol contract', async () => {
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitPool_InvestmentRepaid(amount))
        .to.emit(eventEmitter, 'Pool_InvestmentRepaid')
        .withArgs(await factory.getAddress(), amount)
    })

    it('should emit Pool_ProfitDistributed event when called by protocol contract', async () => {
      const user = ethers.Wallet.createRandom().address
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitPool_ProfitDistributed(user, amount))
        .to.emit(eventEmitter, 'Pool_ProfitDistributed')
        .withArgs(await factory.getAddress(), user, amount)
    })

    it('should emit Pool_TargetReached event when called by protocol contract', async () => {
      const timestamp = Math.floor(Date.now() / 1000)

      await expect(eventEmitter.connect(impersonateFactory).emitPool_TargetReached(timestamp))
        .to.emit(eventEmitter, 'Pool_TargetReached')
        .withArgs(await factory.getAddress(), timestamp)
    })
  })

  describe('Router Events', () => {
    it('should emit Router_SwapExactInput event when called by protocol contract', async () => {
      const tokenIn = ethers.Wallet.createRandom().address
      const tokenOut = ethers.Wallet.createRandom().address
      const amountIn = ethers.parseEther('100')
      const amountOut = ethers.parseEther('90')
      const pool = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter
          .connect(impersonateFactory)
          .emitRouter_SwapExactInput(tokenIn, tokenOut, amountIn, amountOut, pool)
      )
        .to.emit(eventEmitter, 'Router_SwapExactInput')
        .withArgs(await factory.getAddress(), tokenIn, tokenOut, amountIn, amountOut, pool)
    })

    it('should emit Router_SwapExactOutput event when called by protocol contract', async () => {
      const tokenIn = ethers.Wallet.createRandom().address
      const tokenOut = ethers.Wallet.createRandom().address
      const amountIn = ethers.parseEther('110')
      const amountOut = ethers.parseEther('100')
      const pool = ethers.Wallet.createRandom().address

      await expect(
        eventEmitter
          .connect(impersonateFactory)
          .emitRouter_SwapExactOutput(tokenIn, tokenOut, amountIn, amountOut, pool)
      )
        .to.emit(eventEmitter, 'Router_SwapExactOutput')
        .withArgs(await factory.getAddress(), tokenIn, tokenOut, amountIn, amountOut, pool)
    })
  })

  describe('Config Events', () => {
    it('should emit Config_InvestmentDurationUpdated event when called by protocol contract', async () => {
      const minDuration = 7 * 24 * 60 * 60 // 1 week
      const maxDuration = 365 * 24 * 60 * 60 // 1 year

      await expect(
        eventEmitter.connect(impersonateFactory).emitConfig_InvestmentDurationUpdated(minDuration, maxDuration)
      )
        .to.emit(eventEmitter, 'Config_InvestmentDurationUpdated')
        .withArgs(await factory.getAddress(), minDuration, maxDuration)
    })

    it('should emit Config_RealiseDurationUpdated event when called by protocol contract', async () => {
      const minDuration = 1 * 24 * 60 * 60 // 1 day
      const maxDuration = 30 * 24 * 60 * 60 // 30 days

      await expect(
        eventEmitter.connect(impersonateFactory).emitConfig_RealiseDurationUpdated(minDuration, maxDuration)
      )
        .to.emit(eventEmitter, 'Config_RealiseDurationUpdated')
        .withArgs(await factory.getAddress(), minDuration, maxDuration)
    })

    it('should emit Config_TargetAmountUpdated event when called by protocol contract', async () => {
      const minAmount = ethers.parseEther('1000')
      const maxAmount = ethers.parseEther('1000000')

      await expect(
        eventEmitter.connect(impersonateFactory).emitConfig_TargetAmountUpdated(minAmount, maxAmount)
      )
        .to.emit(eventEmitter, 'Config_TargetAmountUpdated')
        .withArgs(await factory.getAddress(), minAmount, maxAmount)
    })

    it('should emit Config_VirtualMultiplierUpdated event when called by protocol contract', async () => {
      const multiplier = 150 // 1.5x

      await expect(eventEmitter.connect(impersonateFactory).emitConfig_VirtualMultiplierUpdated(multiplier))
        .to.emit(eventEmitter, 'Config_VirtualMultiplierUpdated')
        .withArgs(await factory.getAddress(), multiplier)
    })

    it('should emit Config_ProfitPercentUpdated event when called by protocol contract', async () => {
      const minPercent = 500 // 5%
      const maxPercent = 3000 // 30%

      await expect(
        eventEmitter.connect(impersonateFactory).emitConfig_ProfitPercentUpdated(minPercent, maxPercent)
      )
        .to.emit(eventEmitter, 'Config_ProfitPercentUpdated')
        .withArgs(await factory.getAddress(), minPercent, maxPercent)
    })

    it('should emit Config_MinPartialReturnUpdated event when called by protocol contract', async () => {
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitConfig_MinPartialReturnUpdated(amount))
        .to.emit(eventEmitter, 'Config_MinPartialReturnUpdated')
        .withArgs(await factory.getAddress(), amount)
    })

    it('should emit Config_HoldTokenUpdated event when called by protocol contract', async () => {
      const token = ethers.Wallet.createRandom().address

      await expect(eventEmitter.connect(impersonateFactory).emitConfig_HoldTokenUpdated(token))
        .to.emit(eventEmitter, 'Config_HoldTokenUpdated')
        .withArgs(await factory.getAddress(), token)
    })

    it('should emit Config_CreationFeesUpdated event when called by protocol contract', async () => {
      const rwaFee = ethers.parseEther('100')
      const poolFee = ethers.parseEther('200')

      await expect(eventEmitter.connect(impersonateFactory).emitConfig_CreationFeesUpdated(rwaFee, poolFee))
        .to.emit(eventEmitter, 'Config_CreationFeesUpdated')
        .withArgs(await factory.getAddress(), rwaFee, poolFee)
    })

    it('should emit Config_TradingFeesUpdated event when called by protocol contract', async () => {
      const buyFee = 300 // 3%
      const sellFee = 300 // 3%

      await expect(eventEmitter.connect(impersonateFactory).emitConfig_TradingFeesUpdated(buyFee, sellFee))
        .to.emit(eventEmitter, 'Config_TradingFeesUpdated')
        .withArgs(await factory.getAddress(), buyFee, sellFee)
    })

    it('should emit Config_RWAInitialSupplyUpdated event when called by protocol contract', async () => {
      const supply = ethers.parseEther('1000000')

      await expect(eventEmitter.connect(impersonateFactory).emitConfig_RWAInitialSupplyUpdated(supply))
        .to.emit(eventEmitter, 'Config_RWAInitialSupplyUpdated')
        .withArgs(await factory.getAddress(), supply)
    })
  })

  describe('Token Events', () => {
    it('should emit DaoToken_Transfer event when called by protocol contract', async () => {
      const from = ethers.Wallet.createRandom().address
      const to = ethers.Wallet.createRandom().address
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitDaoToken_Transfer(from, to, amount))
        .to.emit(eventEmitter, 'DaoToken_Transfer')
        .withArgs(await factory.getAddress(), from, to, amount)
    })

    it('should emit PlatformToken_Transfer event when called by protocol contract', async () => {
      const from = ethers.Wallet.createRandom().address
      const to = ethers.Wallet.createRandom().address
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitPlatformToken_Transfer(from, to, amount))
        .to.emit(eventEmitter, 'PlatformToken_Transfer')
        .withArgs(await factory.getAddress(), from, to, amount)
    })

    it('should emit RWA_Transfer event when called by protocol contract', async () => {
      const from = ethers.Wallet.createRandom().address
      const to = ethers.Wallet.createRandom().address
      const tokenId = 1
      const amount = ethers.parseEther('100')

      await expect(eventEmitter.connect(impersonateFactory).emitRWA_Transfer(from, to, tokenId, amount))
        .to.emit(eventEmitter, 'RWA_Transfer')
        .withArgs(await factory.getAddress(), from, to, tokenId, amount)
    })
  })

  describe('Payment Events', () => {
    it('should emit Payment_Processed event when called by protocol contract', async () => {
      const user = ethers.Wallet.createRandom().address
      const token = ethers.Wallet.createRandom().address
      const amount = ethers.parseEther('100')
      const userId = 'user123'

      await expect(eventEmitter.connect(impersonateFactory).emitPayment_Processed(user, token, amount, userId))
        .to.emit(eventEmitter, 'Payment_Processed')
        .withArgs(await factory.getAddress(), user, token, amount, userId)
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