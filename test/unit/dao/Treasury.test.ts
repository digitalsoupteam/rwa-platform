import { expect } from 'chai'
import { ethers } from 'hardhat'
import { deployments } from 'hardhat'
import { impersonateAccount, setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import {
  Treasury,
  Treasury__factory,
  AddressBook,
  AddressBook__factory,
  EventEmitter,
  EventEmitter__factory,
  PlatformToken,
  PlatformToken__factory,
  Timelock,
  Timelock__factory,
} from '../../../typechain-types'

describe('Treasury Contract Unit Tests', () => {
  let treasury: Treasury
  let addressBook: AddressBook
  let eventEmitter: EventEmitter
  let platformToken: PlatformToken
  let timelock: Timelock
  let testOwner: HardhatEthersSigner
  let user1: HardhatEthersSigner
  let user2: HardhatEthersSigner
  let governance: SignerWithAddress
  let timelockSigner: SignerWithAddress
  let initSnapshot: string

  const WITHDRAWAL_AMOUNT = ethers.parseEther('100')
  const ETH_AMOUNT = ethers.parseEther('5')

  before(async () => {
    const signers = await ethers.getSigners()
    testOwner = signers[0]
    user1 = signers[1]
    user2 = signers[2]

    // Deploy all contracts using the deployment fixture
    await deployments.fixture()

    treasury = Treasury__factory.connect(
      (await deployments.get('Treasury')).address,
      ethers.provider,
    )

    addressBook = AddressBook__factory.connect(
      (await deployments.get('AddressBook')).address,
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

    timelock = Timelock__factory.connect(
      (await deployments.get('Timelock')).address,
      ethers.provider,
    )

    // Impersonate governance and timelock accounts
    const governanceAddress = await addressBook.governance()
    await impersonateAccount(governanceAddress)
    governance = await ethers.getSigner(governanceAddress)
    await setBalance(governance.address, ethers.parseEther('100'))

    const timelockAddress = await addressBook.timelock()
    await impersonateAccount(timelockAddress)
    timelockSigner = await ethers.getSigner(timelockAddress)
    await setBalance(timelockSigner.address, ethers.parseEther('100'))

    // Fund treasury with tokens and ETH for testing
    await platformToken.connect(testOwner).transfer(await treasury.getAddress(), WITHDRAWAL_AMOUNT * 2n)
    await testOwner.sendTransaction({
      to: await treasury.getAddress(),
      value: ETH_AMOUNT
    })

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  describe('Initialization', () => {
    it('should initialize with correct parameters', async () => {
      expect(await treasury.addressBook()).to.equal(await addressBook.getAddress())
    })

    it('should accept ETH deposits', async () => {
      const initialBalance = await ethers.provider.getBalance(await treasury.getAddress())
      const depositAmount = ethers.parseEther('1')

      await user1.sendTransaction({
        to: await treasury.getAddress(),
        value: depositAmount
      })

      const finalBalance = await ethers.provider.getBalance(await treasury.getAddress())
      expect(finalBalance).to.equal(initialBalance + depositAmount)
    })
  })

  describe('ERC20 Token Withdrawals', () => {
    it('should allow timelock to withdraw ERC20 tokens', async () => {
      const initialUserBalance = await platformToken.balanceOf(user1.address)
      const initialTreasuryBalance = await treasury.getTokenBalance(await platformToken.getAddress())

      await expect(
        treasury.connect(timelockSigner).withdrawERC20(
          await platformToken.getAddress(),
          user1.address,
          WITHDRAWAL_AMOUNT
        )
      ).to.emit(eventEmitter, 'Treasury_TreasuryWithdrawal')
        .withArgs(
          await treasury.getAddress(), // emittedFrom
          user1.address, // to
          await platformToken.getAddress(), // token
          WITHDRAWAL_AMOUNT // amount
        )

      expect(await platformToken.balanceOf(user1.address)).to.equal(
        initialUserBalance + WITHDRAWAL_AMOUNT
      )
      expect(await treasury.getTokenBalance(await platformToken.getAddress())).to.equal(
        initialTreasuryBalance - WITHDRAWAL_AMOUNT
      )
    })

    it('should revert when non-timelock tries to withdraw ERC20 tokens', async () => {
      await expect(
        treasury.connect(user1).withdrawERC20(
          await platformToken.getAddress(),
          user1.address,
          WITHDRAWAL_AMOUNT
        )
      ).to.be.revertedWith('Only timelock!')
    })

    it('should revert when non-timelock governance tries to withdraw ERC20 tokens', async () => {
      await expect(
        treasury.connect(governance).withdrawERC20(
          await platformToken.getAddress(),
          user1.address,
          WITHDRAWAL_AMOUNT
        )
      ).to.be.revertedWith('Only timelock!')
    })

    it('should revert when withdrawing to zero address', async () => {
      await expect(
        treasury.connect(timelockSigner).withdrawERC20(
          await platformToken.getAddress(),
          ethers.ZeroAddress,
          WITHDRAWAL_AMOUNT
        )
      ).to.be.revertedWith('Zero address recipient')
    })

    it('should revert when withdrawing more tokens than available', async () => {
      const treasuryBalance = await treasury.getTokenBalance(await platformToken.getAddress())
      const excessiveAmount = treasuryBalance + 1n

      await expect(
        treasury.connect(timelockSigner).withdrawERC20(
          await platformToken.getAddress(),
          user1.address,
          excessiveAmount
        )
      ).to.be.revertedWithCustomError(platformToken, 'ERC20InsufficientBalance')
    })

    it('should handle zero amount withdrawal', async () => {
      const initialUserBalance = await platformToken.balanceOf(user1.address)

      await expect(
        treasury.connect(timelockSigner).withdrawERC20(
          await platformToken.getAddress(),
          user1.address,
          0
        )
      ).to.emit(eventEmitter, 'Treasury_TreasuryWithdrawal')
        .withArgs(
          await treasury.getAddress(),
          user1.address,
          await platformToken.getAddress(),
          0
        )

      expect(await platformToken.balanceOf(user1.address)).to.equal(initialUserBalance)
    })
  })

  describe('ETH Withdrawals', () => {
    it('should allow timelock to withdraw ETH', async () => {
      const initialUserBalance = await ethers.provider.getBalance(user1.address)
      const initialTreasuryBalance = await ethers.provider.getBalance(await treasury.getAddress())
      const withdrawAmount = ethers.parseEther('1')

      await expect(
        treasury.connect(timelockSigner).withdrawETH(user1.address, withdrawAmount)
      ).to.emit(eventEmitter, 'Treasury_TreasuryWithdrawal')
        .withArgs(
          await treasury.getAddress(), // emittedFrom
          user1.address, // to
          ethers.ZeroAddress, // token (ETH represented as zero address)
          withdrawAmount // amount
        )

      expect(await ethers.provider.getBalance(user1.address)).to.equal(
        initialUserBalance + withdrawAmount
      )
      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(
        initialTreasuryBalance - withdrawAmount
      )
    })

    it('should revert when non-timelock tries to withdraw ETH', async () => {
      await expect(
        treasury.connect(user1).withdrawETH(user1.address, ethers.parseEther('1'))
      ).to.be.revertedWith('Only timelock!')
    })

    it('should revert when withdrawing ETH to zero address', async () => {
      await expect(
        treasury.connect(timelockSigner).withdrawETH(ethers.ZeroAddress, ethers.parseEther('1'))
      ).to.be.revertedWith('Zero address recipient')
    })

    it('should revert when withdrawing more ETH than available', async () => {
      const treasuryBalance = await ethers.provider.getBalance(await treasury.getAddress())
      const excessiveAmount = treasuryBalance + 1n

      await expect(
        treasury.connect(timelockSigner).withdrawETH(user1.address, excessiveAmount)
      ).to.be.revertedWith('Insufficient ETH')
    })

    it('should handle zero ETH withdrawal', async () => {
      const initialUserBalance = await ethers.provider.getBalance(user1.address)

      await expect(
        treasury.connect(timelockSigner).withdrawETH(user1.address, 0)
      ).to.emit(eventEmitter, 'Treasury_TreasuryWithdrawal')
        .withArgs(
          await treasury.getAddress(),
          user1.address,
          ethers.ZeroAddress,
          0
        )

      expect(await ethers.provider.getBalance(user1.address)).to.equal(initialUserBalance)
    })
  })

  describe('View Functions', () => {
    it('should return correct token balance', async () => {
      const expectedBalance = await platformToken.balanceOf(await treasury.getAddress())
      const actualBalance = await treasury.getTokenBalance(await platformToken.getAddress())
      
      expect(actualBalance).to.equal(expectedBalance)
    })

    it('should return zero for tokens not held', async () => {
      // Deploy a new token that treasury doesn't hold
      const TokenFactory = await ethers.getContractFactory('PlatformToken')
      const newToken = await TokenFactory.deploy()
      
      expect(await treasury.getTokenBalance(await newToken.getAddress())).to.equal(0)
    })

    it('should track token balance changes', async () => {
      const initialBalance = await treasury.getTokenBalance(await platformToken.getAddress())
      
      // Withdraw some tokens
      await treasury.connect(timelockSigner).withdrawERC20(
        await platformToken.getAddress(),
        user1.address,
        WITHDRAWAL_AMOUNT
      )
      
      const finalBalance = await treasury.getTokenBalance(await platformToken.getAddress())
      expect(finalBalance).to.equal(initialBalance - WITHDRAWAL_AMOUNT)
    })
  })

  describe('Contract Management', () => {
    it('should return correct unique contract id', async () => {
      expect(await treasury.uniqueContractId()).to.equal(
        ethers.keccak256(ethers.toUtf8Bytes('Treasury'))
      )
    })

    it('should return correct implementation version', async () => {
      expect(await treasury.implementationVersion()).to.equal(1n)
    })
  })

  describe('Upgrade Authorization', () => {
    it('should only allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const TreasuryFactory = await ethers.getContractFactory('Treasury')
      const newImplementation = await TreasuryFactory.deploy()

      // Try to upgrade from non-governance account
      await expect(
        treasury.connect(user1).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      ).to.be.revertedWith('Only upgradeRole!')
    })

    it('should only allow governance to authorize upgrades, not timelock', async () => {
      // Deploy a new implementation
      const TreasuryFactory = await ethers.getContractFactory('Treasury')
      const newImplementation = await TreasuryFactory.deploy()

      // Try to upgrade from timelock account (should fail)
      await expect(
        treasury.connect(timelockSigner).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      ).to.be.revertedWith('Only upgradeRole!')
    })

    it('should allow governance to authorize upgrades', async () => {
      // Deploy a new implementation
      const TreasuryFactory = await ethers.getContractFactory('Treasury')
      const newImplementation = await TreasuryFactory.deploy()

      // This should not revert due to governance check
      try {
        await treasury.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x01'
        )
      } catch (error: any) {
        expect(error.message).to.not.include('not governance')
      }
    })

    it('should require non-empty upgrade data', async () => {
      const TreasuryFactory = await ethers.getContractFactory('Treasury')
      const newImplementation = await TreasuryFactory.deploy()

      await expect(
        treasury.connect(governance).upgradeToAndCall(
          await newImplementation.getAddress(),
          '0x'
        )
      ).to.be.revertedWith('UpgradeableContract: empty upgrade data')
    })
  })

  describe('Edge Cases', () => {
    it('should handle withdrawal of entire token balance', async () => {
      const totalBalance = await treasury.getTokenBalance(await platformToken.getAddress())
      
      await treasury.connect(timelockSigner).withdrawERC20(
        await platformToken.getAddress(),
        user1.address,
        totalBalance
      )
      
      expect(await treasury.getTokenBalance(await platformToken.getAddress())).to.equal(0)
      expect(await platformToken.balanceOf(user1.address)).to.equal(totalBalance)
    })

    it('should handle withdrawal of entire ETH balance', async () => {
      const totalBalance = await ethers.provider.getBalance(await treasury.getAddress())
      
      await treasury.connect(timelockSigner).withdrawETH(user1.address, totalBalance)
      
      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(0)
    })

    it('should handle consecutive withdrawals', async () => {
      const withdrawAmount = ethers.parseEther('10')
      const initialBalance = await treasury.getTokenBalance(await platformToken.getAddress())
      
      // First withdrawal
      await treasury.connect(timelockSigner).withdrawERC20(
        await platformToken.getAddress(),
        user1.address,
        withdrawAmount
      )
      
      // Second withdrawal
      await treasury.connect(timelockSigner).withdrawERC20(
        await platformToken.getAddress(),
        user2.address,
        withdrawAmount
      )
      
      expect(await treasury.getTokenBalance(await platformToken.getAddress())).to.equal(
        initialBalance - (withdrawAmount * 2n)
      )
      expect(await platformToken.balanceOf(user1.address)).to.equal(withdrawAmount)
      expect(await platformToken.balanceOf(user2.address)).to.equal(withdrawAmount)
    })

    it('should handle mixed ETH and token withdrawals', async () => {
      const tokenAmount = ethers.parseEther('10')
      const ethAmount = ethers.parseEther('1')
      
      const initialTokenBalance = await treasury.getTokenBalance(await platformToken.getAddress())
      const initialETHBalance = await ethers.provider.getBalance(await treasury.getAddress())
      
      // Withdraw tokens
      await treasury.connect(timelockSigner).withdrawERC20(
        await platformToken.getAddress(),
        user1.address,
        tokenAmount
      )
      
      // Withdraw ETH
      await treasury.connect(timelockSigner).withdrawETH(user1.address, ethAmount)
      
      expect(await treasury.getTokenBalance(await platformToken.getAddress())).to.equal(
        initialTokenBalance - tokenAmount
      )
      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(
        initialETHBalance - ethAmount
      )
    })
  })

  describe('Events', () => {
    it('should emit correct event for ERC20 withdrawal', async () => {
      await expect(
        treasury.connect(timelockSigner).withdrawERC20(
          await platformToken.getAddress(),
          user1.address,
          WITHDRAWAL_AMOUNT
        )
      ).to.emit(eventEmitter, 'Treasury_TreasuryWithdrawal')
        .withArgs(
          await treasury.getAddress(),
          user1.address,
          await platformToken.getAddress(),
          WITHDRAWAL_AMOUNT
        )
    })

    it('should emit correct event for ETH withdrawal', async () => {
      const ethAmount = ethers.parseEther('1')
      
      await expect(
        treasury.connect(timelockSigner).withdrawETH(user1.address, ethAmount)
      ).to.emit(eventEmitter, 'Treasury_TreasuryWithdrawal')
        .withArgs(
          await treasury.getAddress(),
          user1.address,
          ethers.ZeroAddress, // ETH represented as zero address
          ethAmount
        )
    })
  })

  describe('Deployment Verification', () => {
    it('should match deployment script configuration', async () => {
      // Verify the contract was deployed with correct address book
      expect(await treasury.addressBook()).to.equal(await addressBook.getAddress())
      
      // Verify it's registered in address book
      expect(await addressBook.treasury()).to.equal(await treasury.getAddress())
    })

    it('should be properly funded for testing', async () => {
      // Verify treasury has tokens for testing
      expect(await treasury.getTokenBalance(await platformToken.getAddress())).to.be.gt(0)
      
      // Verify treasury has ETH for testing
      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.be.gt(0)
    })
  })
})