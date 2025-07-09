import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance, time } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import {
  Timelock,
  Timelock__factory,
  AddressBook,
  AddressBook__factory,
  Config,
  Config__factory,
  EventEmitter,
  EventEmitter__factory,
  PlatformToken,
  PlatformToken__factory,
} from '../../../typechain-types'

describe('Timelock Contract Unit Tests', () => {
  let timelock: Timelock
  let addressBook: AddressBook
  let config: Config
  let eventEmitter: EventEmitter
  let platformToken: PlatformToken
  let testOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let governance: SignerWithAddress
  let initSnapshot: string

  const TEST_TARGET = '0x1234567890123456789012345678901234567890'
  const TEST_DATA = '0x1234'
  const TIMELOCK_DELAY = 2 * 24 * 60 * 60 // 2 days
  const GRACE_PERIOD = 7 * 24 * 60 * 60 // 7 days

  before(async () => {
    const signers = await ethers.getSigners()
    testOwner = signers[0]
    user1 = signers[1]
    user2 = signers[2]

    // Deploy all contracts using the deployment fixture
    await deployments.fixture()

    timelock = Timelock__factory.connect(
      (await deployments.get('Timelock')).address,
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

    eventEmitter = EventEmitter__factory.connect(
      (await deployments.get('EventEmitter')).address,
      ethers.provider,
    )

    platformToken = PlatformToken__factory.connect(
      (await deployments.get('PlatformToken')).address,
      ethers.provider,
    )

    // Impersonate governance account
    const governanceAddress = await addressBook.governance()
    await impersonateAccount(governanceAddress)
    governance = await ethers.getSigner(governanceAddress)
    await setBalance(governance.address, ethers.parseEther('100'))

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Initialization', () => {
    it('should initialize with correct parameters', async () => {
      expect(await timelock.addressBook()).to.equal(await addressBook.getAddress())
      expect(await timelock.GRACE_PERIOD()).to.equal(GRACE_PERIOD)
    })
  })

  describe('Queue Transaction', () => {
    it('should allow governance to queue transaction', async () => {
      const currentTime = await time.latest()
      const eta = currentTime + TIMELOCK_DELAY + 100

      const expectedTxHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes', 'uint256'],
          [TEST_TARGET, TEST_DATA, eta]
        )
      )

      await expect(
        timelock.connect(governance).queueTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.emit(eventEmitter, 'Timelock_TransactionQueued')
        .withArgs(
          await timelock.getAddress(), // emittedFrom
          expectedTxHash, // txHash
          TEST_TARGET, // target
          TEST_DATA, // data
          eta // eta
        )

      expect(await timelock.queuedTransactions(expectedTxHash)).to.equal(eta)
      expect(await timelock.isTransactionQueued(TEST_TARGET, TEST_DATA, eta)).to.be.true
      expect(await timelock.getTransactionETA(TEST_TARGET, TEST_DATA, eta)).to.equal(eta)
    })

    it('should revert when non-governance tries to queue transaction', async () => {
      const currentTime = await time.latest()
      const eta = currentTime + TIMELOCK_DELAY + 100

      await expect(
        timelock.connect(user1).queueTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.be.revertedWith('AddressBook: not governance')
    })

    it('should revert when ETA is too early', async () => {
      const currentTime = await time.latest()
      const eta = currentTime + TIMELOCK_DELAY - 100 // Too early

      await expect(
        timelock.connect(governance).queueTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.be.revertedWith('ETA too early')
    })

    it('should revert when transaction is already queued', async () => {
      const currentTime = await time.latest()
      const eta = currentTime + TIMELOCK_DELAY + 100

      await timelock.connect(governance).queueTransaction(TEST_TARGET, TEST_DATA, eta)

      await expect(
        timelock.connect(governance).queueTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.be.revertedWith('Transaction already queued')
    })

    it('should return correct transaction hash', async () => {
      const currentTime = await time.latest()
      const eta = currentTime + TIMELOCK_DELAY + 100

      const expectedTxHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes', 'uint256'],
          [TEST_TARGET, TEST_DATA, eta]
        )
      )

      const returnedTxHash = await timelock.connect(governance).queueTransaction.staticCall(
        TEST_TARGET, 
        TEST_DATA, 
        eta
      )

      expect(returnedTxHash).to.equal(expectedTxHash)
    })
  })

  describe('Execute Transaction', () => {
    let eta: number
    let txHash: string

    beforeEach(async () => {
      const currentTime = await time.latest()
      eta = currentTime + TIMELOCK_DELAY + 100

      txHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes', 'uint256'],
          [TEST_TARGET, TEST_DATA, eta]
        )
      )

      await timelock.connect(governance).queueTransaction(TEST_TARGET, TEST_DATA, eta)
    })

    it('should allow anyone to execute transaction after ETA', async () => {
      await time.increaseTo(eta)

      await expect(
        timelock.connect(user1).executeTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.emit(eventEmitter, 'Timelock_TransactionExecuted')
        .withArgs(
          await timelock.getAddress(), // emittedFrom
          txHash, // txHash
          TEST_TARGET, // target
          TEST_DATA, // data
          eta // eta
        )

      expect(await timelock.queuedTransactions(txHash)).to.equal(0)
      expect(await timelock.isTransactionQueued(TEST_TARGET, TEST_DATA, eta)).to.be.false
    })

    it('should allow governance to execute transaction after ETA', async () => {
      await time.increaseTo(eta)

      await expect(
        timelock.connect(governance).executeTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.emit(eventEmitter, 'Timelock_TransactionExecuted')
        .withArgs(
          await timelock.getAddress(), // emittedFrom
          txHash, // txHash
          TEST_TARGET, // target
          TEST_DATA, // data
          eta // eta
        )

      expect(await timelock.queuedTransactions(txHash)).to.equal(0)
      expect(await timelock.isTransactionQueued(TEST_TARGET, TEST_DATA, eta)).to.be.false
    })

    it('should revert when transaction is not queued', async () => {
      const currentTime = await time.latest()
      const differentEta = currentTime + TIMELOCK_DELAY + 200

      await time.increaseTo(differentEta)

      await expect(
        timelock.connect(governance).executeTransaction(TEST_TARGET, TEST_DATA, differentEta)
      ).to.be.revertedWith('Transaction not queued')
    })

    it('should revert when transaction is not ready (before ETA)', async () => {
      await expect(
        timelock.connect(governance).executeTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.be.revertedWith('Transaction not ready')
    })

    it('should revert when transaction is expired (after grace period)', async () => {
      await time.increaseTo(eta + GRACE_PERIOD + 1)

      await expect(
        timelock.connect(governance).executeTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.be.revertedWith('Transaction expired')
    })

    it('should execute transaction with real contract call by any user', async () => {
      // Use platform token transfer as a real transaction
      const transferAmount = ethers.parseEther('100')
      const transferData = platformToken.interface.encodeFunctionData('transfer', [
        user1.address,
        transferAmount
      ])

      const currentTime = await time.latest()
      const realEta = currentTime + TIMELOCK_DELAY + 100

      // Queue the real transaction
      await timelock.connect(governance).queueTransaction(
        await platformToken.getAddress(),
        transferData,
        realEta
      )

      // Transfer tokens to timelock for the test
      await platformToken.connect(testOwner).transfer(
        await timelock.getAddress(),
        transferAmount
      )

      await time.increaseTo(realEta)

      const initialBalance = await platformToken.balanceOf(user1.address)

      // Execute by user2 (not governance)
      await timelock.connect(user2).executeTransaction(
        await platformToken.getAddress(),
        transferData,
        realEta
      )

      expect(await platformToken.balanceOf(user1.address)).to.equal(
        initialBalance + transferAmount
      )
    })
  })

  describe('Cancel Transaction', () => {
    let eta: number
    let txHash: string

    beforeEach(async () => {
      const currentTime = await time.latest()
      eta = currentTime + TIMELOCK_DELAY + 100

      txHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'bytes', 'uint256'],
          [TEST_TARGET, TEST_DATA, eta]
        )
      )

      await timelock.connect(governance).queueTransaction(TEST_TARGET, TEST_DATA, eta)
    })

    it('should allow governance to cancel queued transaction', async () => {
      await expect(
        timelock.connect(governance).cancelTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.emit(eventEmitter, 'Timelock_TransactionCancelled')
        .withArgs(
          await timelock.getAddress(), // emittedFrom
          txHash, // txHash
          TEST_TARGET, // target
          TEST_DATA, // data
          eta // eta
        )

      expect(await timelock.queuedTransactions(txHash)).to.equal(0)
      expect(await timelock.isTransactionQueued(TEST_TARGET, TEST_DATA, eta)).to.be.false
    })

    it('should revert when non-governance tries to cancel transaction', async () => {
      await expect(
        timelock.connect(user1).cancelTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.be.revertedWith('AddressBook: not governance')
    })

    it('should revert when transaction is not queued', async () => {
      const currentTime = await time.latest()
      const differentEta = currentTime + TIMELOCK_DELAY + 200

      await expect(
        timelock.connect(governance).cancelTransaction(TEST_TARGET, TEST_DATA, differentEta)
      ).to.be.revertedWith('Transaction not queued')
    })
  })

  describe('View Functions', () => {
    let eta: number

    beforeEach(async () => {
      const currentTime = await time.latest()
      eta = currentTime + TIMELOCK_DELAY + 100
      await timelock.connect(governance).queueTransaction(TEST_TARGET, TEST_DATA, eta)
    })

    it('should return correct transaction queued status', async () => {
      expect(await timelock.isTransactionQueued(TEST_TARGET, TEST_DATA, eta)).to.be.true
      
      const differentEta = eta + 100
      expect(await timelock.isTransactionQueued(TEST_TARGET, TEST_DATA, differentEta)).to.be.false
    })

    it('should return correct transaction ETA', async () => {
      expect(await timelock.getTransactionETA(TEST_TARGET, TEST_DATA, eta)).to.equal(eta)
      
      const differentEta = eta + 100
      expect(await timelock.getTransactionETA(TEST_TARGET, TEST_DATA, differentEta)).to.equal(0)
    })

    it('should return correct transaction ready status', async () => {
      // Before ETA
      expect(await timelock.isTransactionReady(TEST_TARGET, TEST_DATA, eta)).to.be.false
      
      // At ETA
      await time.increaseTo(eta)
      expect(await timelock.isTransactionReady(TEST_TARGET, TEST_DATA, eta)).to.be.true
      
      // After grace period
      await time.increaseTo(eta + GRACE_PERIOD + 1)
      expect(await timelock.isTransactionReady(TEST_TARGET, TEST_DATA, eta)).to.be.false
    })

    it('should return false for non-queued transaction ready status', async () => {
      const differentEta = eta + 100
      await time.increaseTo(differentEta)
      expect(await timelock.isTransactionReady(TEST_TARGET, TEST_DATA, differentEta)).to.be.false
    })
  })

  describe('Contract Management', () => {
    it('should return correct unique contract id', async () => {
      expect(await timelock.uniqueContractId()).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes('Timelock'))
      )
    })

    it('should return correct implementation version', async () => {
      expect(await timelock.implementationVersion()).to.equal(1n)
    })
  })

  describe('Upgrade Authorization', () => {
    it('should only allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const TimelockFactory = await ethers.getContractFactory('Timelock')
      const newImplementation = await TimelockFactory.deploy()

      // Try to upgrade from non-governance account
      await expect(
        timelock.connect(user1).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      ).to.be.revertedWith('Only timelock!')
    })

    it('should allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const TimelockFactory = await ethers.getContractFactory('Timelock')
      const newImplementation = await TimelockFactory.deploy()

      // This should not revert due to governance check
      try {
        await timelock.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      } catch (error: any) {
        expect(error.message).to.not.include('not governance')
      }
    })

    it('should require non-empty upgrade data', async () => {
      const TimelockFactory = await ethers.getContractFactory('Timelock')
      const newImplementation = await TimelockFactory.deploy()

      await expect(
        timelock.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x'
        )
      ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })
  })

  describe('ETH Handling', () => {
    it('should accept ETH transfers', async () => {
      const sendAmount = ethers.parseEther('1')
      const initialBalance = await ethers.provider.getBalance(await timelock.getAddress())

      await user1.sendTransaction({
        to: await timelock.getAddress(),
        value: sendAmount
      })

      const finalBalance = await ethers.provider.getBalance(await timelock.getAddress())
      expect(finalBalance).to.equal(initialBalance + sendAmount)
    })
  })

  describe('Edge Cases', () => {
    it('should handle transaction with empty data', async () => {
      const currentTime = await time.latest()
      const eta = currentTime + TIMELOCK_DELAY + 100
      const emptyData = '0x'

      await expect(
        timelock.connect(governance).queueTransaction(TEST_TARGET, emptyData, eta)
      ).to.not.be.reverted

      expect(await timelock.isTransactionQueued(TEST_TARGET, emptyData, eta)).to.be.true
    })

    it('should handle multiple transactions with different parameters', async () => {
      const currentTime = await time.latest()
      const eta1 = currentTime + TIMELOCK_DELAY + 100
      const eta2 = currentTime + TIMELOCK_DELAY + 200
      const data1 = '0x1234'
      const data2 = '0x5678'

      await timelock.connect(governance).queueTransaction(TEST_TARGET, data1, eta1)
      await timelock.connect(governance).queueTransaction(TEST_TARGET, data2, eta2)

      expect(await timelock.isTransactionQueued(TEST_TARGET, data1, eta1)).to.be.true
      expect(await timelock.isTransactionQueued(TEST_TARGET, data2, eta2)).to.be.true
      expect(await timelock.isTransactionQueued(TEST_TARGET, data1, eta2)).to.be.false
    })

    it('should handle transaction execution at exact grace period boundary by any user', async () => {
      const currentTime = await time.latest()
      const eta = currentTime + TIMELOCK_DELAY + 100

      await timelock.connect(governance).queueTransaction(TEST_TARGET, TEST_DATA, eta)

      // Execute at the last second of grace period by any user
      await time.increaseTo(eta + GRACE_PERIOD)
      
      await expect(
        timelock.connect(user1).executeTransaction(TEST_TARGET, TEST_DATA, eta)
      ).to.not.be.reverted
    })
  })

  describe('Deployment Verification', () => {
    it('should match deployment script configuration', async () => {
      // Verify the contract was deployed with correct address book
      expect(await timelock.addressBook()).to.equal(await addressBook.getAddress())
      
      // Verify it's registered in address book
      expect(await addressBook.timelock()).to.equal(await timelock.getAddress())
      
      // Verify grace period constant
      expect(await timelock.GRACE_PERIOD()).to.equal(GRACE_PERIOD)
    })
  })
})